import hashlib
import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, SessionLocal, engine
from security import authenticate_user, create_access_token, get_current_admin
from services.blockchain_service import (
    sync_student_to_blockchain,
    verify_student_on_blockchain,
)
from services.email_service import (
    notify_admin_new_certificate_request,
    notify_requester_certificate_approved,
    notify_requester_certificate_rejected,
    send_certificate_request_otp as send_certificate_request_otp_email,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Graduation Verification API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def now_utc():
    return datetime.now(timezone.utc)


def validate_unique_student_fields(
    db: Session,
    student_data,
    current_student_id: str | None = None,
):
    existing_student = crud.get_student(db, student_data.student_id)

    if existing_student and existing_student.student_id != current_student_id:
        raise HTTPException(
            status_code=409,
            detail="Student already exists",
        )

    existing_degree = crud.get_student_by_degree_id(
        db,
        student_data.degree_id,
    )

    if existing_degree and existing_degree.student_id != current_student_id:
        raise HTTPException(
            status_code=409,
            detail="Degree already exists",
        )

    citizen_id = getattr(student_data, "citizen_id", None)

    if citizen_id:
        citizen_id_hash = crud.calculate_citizen_id_hash(
            citizen_id
        )
    else:
        citizen_id_hash = getattr(
            student_data,
            "citizen_id_hash",
            None,
        )

    existing_citizen = crud.get_student_by_citizen_id_hash(
        db,
        citizen_id_hash,
    )

    if existing_citizen and existing_citizen.student_id != current_student_id:
        raise HTTPException(
            status_code=409,
            detail="Citizen ID already exists",
        )

@app.get("/")
def root():
    return {"message": "Graduation Verification API is running"}


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(
    login_data: schemas.LoginRequest,
    db: Session = Depends(get_db),
):
    user = authenticate_user(
        db=db,
        username=login_data.username,
        password=login_data.password,
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    user.last_login = now_utc()
    db.commit()

    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role,
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@app.get("/api/admin/stats", response_model=schemas.StatsResponse)
def admin_stats(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.get_stats(db)

@app.get(
    "/api/admin/audit-logs",
    response_model=schemas.AuditLogListResponse,
)
def admin_list_audit_logs(
    username: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.list_audit_logs(
        db=db,
        username=username,
        action=action,
        entity_type=entity_type,
        search=search,
        page=page,
        page_size=page_size,
    )

@app.get("/api/admin/students", response_model=schemas.StudentListResponse)
def admin_list_students(
    search: str | None = None,
    graduation_status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.list_students(
        db=db,
        search=search,
        graduation_status=graduation_status,
        page=page,
        page_size=page_size,
    )


@app.post("/api/admin/students", response_model=schemas.StudentResponse)
def admin_create_student(
    student_data: schemas.StudentCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    validate_unique_student_fields(db, student_data)

    student = crud.create_student(
        db=db,
        student_data=student_data,
        updated_by=current_admin.username,
        commit=False,
    )

    try:
        record = sync_student_to_blockchain(student)
    except Exception:
        db.rollback()

        logger.exception(
            "Blockchain sync failed when creating student %s",
            student.student_id,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to complete blockchain synchronization. "
                "No student data was saved."
            ),
        )

    student.metadata_hash = record.metadata_hash
    student.blockchain_tx_id = record.tx_id
    student.is_mismatch = False
    student.approval_status = "APPROVED"
    student.approved_by = current_admin.username
    student.approved_at = now_utc()
    student.updated_by = current_admin.username

    crud.create_audit_log(
        db=db,
        username=current_admin.username,
        action="CREATE_STUDENT",
        entity_type="Student",
        entity_id=student.student_id,
        details="Student created and synchronized with blockchain.",
        commit=False,
    )

    try:
        db.commit()
        db.refresh(student)
    except Exception:
        db.rollback()

        logger.critical(
            "Fabric synced student %s but MySQL commit failed. Fabric tx: %s",
            student.student_id,
            record.tx_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Database could not save the synchronized student record.",
        )

    logger.info(
        "Student %s created and synced to blockchain by %s",
        student.student_id,
        current_admin.username,
    )

    return student


@app.put(
    "/api/admin/students/{student_id}",
    response_model=schemas.StudentResponse,
)
def admin_update_student(
    student_id: str,
    student_data: schemas.StudentUpdate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    update_data = student_data.model_dump(exclude_unset=True)

    if "degree_id" in update_data:
        existing_degree = crud.get_student_by_degree_id(
            db,
            update_data["degree_id"],
        )

        if existing_degree and existing_degree.student_id != student_id:
            raise HTTPException(
                status_code=409,
                detail="Degree already exists",
            )

    if "citizen_id" in update_data:
        citizen_id_hash = crud.calculate_citizen_id_hash(
            update_data["citizen_id"]
        )
    else:
        citizen_id_hash = update_data.get("citizen_id_hash")

    if citizen_id_hash:
        existing_citizen = crud.get_student_by_citizen_id_hash(
            db,
            citizen_id_hash,
        )

        if existing_citizen and existing_citizen.student_id != student_id:
            raise HTTPException(
                status_code=409,
                detail="Citizen ID already exists",
            )

    updated_student = crud.update_student(
        db=db,
        student=student,
        student_data=student_data,
        updated_by=current_admin.username,
        sync_hash=True,
        commit=False,
    )

    try:
        record = sync_student_to_blockchain(updated_student)
    except Exception:
        db.rollback()

        logger.exception(
            "Blockchain sync failed when updating student %s",
            student_id,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to complete blockchain synchronization. "
                "No student data was changed."
            ),
        )

    updated_student.metadata_hash = record.metadata_hash
    updated_student.blockchain_tx_id = record.tx_id
    updated_student.is_mismatch = False
    updated_student.approval_status = "APPROVED"
    updated_student.approved_by = current_admin.username
    updated_student.approved_at = now_utc()
    updated_student.updated_by = current_admin.username

    crud.create_audit_log(
        db=db,
        username=current_admin.username,
        action="UPDATE_STUDENT",
        entity_type="Student",
        entity_id=updated_student.student_id,
        details="Student updated and synchronized with blockchain.",
        commit=False,
    )

    try:
        db.commit()
        db.refresh(updated_student)
    except Exception:
        db.rollback()

        logger.critical(
            "Fabric synced student %s but MySQL commit failed. Fabric tx: %s",
            student_id,
            record.tx_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Database could not save the synchronized student record.",
        )

    logger.info(
        "Student %s updated and synced to blockchain by %s",
        student_id,
        current_admin.username,
    )

    return updated_student


@app.get("/api/admin/students/{student_id}", response_model=schemas.StudentResponse)
def admin_get_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    return student



@app.delete("/api/admin/students/{student_id}")
def admin_delete_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    try:
        crud.delete_student(
            db=db,
            student=student,
            deleted_by=current_admin.username,
            commit=False,
        )

        crud.create_audit_log(
            db=db,
            username=current_admin.username,
            action="DELETE_STUDENT",
            entity_type="Student",
            entity_id=student.student_id,
            details="Student soft-deleted.",
            commit=False,
        )

        db.commit()
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to soft-delete student %s",
            student_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to delete student",
        )

    logger.info(
        "Student %s soft-deleted by %s",
        student_id,
        current_admin.username,
    )

    return {
        "message": "Student deleted",
        "student_id": student_id,
    }

@app.post(
    "/api/admin/students/{student_id}/restore",
    response_model=schemas.StudentResponse,
)
def admin_restore_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_deleted_student(db, student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Deleted student not found",
        )

    try:
        restored_student = crud.restore_student(
            db=db,
            student=student,
            commit=False,
        )

        crud.create_audit_log(
            db=db,
            username=current_admin.username,
            action="RESTORE_STUDENT",
            entity_type="Student",
            entity_id=restored_student.student_id,
            details="Student restored from soft delete.",
            commit=False,
        )

        db.commit()
        db.refresh(restored_student)
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to restore student %s",
            student_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to restore student",
        )

    logger.info(
        "Student %s restored by %s",
        student_id,
        current_admin.username,
    )

    return restored_student




@app.post(
    "/api/external-requests",
    response_model=schemas.ExternalRequestResponse,
)
def create_external_request(
    request_data: schemas.ExternalRequestCreate,
    db: Session = Depends(get_db),
):
    external_request = crud.create_external_request(
        db=db,
        request_data=request_data,
    )

    logger.info(
        "External request %s created for student %s",
        external_request.id,
        external_request.student_id,
    )

    return external_request


@app.get(
    "/api/admin/external-requests",
    response_model=schemas.ExternalRequestListResponse,
)
def admin_list_external_requests(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.list_external_requests(
        db=db,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )


@app.post(
    "/api/admin/external-requests/{request_id}/reject",
    response_model=schemas.ExternalRequestResponse,
)
def admin_reject_external_request(
    request_id: int,
    reject_data: schemas.ExternalRequestReject,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    external_request = crud.get_external_request(db, request_id)

    if not external_request:
        raise HTTPException(
            status_code=404,
            detail="External request not found",
        )

    if external_request.status != "PENDING_REVIEW":
        raise HTTPException(
            status_code=400,
            detail="External request has already been reviewed",
        )

    try:
        updated_request = crud.reject_external_request(
            db=db,
            external_request=external_request,
            reject_reason=reject_data.reject_reason,
            reviewed_by=current_admin.username,
            commit=False,
        )

        crud.create_audit_log(
            db=db,
            username=current_admin.username,
            action="REJECT_EXTERNAL_REQUEST",
            entity_type="ExternalRequest",
            entity_id=updated_request.id,
            details=(
                f"External request rejected for student "
                f"{updated_request.student_id}."
            ),
            commit=False,
        )

        db.commit()
        db.refresh(updated_request)
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to reject external request %s",
            request_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save external request rejection.",
        )

    logger.info(
        "External request %s rejected by %s",
        request_id,
        current_admin.username,
    )

    return updated_request


@app.post(
    "/api/admin/external-requests/{request_id}/approve",
    response_model=schemas.ExternalRequestResponse,
)
def admin_approve_external_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    external_request = crud.get_external_request(db, request_id)

    if not external_request:
        raise HTTPException(
            status_code=404,
            detail="External request not found",
        )

    if external_request.status != "PENDING_REVIEW":
        raise HTTPException(
            status_code=400,
            detail="External request has already been reviewed",
        )

    existing_student = crud.get_student(
        db,
        external_request.student_id,
    )

    if existing_student:
        raise HTTPException(
            status_code=409,
            detail="Student already exists",
        )

    citizen_id_hash = hashlib.sha256(
        (
            f"external-request-{external_request.id}-"
            f"{external_request.student_id}"
        ).encode("utf-8")
    ).hexdigest()

    # Du lieu tam thoi khi chua co nguon du lieu chinh thuc cua truong.
    student_data = schemas.StudentCreate(
        student_id=external_request.student_id,
        full_name=external_request.full_name or "Unknown",
        date_of_birth=date(2002, 5, 10),
        citizen_id_hash=citizen_id_hash,
        email=f"{external_request.student_id.lower()}@fpt.edu.vn",
        institution_code="FPTU",
        institution_name="FPT University",
        faculty_name="Information Technology",
        major="Software Engineering",
        training_mode="Full-time",
        degree_id=(
            f"DEGREE"
            f"{external_request.student_id.replace('SV', '')}"
        ),
        degree_type="Bachelor",
        graduation_status=(
            external_request.graduation_status
            or "GRADUATED"
        ),
        graduation_date=date(2026, 6, 1),
        graduation_year=2026,
        classification="Good",
        gpa=external_request.gpa,
        total_credits=145,
        entrance_year=2022,
    )

    validate_unique_student_fields(db, student_data)

    student = crud.create_student(
        db=db,
        student_data=student_data,
        updated_by=current_admin.username,
        commit=False,
    )

    try:
        record = sync_student_to_blockchain(student)
    except Exception:
        db.rollback()

        logger.exception(
            "Blockchain sync failed when approving external request %s",
            request_id,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to complete blockchain synchronization. "
                "No student data was saved."
            ),
        )

    student.metadata_hash = record.metadata_hash
    student.blockchain_tx_id = record.tx_id
    student.is_mismatch = False
    student.approval_status = "APPROVED"
    student.approved_by = current_admin.username
    student.approved_at = now_utc()
    student.updated_by = current_admin.username

    updated_request = crud.approve_external_request(
        db=db,
        external_request=external_request,
        reviewed_by=current_admin.username,
        commit=False,
    )

    crud.create_audit_log(
        db=db,
        username=current_admin.username,
        action="APPROVE_EXTERNAL_REQUEST",
        entity_type="ExternalRequest",
        entity_id=updated_request.id,
        details=(
            f"External request approved and student "
            f"{student.student_id} synchronized with blockchain."
        ),
        commit=False,
    )

    try:
        db.commit()
        db.refresh(student)
        db.refresh(updated_request)
    except Exception:
        db.rollback()

        logger.critical(
            "Fabric synced external request %s, "
            "but MySQL commit failed.",
            request_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Database could not save the approved request.",
        )

    logger.info(
        "External request %s approved by %s; "
        "student %s created and synchronized",
        request_id,
        current_admin.username,
        student.student_id,
    )

    return updated_request

@app.post(
    "/api/certificate-requests/otp/send",
    response_model=schemas.CertificateOtpSendResponse,
)
def send_certificate_request_otp(
    otp_data: schemas.CertificateOtpSendRequest,
    db: Session = Depends(get_db),
):
    student = crud.get_student(db, otp_data.student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    if student.graduation_status != "GRADUATED":
        raise HTTPException(
            status_code=400,
            detail="Student has not graduated yet",
        )

    if crud.has_recent_certificate_otp(
        db=db,
        student_id=otp_data.student_id,
        requester_email=otp_data.requester_email,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait 60 seconds before requesting another OTP",
        )

    otp_code = crud.generate_certificate_otp()
    expires_at = crud.get_certificate_otp_expiration()

    verification = crud.create_certificate_email_verification(
        db=db,
        student_id=otp_data.student_id,
        requester_email=otp_data.requester_email,
        otp_code=otp_code,
        expires_at=expires_at,
    )

    try:
        send_certificate_request_otp_email(
            requester_email=otp_data.requester_email,
            student_id=otp_data.student_id,
            otp_code=otp_code,
        )
    except Exception:
        try:
            db.delete(verification)
            db.commit()
        except Exception:
            db.rollback()

        logger.exception(
            "Failed to send certificate OTP for student %s",
            otp_data.student_id,
        )

        raise HTTPException(
            status_code=503,
            detail="Unable to send OTP email. Please try again later.",
        )

    return schemas.CertificateOtpSendResponse(
        message="OTP has been sent to your email",
        expires_in_seconds=crud.OTP_EXPIRY_MINUTES * 60,
    )


@app.post(
    "/api/certificate-requests/otp/verify",
    response_model=schemas.CertificateOtpVerifyResponse,
)
def verify_certificate_request_otp(
    otp_data: schemas.CertificateOtpVerifyRequest,
    db: Session = Depends(get_db),
):
    verification, verification_token, error_code = (
        crud.verify_certificate_email_otp(
            db=db,
            student_id=otp_data.student_id,
            requester_email=otp_data.requester_email,
            otp_code=otp_data.otp_code,
        )
    )

    error_details = {
        "OTP_NOT_FOUND": (
            status.HTTP_400_BAD_REQUEST,
            "OTP was not found. Please request a new OTP.",
        ),
        "OTP_EXPIRED": (
            status.HTTP_400_BAD_REQUEST,
            "OTP has expired. Please request a new OTP.",
        ),
        "OTP_TOO_MANY_ATTEMPTS": (
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many incorrect OTP attempts. Please request a new OTP.",
        ),
        "OTP_INVALID": (
            status.HTTP_400_BAD_REQUEST,
            "OTP is incorrect",
        ),
    }

    if error_code:
        status_code, detail = error_details[error_code]
        raise HTTPException(
            status_code=status_code,
            detail=detail,
        )

    return schemas.CertificateOtpVerifyResponse(
        message="Email verified successfully",
        email_verification_token=verification_token,
        expires_at=verification.expires_at,
    )


@app.post(
    "/api/certificate-requests",
    response_model=schemas.CertificateRequestResponse,
)
def create_certificate_request(
    request_data: schemas.CertificateRequestCreate,
    db: Session = Depends(get_db),
):
    student = crud.get_student(db, request_data.student_id)

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    if student.graduation_status != "GRADUATED":
        raise HTTPException(
            status_code=400,
            detail="Student has not graduated yet",
        )

    if not student.blockchain_tx_id:
        raise HTTPException(
            status_code=400,
            detail="Student has not been verified on blockchain yet",
        )

    try:
        fabric_result = verify_student_on_blockchain(student)
    except Exception:
        logger.exception(
            "Blockchain verification failed for certificate request"
        )
        raise HTTPException(
            status_code=503,
            detail="Blockchain verification is unavailable",
        )

    verification_status = fabric_result["verification_status"]
    is_mismatch = verification_status == "Mismatch"

    if student.is_mismatch != is_mismatch:
        student.is_mismatch = is_mismatch
        db.commit()
        db.refresh(student)

    if verification_status != "Verified":
        raise HTTPException(
            status_code=409,
            detail=(
                "Student data is not verified on blockchain. "
                "Cannot create certificate request."
            ),
        )

    email_verification = crud.consume_certificate_email_verification(
        db=db,
        student_id=request_data.student_id,
        requester_email=request_data.requester_email,
        verification_token=request_data.email_verification_token,
        commit=False,
    )

    if not email_verification:
        raise HTTPException(
            status_code=400,
            detail=(
                "Email has not been verified or the verification token "
                "has expired."
            ),
        )

    try:
        certificate_request = crud.create_certificate_request(
            db=db,
            request_data=request_data,
            commit=False,
        )

        db.commit()
        db.refresh(certificate_request)
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to create certificate request for student %s",
            request_data.student_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to create certificate request.",
        )

    logger.info(
        "Certificate request %s created for student %s",
        certificate_request.id,
        certificate_request.student_id,
    )

    try:
        notify_admin_new_certificate_request(
            request_id=certificate_request.id,
            student_id=certificate_request.student_id,
            requester_name=certificate_request.requester_name,
        )
    except Exception:
        logger.exception(
            "Failed to notify admin for certificate request %s",
            certificate_request.id,
        )

    return certificate_request


@app.get(
    "/api/admin/certificate-requests",
    response_model=schemas.CertificateRequestListResponse,
)
def admin_list_certificate_requests(
    status: str | None = None,
    search: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.list_certificate_requests(
        db=db,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )


@app.post(
    "/api/admin/certificate-requests/{request_id}/approve",
    response_model=schemas.CertificateRequestResponse,
)
def admin_approve_certificate_request(
    request_id: int,
    approve_data: schemas.CertificateRequestApprove,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    certificate_request = crud.get_certificate_request(db, request_id)

    if not certificate_request:
        raise HTTPException(
            status_code=404,
            detail="Certificate request not found",
        )

    if certificate_request.status != "CERTIFICATE_PENDING":
        raise HTTPException(
            status_code=400,
            detail="Certificate request has already been reviewed",
        )

    updated_request = crud.approve_certificate_request(
        db=db,
        certificate_request=certificate_request,
        admin_note=approve_data.admin_note,
        reviewed_by=current_admin.username,
        commit=False,
    )

    crud.create_audit_log(
        db=db,
        username=current_admin.username,
        action="APPROVE_CERTIFICATE_REQUEST",
        entity_type="CertificateRequest",
        entity_id=updated_request.id,
        details=(
            f"Certificate request approved for student "
            f"{updated_request.student_id}."
        ),
        commit=False,
    )

    try:
        db.commit()
        db.refresh(updated_request)
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to approve certificate request %s",
            request_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save certificate approval.",
        )

    logger.info(
        "Certificate request %s approved by %s",
        request_id,
        current_admin.username,
    )

    try:
        notify_requester_certificate_approved(
            requester_email=updated_request.requester_email,
            student_id=updated_request.student_id,
            admin_note=updated_request.admin_note,
        )
    except Exception:
        # Duyet da luu thanh cong; loi email khong duoc doi trang thai.
        logger.exception(
            "Failed to send approval email for certificate request %s",
            request_id,
        )

    return updated_request

@app.get(
    "/api/admin/certificate-requests/{request_id}/print-data",
    response_model=schemas.CertificatePrintDataResponse,
)
def admin_get_certificate_print_data(
    request_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    certificate_request = crud.get_certificate_request(db, request_id)

    if not certificate_request:
        raise HTTPException(
            status_code=404,
            detail="Certificate request not found",
        )

    if certificate_request.status != "CERTIFICATE_APPROVED":
        raise HTTPException(
            status_code=400,
            detail="Certificate request has not been approved",
        )

    student = crud.get_student(
        db,
        certificate_request.student_id,
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found",
        )

    try:
        verification = verify_student_on_blockchain(student)
    except Exception:
        logger.exception(
            "Blockchain verification failed before printing request %s",
            request_id,
        )
        raise HTTPException(
            status_code=503,
            detail=(
                "Blockchain verification is unavailable. "
                "Cannot print confirmation document."
            ),
        )

    verification_status = verification["verification_status"]
    is_mismatch = verification_status == "Mismatch"

    if student.is_mismatch != is_mismatch:
        student.is_mismatch = is_mismatch
        db.commit()
        db.refresh(student)

    if verification_status != "Verified":
        raise HTTPException(
            status_code=409,
            detail=(
                "Student data is not verified on blockchain. "
                "Cannot print confirmation document."
            ),
        )

    # Chi giai ma thong tin rieng tu sau khi Fabric da Verified.
    private_data = crud.get_student_private_data(student)

    required_private_fields = [
        "citizen_id",
        "citizen_id_issue_date",
        "citizen_id_issue_place",
        "permanent_address",
    ]

    missing_fields = [
        field
        for field in required_private_fields
        if not private_data.get(field)
    ]

    if missing_fields:
        raise HTTPException(
            status_code=409,
            detail=(
                "Student private data is incomplete. "
                "Cannot print confirmation document."
            ),
        )

    try:
        crud.create_audit_log(
            db=db,
            username=current_admin.username,
            action="VIEW_CERTIFICATE_PRINT_DATA",
            entity_type="CertificateRequest",
            entity_id=certificate_request.id,
            details=(
                f"Viewed print data for student "
                f"{student.student_id}."
            ),
        )
    except Exception:
        logger.exception(
            "Failed to create audit log for certificate request %s",
            request_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to record document access.",
        )

    return schemas.CertificatePrintDataResponse(
        request_id=certificate_request.id,
        student_id=student.student_id,
        full_name=student.full_name,
        date_of_birth=student.date_of_birth,
        citizen_id=private_data["citizen_id"],
        citizen_id_issue_date=private_data["citizen_id_issue_date"],
        citizen_id_issue_place=private_data[
            "citizen_id_issue_place"
        ],
        permanent_address=private_data["permanent_address"],
        institution_name=student.institution_name,
        faculty_name=student.faculty_name,
        major=student.major,
        training_mode=student.training_mode,
        entrance_year=student.entrance_year,
        expected_graduation_date=student.expected_graduation_date,
        academic_status=student.academic_status,
        graduation_status=student.graduation_status,
        graduation_date=student.graduation_date,
        graduation_year=student.graduation_year,
        classification=student.classification,
        gpa=student.gpa,
        requested_by=certificate_request.requester_name,
        requested_email=certificate_request.requester_email,
        reason=certificate_request.reason,
        approved_by=(
            certificate_request.reviewed_by
            or current_admin.username
        ),
        approved_at=certificate_request.reviewed_at,
    )

@app.post(
    "/api/admin/certificate-requests/{request_id}/reject",
    response_model=schemas.CertificateRequestResponse,
)
def admin_reject_certificate_request(
    request_id: int,
    reject_data: schemas.CertificateRequestReject,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    certificate_request = crud.get_certificate_request(db, request_id)

    if not certificate_request:
        raise HTTPException(
            status_code=404,
            detail="Certificate request not found",
        )

    if certificate_request.status != "CERTIFICATE_PENDING":
        raise HTTPException(
            status_code=400,
            detail="Certificate request has already been reviewed",
        )

    updated_request = crud.reject_certificate_request(
        db=db,
        certificate_request=certificate_request,
        reject_reason=reject_data.reject_reason,
        reviewed_by=current_admin.username,
        commit=False,
    )

    crud.create_audit_log(
        db=db,
        username=current_admin.username,
        action="REJECT_CERTIFICATE_REQUEST",
        entity_type="CertificateRequest",
        entity_id=updated_request.id,
        details=(
            f"Certificate request rejected for student "
            f"{updated_request.student_id}."
        ),
        commit=False,
    )

    try:
        db.commit()
        db.refresh(updated_request)
    except Exception:
        db.rollback()

        logger.exception(
            "Failed to reject certificate request %s",
            request_id,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save certificate rejection.",
        )

    logger.info(
        "Certificate request %s rejected by %s",
        request_id,
        current_admin.username,
    )

    try:
        notify_requester_certificate_rejected(
            requester_email=updated_request.requester_email,
            student_id=updated_request.student_id,
            reject_reason=updated_request.reject_reason,
        )
    except Exception:
        # Tu choi da luu thanh cong; loi email khong duoc doi trang thai.
        logger.exception(
            "Failed to send rejection email for certificate request %s",
            request_id,
        )

    return updated_request


@app.get("/api/verify/{student_id}", response_model=schemas.VerifyResponse)
def verify_student(
    student_id: str,
    db: Session = Depends(get_db),
):
    student = crud.get_student(db, student_id)

    if not student:
        return schemas.VerifyResponse(
            student_id=student_id,
            full_name=None,
            graduation_status="UNKNOWN",
            verification_status="Not Registered",
            message="Student does not exist in MySQL.",
            is_graduated=False,
            verified_at=now_utc(),
        )

    if not student.blockchain_tx_id:
        return schemas.VerifyResponse(
            student_id=student.student_id,
            full_name=student.full_name,
            date_of_birth=student.date_of_birth,
            email=student.email,
            institution_name=student.institution_name,
            faculty_name=student.faculty_name,
            major=student.major,
            training_mode=student.training_mode,
            degree_id=student.degree_id,
            degree_type=student.degree_type,
            entrance_year=student.entrance_year,
            graduation_status=student.graduation_status,
            graduation_date=student.graduation_date,
            graduation_year=student.graduation_year,
            classification=student.classification,
            gpa=student.gpa,
            is_graduated=student.graduation_status == "GRADUATED",
            verification_status="Not Synced",
            message="Student exists in MySQL but has not been synced to blockchain yet.",
            metadata_hash_mysql=student.metadata_hash,
            metadata_hash_blockchain=None,
            blockchain_tx_id=None,
            verified_at=now_utc(),
        )

    try:
        result = verify_student_on_blockchain(student)
    except Exception as exc:
        logger.exception(
            "Blockchain verify failed for student %s",
            student_id,
        )
        raise HTTPException(
            status_code=503,
            detail=f"Blockchain error: {str(exc)}",
        )

    verification_status = result["verification_status"]

    student.is_mismatch = verification_status == "Mismatch"
    db.commit()
    db.refresh(student)

    return schemas.VerifyResponse(
        student_id=student.student_id,
        full_name=student.full_name,
        date_of_birth=student.date_of_birth,
        email=student.email,
        institution_name=student.institution_name,
        faculty_name=student.faculty_name,
        major=student.major,
        training_mode=student.training_mode,
        degree_id=student.degree_id,
        degree_type=student.degree_type,
        entrance_year=student.entrance_year,
        graduation_status=student.graduation_status,
        graduation_date=student.graduation_date,
        graduation_year=student.graduation_year,
        classification=student.classification,
        gpa=student.gpa,
        is_graduated=student.graduation_status == "GRADUATED",
        verification_status=verification_status,
        message=result["message"],
        metadata_hash_mysql=result.get("metadata_hash_mysql", student.metadata_hash),
        metadata_hash_blockchain=result.get("metadata_hash_blockchain"),
        blockchain_tx_id=student.blockchain_tx_id,
        verified_at=now_utc(),
    )
