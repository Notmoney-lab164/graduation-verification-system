import logging
from datetime import datetime, timezone
from io import BytesIO
from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, engine, get_db
from security import authenticate_user, create_access_token, get_current_admin
from services.blockchain_service import (
    sync_student_to_blockchain,
    verify_student_on_blockchain,
)
from services.pdf_service import generate_verification_pdf

Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Graduation Verification API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
            status_code=401,
            detail="Invalid username or password",
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role,
        }
    )

    return schemas.TokenResponse(
        access_token=access_token,
        token_type="bearer",
    )


@app.get("/api/admin/stats", response_model=schemas.StatsResponse)
def admin_stats(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    return crud.get_stats(db)


@app.get("/api/admin/students", response_model=schemas.StudentListResponse)
def admin_list_students(
    search: str | None = Query(default=None),
    graduation_status: str | None = Query(default=None),
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


@app.get("/api/admin/students/{student_id}", response_model=schemas.StudentResponse)
def admin_get_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return student


@app.post("/api/admin/students", response_model=schemas.StudentResponse)
def admin_create_student(
    student_data: schemas.StudentCreate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    existing_student = crud.get_student(db, student_data.student_id)

    if existing_student:
        raise HTTPException(status_code=409, detail="Student already exists")

    student = crud.create_student(
        db=db,
        student_data=student_data,
        updated_by=current_admin.username,
    )

    logger.info("Student %s created by %s", student.student_id, current_admin.username)

    return student


@app.put("/api/admin/students/{student_id}", response_model=schemas.StudentResponse)
def admin_update_student(
    student_id: str,
    student_data: schemas.StudentUpdate,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    updated_student = crud.update_student(
        db=db,
        student=student,
        student_data=student_data,
        updated_by=current_admin.username,
        sync_hash=True,
    )

    if updated_student.blockchain_tx_id:
        updated_student.is_mismatch = True
        db.commit()
        db.refresh(updated_student)

    logger.info("Student %s updated by %s", student_id, current_admin.username)

    return updated_student


@app.delete("/api/admin/students/{student_id}")
def admin_delete_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    crud.delete_student(
        db=db,
        student=student,
        deleted_by=current_admin.username,
    )

    logger.info("Student %s deleted by %s", student_id, current_admin.username)

    return {"message": "Student deleted"}       

@app.post(
    "/api/admin/students/{student_id}/sync-blockchain",
    response_model=schemas.BlockchainSyncResponse,
)
def admin_sync_student_blockchain(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        record = sync_student_to_blockchain(student)
    except Exception as exc:
        logger.exception("Blockchain sync failed for student %s", student_id)
        raise HTTPException(
            status_code=503,
            detail=f"Blockchain error: {str(exc)}",
        )

    student.blockchain_tx_id = record.tx_id
    student.is_mismatch = False
    db.commit()
    db.refresh(student)

    logger.info(
        "Student %s synced to blockchain by %s",
        student_id,
        current_admin.username,
    )

    return schemas.BlockchainSyncResponse(
        message="Student synced to blockchain",
        student_id=student.student_id,
        metadata_hash=student.metadata_hash,
        tx_id=record.tx_id,
        synced_at=datetime.now(timezone.utc),
    )


@app.post(
    "/api/admin/students/{student_id}/simulate-tamper",
    response_model=schemas.StudentResponse,
)
def admin_simulate_tamper(
    student_id: str,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    tamper_data = schemas.StudentUpdate(
        gpa=Decimal("3.90")
    )

    updated_student = crud.update_student(
        db=db,
        student=student,
        student_data=tamper_data,
        updated_by=current_admin.username,
        sync_hash=True,
    )

    if updated_student.blockchain_tx_id:
        updated_student.is_mismatch = True
        db.commit()
        db.refresh(updated_student)

    logger.warning(
        "GPA cua sinh vien %s da bi chinh sua de demo boi %s",
        student_id,
        current_admin.username,
    )

    return updated_student




@app.get("/api/verify/{student_id}", response_model=schemas.VerifyResponse)
def verify_student(
    student_id: str,
    db: Session = Depends(get_db),
):
    student = crud.get_student(db, student_id)

    if not student:
        return schemas.VerifyResponse(
            student_id=student_id,
            graduation_status="UNKNOWN",
            verification_status="Not Registered",
            message="Student does not exist in MySQL.",
        )

    if not student.blockchain_tx_id:
        return schemas.VerifyResponse(
            student_id=student.student_id,
            full_name=student.full_name,
            major=student.major,
            degree_type=student.degree_type,
            graduation_status=student.graduation_status,
            graduation_date=student.graduation_date,
            graduation_year=student.graduation_year,
            classification=student.classification,
            gpa=student.gpa,
            verification_status="Not Synced",
            message="Student exists in MySQL but has not been synced to blockchain yet.",
            metadata_hash_mysql=student.metadata_hash,
            metadata_hash_blockchain=None,
            blockchain_tx_id=None,
        )

    try:
        verification = verify_student_on_blockchain(student)
    except Exception as exc:
        logger.exception("Blockchain verify failed for student %s", student_id)
        raise HTTPException(
            status_code=503,
            detail=f"Blockchain error: {str(exc)}",
        )

    if verification["verification_status"] == "Mismatch":
        student.is_mismatch = True
    else:
        student.is_mismatch = False

    db.commit()
    db.refresh(student)

    return schemas.VerifyResponse(
        student_id=student.student_id,
        full_name=student.full_name,
        major=student.major,
        degree_type=student.degree_type,
        graduation_status=student.graduation_status,
        graduation_date=student.graduation_date,
        graduation_year=student.graduation_year,
        classification=student.classification,
        gpa=student.gpa,
        verification_status=verification["verification_status"],
        message=verification["message"],
        metadata_hash_mysql=student.metadata_hash,
        metadata_hash_blockchain=verification["metadata_hash_blockchain"],
        blockchain_tx_id=student.blockchain_tx_id,
    )

@app.get("/api/verify/{student_id}/export-pdf")
def export_student_verification_pdf(
    student_id: str,
    db: Session = Depends(get_db),
):
    student = crud.get_student(db, student_id)

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if not student.blockchain_tx_id:
        verification = {
            "verification_status": "Not Synced",
            "metadata_hash_blockchain": None,
            "message": "Student exists in MySQL but has not been synced to blockchain yet.",
        }
    else:
        try:
            verification = verify_student_on_blockchain(student)
        except Exception as exc:
            logger.exception("Blockchain verify failed for student %s", student_id)
            raise HTTPException(
                status_code=503,
                detail=f"Blockchain error: {str(exc)}",
            )

    pdf_bytes = generate_verification_pdf(student, verification)
    filename = f"graduation-verification-{student.student_id}.pdf"

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )