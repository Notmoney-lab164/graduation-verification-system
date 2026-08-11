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
from services.hash_service import (
    METADATA_HASH_VERSION,
    calculate_student_hash,
)


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
        "citizen_id": (
            decrypt_value(student.citizen_id_encrypted)
            if student.citizen_id_encrypted
            else None
        ),
        "citizen_id_issue_date": student.citizen_id_issue_date,
        "citizen_id_issue_place": (
            decrypt_value(student.citizen_id_issue_place_encrypted)
            if student.citizen_id_issue_place_encrypted
            else None
        ),
        "permanent_address": (
            decrypt_value(student.permanent_address_encrypted)
            if student.permanent_address_encrypted
            else None
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


# MULTI_USER_ROW_LOCK_V1
def get_student_for_update(db: Session, student_id: str):
    """Lock one active student until the current transaction finishes."""
    return (
        db.query(models.Student)
        .filter(
            models.Student.student_id == student_id,
            models.Student.is_deleted.is_(False),
        )
        .with_for_update()
        .first()
    )


def get_student_including_deleted(db: Session, student_id: str):
    """Dung khi kiem tra trung khoa, khong dung cho API tra cuu public."""
    return (
        db.query(models.Student)
        .filter(models.Student.student_id == student_id)
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


def get_student_by_degree_id(
    db: Session,
    degree_id: str | None,
    include_deleted: bool = True,
):
    if not degree_id:
        return None

    query = db.query(models.Student).filter(
        models.Student.degree_id == degree_id
    )

    if not include_deleted:
        query = query.filter(models.Student.is_deleted.is_(False))

    return query.first()


def get_student_by_citizen_id_hash(
    db: Session,
    citizen_id_hash: str | None,
    include_deleted: bool = True,
):
    if not citizen_id_hash:
        return None

    query = db.query(models.Student).filter(
        models.Student.citizen_id_hash == citizen_id_hash
    )

    if not include_deleted:
        query = query.filter(models.Student.is_deleted.is_(False))

    return query.first()


# EXPLORER_DYNAMIC_CURRENT_HASH_V2
def get_changed_student_by_metadata_hash(
    db: Session,
    metadata_hash: str,
):
    """Match a lookup against hashes freshly calculated from changed records."""
    normalized_hash = str(metadata_hash or "").strip().lower()
    if not normalized_hash:
        return None

    candidates = (
        db.query(models.Student)
        .filter(
            models.Student.is_deleted.is_(False),
            models.Student.is_mismatch.is_(True),
            models.Student.blockchain_tx_id.isnot(None),
        )
        .all()
    )

    for student in candidates:
        current_hash = calculate_student_hash(student).lower()
        if hmac.compare_digest(current_hash, normalized_hash):
            return student

    return None


def list_students(
    db: Session,
    search: str | None = None,
    graduation_status: str | None = None,
    is_deleted: bool = False,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(models.Student).filter(
        models.Student.is_deleted.is_(is_deleted)
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
    existing_student = get_student_including_deleted(
        db,
        student_data.student_id,
    )
    if existing_student:
        raise ValueError("STUDENT_ID_ALREADY_EXISTS")

    storage_data = prepare_student_storage_data(
        student_data.model_dump()
    )

    if storage_data.get("email"):
        storage_data["email"] = normalize_requester_email(
            storage_data["email"]
        )

    student = models.Student(**storage_data)
    student.updated_by = updated_by
    student.metadata_hash_version = METADATA_HASH_VERSION
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

    if update_data.get("email"):
        update_data["email"] = normalize_requester_email(
            update_data["email"]
        )

    for key, value in update_data.items():
        setattr(student, key, value)

    student.updated_by = updated_by

    if sync_hash:
        student.metadata_hash_version = METADATA_HASH_VERSION
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


EXTERNAL_REQUEST_CREATE_FIELDS = {
    "student_id",
    "full_name",
    "gpa",
    "graduation_status",
    "requester_name",
    "requester_email",
    "requester_type",
    "message",
    "source_file_name",
    "source_row_number",
    "verification_status",
    "verification_message",
    "matched_student_name",
    "import_data",
    "status",
}


def create_external_request(
    db: Session,
    request_data: schemas.ExternalRequestCreate | dict,
    commit: bool = True,
):
    raw_payload = (
        request_data.model_dump()
        if isinstance(request_data, schemas.ExternalRequestCreate)
        else dict(request_data)
    )

    payload = {
        key: value
        for key, value in raw_payload.items()
        if key in EXTERNAL_REQUEST_CREATE_FIELDS
    }

    if payload.get("student_id"):
        payload["student_id"] = str(payload["student_id"]).strip().upper()

    if payload.get("requester_email"):
        payload["requester_email"] = normalize_requester_email(
            payload["requester_email"]
        )

    payload.setdefault("status", "PENDING_REVIEW")
    payload.setdefault("verification_status", "PENDING")

    external_request = models.ExternalRequest(**payload)

    db.add(external_request)

    if commit:
        db.commit()
        db.refresh(external_request)
    else:
        db.flush()

    return external_request


def get_external_request(
    db: Session,
    request_id: int,
    include_deleted: bool = False,
):
    query = db.query(models.ExternalRequest).filter(
        models.ExternalRequest.id == request_id
    )

    if not include_deleted:
        query = query.filter(
            models.ExternalRequest.is_deleted.is_(False)
        )

    return query.first()


def get_external_request_for_update(
    db: Session,
    request_id: int,
    include_deleted: bool = False,
):
    """Lock one external request until the current transaction finishes."""
    query = db.query(models.ExternalRequest).filter(
        models.ExternalRequest.id == request_id
    )

    if not include_deleted:
        query = query.filter(
            models.ExternalRequest.is_deleted.is_(False)
        )

    return query.with_for_update().first()


def get_deleted_external_request(
    db: Session,
    request_id: int,
):
    return (
        db.query(models.ExternalRequest)
        .filter(
            models.ExternalRequest.id == request_id,
            models.ExternalRequest.is_deleted.is_(True),
        )
        .first()
    )


def list_external_requests(
    db: Session,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    is_deleted: bool = False,
):
    query = db.query(models.ExternalRequest).filter(
        models.ExternalRequest.is_deleted.is_(is_deleted)
    )

    if status:
        query = query.filter(
            models.ExternalRequest.status == status
        )

    if search:
        keyword = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.ExternalRequest.student_id.like(keyword),
                models.ExternalRequest.full_name.like(keyword),
                models.ExternalRequest.requester_name.like(keyword),
                models.ExternalRequest.requester_email.like(keyword),
                models.ExternalRequest.source_file_name.like(keyword),
                models.ExternalRequest.verification_status.like(keyword),
            )
        )

    total = query.count()
    total_pages = (total + page_size - 1) // page_size
    offset = (page - 1) * page_size

    items = (
        query.order_by(
            models.ExternalRequest.created_at.desc(),
            models.ExternalRequest.id.desc(),
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


def archive_external_request(
    db: Session,
    external_request: models.ExternalRequest,
    deleted_by: str,
    commit: bool = True,
):
    """Luu tru ho so; khong xoa sinh vien hoac du lieu Blockchain."""
    external_request.is_deleted = True
    external_request.deleted_at = datetime.utcnow()
    external_request.deleted_by = deleted_by

    if commit:
        db.commit()
        db.refresh(external_request)
    else:
        db.flush()

    return external_request


def restore_external_request(
    db: Session,
    external_request: models.ExternalRequest,
    commit: bool = True,
):
    external_request.is_deleted = False
    external_request.deleted_at = None
    external_request.deleted_by = None

    if commit:
        db.commit()
        db.refresh(external_request)
    else:
        db.flush()

    return external_request


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
    external_request.reject_reason = reject_reason.strip()

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

def get_active_email_setting(db: Session):
    return (
        db.query(models.EmailSetting)
        .filter(models.EmailSetting.is_active.is_(True))
        .order_by(models.EmailSetting.id.desc())
        .first()
    )


def list_active_admin_emails(db: Session) -> list[str]:
    rows = (
        db.query(models.User.email)
        .filter(
            models.User.role == "admin",
            models.User.is_active.is_(True),
            models.User.email.isnot(None),
        )
        .all()
    )

    return [
        email
        for (email,) in rows
        if email
    ]

def get_student_by_email(
    db: Session,
    email: str,
    include_deleted: bool = True,
):
    if not email:
        return None

    normalized_email = normalize_requester_email(email)
    query = db.query(models.Student).filter(
        func.lower(models.Student.email) == normalized_email
    )

    if not include_deleted:
        query = query.filter(models.Student.is_deleted.is_(False))

    return query.first()
