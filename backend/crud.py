import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
import schemas
from services.encryption_service import decrypt_value, encrypt_value
from services.hash_service import calculate_student_hash


def normalize_citizen_id(citizen_id: str) -> str:
    return "".join(
        character
        for character in citizen_id.strip()
        if character.isalnum()
    )


def calculate_citizen_id_hash(citizen_id: str) -> str:
    normalized_citizen_id = normalize_citizen_id(citizen_id)

    return hashlib.sha256(
        normalized_citizen_id.encode("utf-8")
    ).hexdigest()


def prepare_student_storage_data(student_data: dict) -> dict:
    data = student_data.copy()

    citizen_id = data.pop("citizen_id", None)
    citizen_id_issue_place = data.pop(
        "citizen_id_issue_place",
        None,
    )
    permanent_address = data.pop(
        "permanent_address",
        None,
    )

    if citizen_id is not None:
        normalized_citizen_id = normalize_citizen_id(citizen_id)

        data["citizen_id_hash"] = calculate_citizen_id_hash(
            normalized_citizen_id
        )
        data["citizen_id_encrypted"] = encrypt_value(
            normalized_citizen_id
        )

    if citizen_id_issue_place is not None:
        data["citizen_id_issue_place_encrypted"] = encrypt_value(
            citizen_id_issue_place
        )

    if permanent_address is not None:
        data["permanent_address_encrypted"] = encrypt_value(
            permanent_address
        )

    return data


def get_student_private_data(student: models.Student) -> dict:
    return {
        "citizen_id": decrypt_value(student.citizen_id_encrypted),
        "citizen_id_issue_date": student.citizen_id_issue_date,
        "citizen_id_issue_place": decrypt_value(
            student.citizen_id_issue_place_encrypted
        ),
        "permanent_address": decrypt_value(
            student.permanent_address_encrypted
        ),
    }

OTP_EXPIRY_MINUTES = 10
OTP_RESEND_SECONDS = 60
OTP_MAX_ATTEMPTS = 5
OTP_PURPOSE_CERTIFICATE_REQUEST = "CERTIFICATE_REQUEST"


def _utcnow() -> datetime:
    return datetime.utcnow()


def normalize_requester_email(email: str) -> str:
    return email.strip().lower()


def _hash_certificate_otp(
    student_id: str,
    requester_email: str,
    otp_code: str,
) -> str:
    secret_key = os.getenv("SECRET_KEY")

    if not secret_key:
        raise RuntimeError("SECRET_KEY is not configured")

    payload = (
        f"{student_id}|"
        f"{normalize_requester_email(requester_email)}|"
        f"{otp_code}"
    )

    return hmac.new(
        secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _hash_verification_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_certificate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def get_certificate_otp_expiration() -> datetime:
    return _utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)


def has_recent_certificate_otp(
    db: Session,
    student_id: str,
    requester_email: str,
) -> bool:
    resend_after = _utcnow() - timedelta(
        seconds=OTP_RESEND_SECONDS
    )

    recent_otp = (
        db.query(models.CertificateEmailVerification)
        .filter(
            models.CertificateEmailVerification.student_id
            == student_id,
            models.CertificateEmailVerification.requester_email
            == normalize_requester_email(requester_email),
            models.CertificateEmailVerification.purpose
            == OTP_PURPOSE_CERTIFICATE_REQUEST,
            models.CertificateEmailVerification.created_at
            >= resend_after,
        )
        .first()
    )

    return recent_otp is not None


def create_certificate_email_verification(
    db: Session,
    student_id: str,
    requester_email: str,
    otp_code: str,
    expires_at: datetime,
):
    normalized_email = normalize_requester_email(
        requester_email
    )

    # OTP cu chua dung se het hieu luc ngay khi gui OTP moi.
    db.query(models.CertificateEmailVerification).filter(
        models.CertificateEmailVerification.student_id
        == student_id,
        models.CertificateEmailVerification.requester_email
        == normalized_email,
        models.CertificateEmailVerification.purpose
        == OTP_PURPOSE_CERTIFICATE_REQUEST,
        models.CertificateEmailVerification.used_at.is_(None),
    ).update(
        {
            models.CertificateEmailVerification.used_at:
            _utcnow()
        },
        synchronize_session=False,
    )

    verification = models.CertificateEmailVerification(
        student_id=student_id,
        requester_email=normalized_email,
        purpose=OTP_PURPOSE_CERTIFICATE_REQUEST,
        otp_hash=_hash_certificate_otp(
            student_id=student_id,
            requester_email=requester_email,
            otp_code=otp_code,
        ),
        expires_at=expires_at,
    )

    db.add(verification)
    db.commit()
    db.refresh(verification)

    return verification


def verify_certificate_email_otp(
    db: Session,
    student_id: str,
    requester_email: str,
    otp_code: str,
):
    verification = (
        db.query(models.CertificateEmailVerification)
        .filter(
            models.CertificateEmailVerification.student_id
            == student_id,
            models.CertificateEmailVerification.requester_email
            == normalize_requester_email(requester_email),
            models.CertificateEmailVerification.purpose
            == OTP_PURPOSE_CERTIFICATE_REQUEST,
            models.CertificateEmailVerification.verified_at.is_(None),
            models.CertificateEmailVerification.used_at.is_(None),
        )
        .order_by(
            models.CertificateEmailVerification.id.desc()
        )
        .first()
    )

    if not verification:
        return None, None, "OTP_NOT_FOUND"

    if verification.expires_at <= _utcnow():
        return None, None, "OTP_EXPIRED"

    if verification.attempt_count >= OTP_MAX_ATTEMPTS:
        return None, None, "OTP_TOO_MANY_ATTEMPTS"

    verification.attempt_count += 1

    expected_hash = _hash_certificate_otp(
        student_id=student_id,
        requester_email=requester_email,
        otp_code=otp_code,
    )

    if not hmac.compare_digest(
        verification.otp_hash,
        expected_hash,
    ):
        db.commit()
        return None, None, "OTP_INVALID"

    verification_token = secrets.token_urlsafe(32)

    verification.verified_at = _utcnow()
    verification.verification_token_hash = (
        _hash_verification_token(verification_token)
    )

    db.commit()
    db.refresh(verification)

    return verification, verification_token, None


def consume_certificate_email_verification(
    db: Session,
    student_id: str,
    requester_email: str,
    verification_token: str,
    commit: bool = True,
):
    token_hash = _hash_verification_token(verification_token)

    verification = (
        db.query(models.CertificateEmailVerification)
        .filter(
            models.CertificateEmailVerification.student_id
            == student_id,
            models.CertificateEmailVerification.requester_email
            == normalize_requester_email(requester_email),
            models.CertificateEmailVerification.purpose
            == OTP_PURPOSE_CERTIFICATE_REQUEST,
            models.CertificateEmailVerification.verification_token_hash
            == token_hash,
            models.CertificateEmailVerification.verified_at.isnot(None),
            models.CertificateEmailVerification.used_at.is_(None),
            models.CertificateEmailVerification.expires_at > _utcnow(),
        )
        .first()
    )

    if not verification:
        return None

    verification.used_at = _utcnow()

    if commit:
        db.commit()
        db.refresh(verification)
    else:
        db.flush()

    return verification

def get_student(db: Session, student_id: str):
    return (
        db.query(models.Student)
        .filter(
            models.Student.student_id == student_id,
            models.Student.is_deleted.is_(False),
        )
        .first()
    )

def get_deleted_student(
    db: Session,
    student_id: str,
):
    return (
        db.query(models.Student)
        .filter(
            models.Student.student_id == student_id,
            models.Student.is_deleted.is_(True),
        )
        .first()
    )


def restore_student(
    db: Session,
    student: models.Student,
    commit: bool = True,
):
    student.is_deleted = False
    student.deleted_at = None
    student.deleted_by = None

    if commit:
        db.commit()
        db.refresh(student)
    else:
        db.flush()

    return student


def get_student_by_degree_id(db: Session, degree_id: str | None):
    if not degree_id:
        return None

    return (
        db.query(models.Student)
        .filter(
            models.Student.degree_id == degree_id,
            models.Student.is_deleted.is_(False),
        )
        .first()
    )


def get_student_by_citizen_id_hash(
    db: Session,
    citizen_id_hash: str | None,
):
    if not citizen_id_hash:
        return None

    return (
        db.query(models.Student)
        .filter(
            models.Student.citizen_id_hash == citizen_id_hash,
            models.Student.is_deleted.is_(False),
        )
        .first()
    )


def list_students(
    db: Session,
    search: str | None = None,
    graduation_status: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(models.Student).filter(
        models.Student.is_deleted.is_(False)
    )

    if search:
        keyword = f"%{search}%"
        query = query.filter(
            or_(
                models.Student.student_id.like(keyword),
                models.Student.full_name.like(keyword),
            )
        )

    if graduation_status:
        query = query.filter(
            models.Student.graduation_status == graduation_status
        )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    offset = (page - 1) * page_size

    items = (
        query.order_by(models.Student.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def create_student(
    db: Session,
    student_data: schemas.StudentCreate,
    updated_by: str | None = "admin",
    commit: bool = True,
):
    storage_data = prepare_student_storage_data(
        student_data.model_dump()
    )

    student = models.Student(**storage_data)
    student.updated_by = updated_by
    student.metadata_hash = calculate_student_hash(student)
    student.is_mismatch = False
    student.approval_status = "APPROVED"

    db.add(student)

    if commit:
        db.commit()
        db.refresh(student)
    else:
        db.flush()

    return student


def update_student(
    db: Session,
    student: models.Student,
    student_data: schemas.StudentUpdate,
    updated_by: str | None = "admin",
    sync_hash: bool = True,
    commit: bool = True,
):
    update_data = prepare_student_storage_data(
        student_data.model_dump(exclude_unset=True)
    )

    for key, value in update_data.items():
        setattr(student, key, value)

    student.updated_by = updated_by

    if sync_hash:
        student.metadata_hash = calculate_student_hash(student)

    if commit:
        db.commit()
        db.refresh(student)
    else:
        db.flush()

    return student


def delete_student(
    db: Session,
    student: models.Student,
    deleted_by: str | None = "admin",
    commit: bool = True,
):
    student.is_deleted = True
    student.deleted_at = datetime.utcnow()
    student.deleted_by = deleted_by

    if commit:
        db.commit()
        db.refresh(student)
    else:
        db.flush()

    return student


def create_audit_log(
    db: Session,
    username: str,
    action: str,
    entity_type: str,
    entity_id: str | int,
    details: str | None = None,
    commit: bool = True,
):
    audit_log = models.AuditLog(
        username=username,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        details=details,
    )

    db.add(audit_log)

    if commit:
        db.commit()
        db.refresh(audit_log)
    else:
        db.flush()

    return audit_log


def list_audit_logs(
    db: Session,
    username: str | None = None,
    action: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(models.AuditLog)

    if username:
        query = query.filter(
            models.AuditLog.username == username
        )

    if action:
        query = query.filter(
            models.AuditLog.action == action
        )

    if entity_type:
        query = query.filter(
            models.AuditLog.entity_type == entity_type
        )

    if search:
        keyword = f"%{search}%"
        query = query.filter(
            or_(
                models.AuditLog.username.like(keyword),
                models.AuditLog.action.like(keyword),
                models.AuditLog.entity_type.like(keyword),
                models.AuditLog.entity_id.like(keyword),
                models.AuditLog.details.like(keyword),
            )
        )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    offset = (page - 1) * page_size

    items = (
        query.order_by(
            models.AuditLog.created_at.desc(),
            models.AuditLog.id.desc(),
        )
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def get_stats(db: Session):
    active_students = db.query(models.Student).filter(
        models.Student.is_deleted.is_(False)
    )

    total_students = active_students.count()

    graduated_students = (
        active_students
        .filter(models.Student.graduation_status == "GRADUATED")
        .count()
    )

    not_graduated_students = (
        active_students
        .filter(models.Student.graduation_status == "NOT_GRADUATED")
        .count()
    )

    pending_students = (
        active_students
        .filter(models.Student.graduation_status == "PENDING")
        .count()
    )

    synced_blockchain = (
        active_students
        .filter(models.Student.blockchain_tx_id.isnot(None))
        .count()
    )

    not_synced_blockchain = total_students - synced_blockchain

    mismatch_count = (
        active_students
        .filter(models.Student.is_mismatch.is_(True))
        .count()
    )

    status_rows = (
        active_students
        .with_entities(
            models.Student.graduation_status,
            func.count(models.Student.student_id),
        )
        .group_by(models.Student.graduation_status)
        .all()
    )

    graduation_status = {
        status or "UNKNOWN": count
        for status, count in status_rows
    }

    return {
        "total_students": total_students,
        "graduated_students": graduated_students,
        "not_graduated_students": not_graduated_students,
        "pending_students": pending_students,
        "synced_blockchain": synced_blockchain,
        "not_synced_blockchain": not_synced_blockchain,
        "graduation_status": graduation_status,
        "mismatch_count": mismatch_count,
    }


def create_external_request(
    db: Session,
    request_data: schemas.ExternalRequestCreate,
):
    external_request = models.ExternalRequest(
        **request_data.model_dump()
    )
    external_request.status = "PENDING_REVIEW"

    db.add(external_request)
    db.commit()
    db.refresh(external_request)

    return external_request


def get_external_request(db: Session, request_id: int):
    return (
        db.query(models.ExternalRequest)
        .filter(models.ExternalRequest.id == request_id)
        .first()
    )


def list_external_requests(
    db: Session,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(models.ExternalRequest)

    if status:
        query = query.filter(
            models.ExternalRequest.status == status
        )

    if search:
        keyword = f"%{search}%"
        query = query.filter(
            or_(
                models.ExternalRequest.student_id.like(keyword),
                models.ExternalRequest.full_name.like(keyword),
                models.ExternalRequest.requester_name.like(keyword),
                models.ExternalRequest.requester_email.like(keyword),
            )
        )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    offset = (page - 1) * page_size

    items = (
        query.order_by(models.ExternalRequest.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def approve_external_request(
    db: Session,
    external_request: models.ExternalRequest,
    reviewed_by: str,
    commit: bool = True,
):
    external_request.status = "APPROVED"
    external_request.reviewed_by = reviewed_by
    external_request.reviewed_at = datetime.utcnow()
    external_request.reject_reason = None

    if commit:
        db.commit()
        db.refresh(external_request)
    else:
        db.flush()

    return external_request


def reject_external_request(
    db: Session,
    external_request: models.ExternalRequest,
    reject_reason: str,
    reviewed_by: str,
    commit: bool = True,
):
    external_request.status = "REJECTED"
    external_request.reviewed_by = reviewed_by
    external_request.reviewed_at = datetime.utcnow()
    external_request.reject_reason = reject_reason

    if commit:
        db.commit()
        db.refresh(external_request)
    else:
        db.flush()

    return external_request

def create_certificate_request(
    db: Session,
    request_data: schemas.CertificateRequestCreate,
    commit: bool = True,
):
    request_payload = request_data.model_dump(
        exclude={"email_verification_token"}
    )

    certificate_request = models.CertificateRequest(
        **request_payload
    )
    certificate_request.status = "CERTIFICATE_PENDING"

    db.add(certificate_request)

    if commit:
        db.commit()
        db.refresh(certificate_request)
    else:
        db.flush()

    return certificate_request


def get_certificate_request(db: Session, request_id: int):
    return (
        db.query(models.CertificateRequest)
        .filter(models.CertificateRequest.id == request_id)
        .first()
    )


def list_certificate_requests(
    db: Session,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(models.CertificateRequest)

    if status:
        query = query.filter(
            models.CertificateRequest.status == status
        )

    if search:
        keyword = f"%{search}%"
        query = query.filter(
            or_(
                models.CertificateRequest.student_id.like(keyword),
                models.CertificateRequest.requester_name.like(keyword),
                models.CertificateRequest.requester_email.like(keyword),
            )
        )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    offset = (page - 1) * page_size

    items = (
        query.order_by(models.CertificateRequest.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def approve_certificate_request(
    db: Session,
    certificate_request: models.CertificateRequest,
    admin_note: str | None,
    reviewed_by: str,
    commit: bool = True,
):
    certificate_request.status = "CERTIFICATE_APPROVED"
    certificate_request.admin_note = admin_note
    certificate_request.reject_reason = None
    certificate_request.reviewed_by = reviewed_by
    certificate_request.reviewed_at = datetime.utcnow()

    if commit:
        db.commit()
        db.refresh(certificate_request)
    else:
        db.flush()

    return certificate_request


def reject_certificate_request(
    db: Session,
    certificate_request: models.CertificateRequest,
    reject_reason: str,
    reviewed_by: str,
    commit: bool = True,
):
    certificate_request.status = "CERTIFICATE_REJECTED"
    certificate_request.reject_reason = reject_reason
    certificate_request.admin_note = None
    certificate_request.reviewed_by = reviewed_by
    certificate_request.reviewed_at = datetime.utcnow()

    if commit:
        db.commit()
        db.refresh(certificate_request)
    else:
        db.flush()

    return certificate_request