from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class StudentBase(BaseModel):
    student_id: str = Field(..., max_length=20)
    full_name: str = Field(..., max_length=100)
    date_of_birth: date | None = None
    email: str | None = None

    institution_code: str = Field(..., max_length=50)
    institution_name: str = Field(..., max_length=200)
    faculty_name: str = Field(..., max_length=150)
    major: str = Field(..., max_length=150)
    training_mode: str | None = None

    degree_id: str = Field(..., max_length=50)
    degree_type: str = Field(..., max_length=50)

    graduation_status: str = Field(..., max_length=30)
    graduation_date: date | None = None
    graduation_year: int | None = None
    classification: str | None = None
    gpa: Decimal | None = None
    total_credits: int | None = None
    entrance_year: int | None = None

    expected_graduation_date: date | None = None
    academic_status: str | None = Field(default=None, max_length=50)


class StudentCreate(StudentBase):
    # Du lieu noi bo. Backend se ma hoa CCCD truoc khi luu MySQL.
    citizen_id: str | None = Field(default=None, min_length=9, max_length=20)

    # Giu tam de tuong thich voi du lieu cu.
    # Backend se tu tao hash khi citizen_id duoc gui len.
    citizen_id_hash: str | None = Field(default=None, max_length=64)

    citizen_id_issue_date: date | None = None
    citizen_id_issue_place: str | None = Field(
        default=None,
        max_length=150,
    )
    permanent_address: str | None = Field(
        default=None,
        max_length=500,
    )


class StudentUpdate(BaseModel):
    full_name: str | None = None
    date_of_birth: date | None = None
    email: str | None = None

    institution_code: str | None = None
    institution_name: str | None = None
    faculty_name: str | None = None
    major: str | None = None
    training_mode: str | None = None

    degree_id: str | None = None
    degree_type: str | None = None

    graduation_status: str | None = None
    graduation_date: date | None = None
    graduation_year: int | None = None
    classification: str | None = None
    gpa: Decimal | None = None
    total_credits: int | None = None
    entrance_year: int | None = None

    expected_graduation_date: date | None = None
    academic_status: str | None = Field(default=None, max_length=50)

    # Du lieu rieng tu: chi Admin gui len, khong tra ve API public.
    citizen_id: str | None = Field(default=None, min_length=9, max_length=20)
    citizen_id_hash: str | None = Field(default=None, max_length=64)
    citizen_id_issue_date: date | None = None
    citizen_id_issue_place: str | None = Field(
        default=None,
        max_length=150,
    )
    permanent_address: str | None = Field(
        default=None,
        max_length=500,
    )


class StudentResponse(StudentBase):
    # Khong tra citizen_id_hash, CCCD, dia chi hoac noi cap.
    metadata_hash: str | None = None
    blockchain_tx_id: str | None = None
    is_mismatch: bool | None = None

    approval_status: str | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None

    is_deleted: bool | None = None
    deleted_at: datetime | None = None
    deleted_by: str | None = None

    updated_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class VerifyResponse(BaseModel):
    student_id: str
    full_name: str | None = None
    date_of_birth: date | None = None
    email: str | None = None

    institution_name: str | None = None
    faculty_name: str | None = None
    major: str | None = None
    training_mode: str | None = None

    degree_id: str | None = None
    degree_type: str | None = None

    entrance_year: int | None = None
    graduation_status: str
    graduation_date: date | None = None
    graduation_year: int | None = None
    classification: str | None = None
    gpa: Decimal | None = None
    is_graduated: bool = False

    verification_status: str
    message: str
    verified_at: datetime | None = None

    metadata_hash_mysql: str | None = None
    metadata_hash_blockchain: str | None = None
    blockchain_tx_id: str | None = None


class StatsResponse(BaseModel):
    total_students: int
    graduated_students: int
    not_graduated_students: int
    pending_students: int
    synced_blockchain: int
    not_synced_blockchain: int
    graduation_status: dict[str, int]
    mismatch_count: int


class StudentListResponse(BaseModel):
    items: list[StudentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ApprovalResponse(BaseModel):
    message: str
    student_id: str
    approval_status: str
    approved_by: str | None = None
    approved_at: datetime | None = None
    blockchain_tx_id: str | None = None
    metadata_hash: str | None = None


class ExternalRequestCreate(BaseModel):
    student_id: str = Field(..., max_length=20)
    full_name: str | None = Field(default=None, max_length=100)
    gpa: Decimal | None = None
    graduation_status: str | None = Field(
        default=None,
        max_length=30,
    )

    requester_name: str | None = Field(
        default=None,
        max_length=100,
    )
    requester_email: str | None = Field(
        default=None,
        max_length=150,
    )
    requester_type: str | None = Field(
        default=None,
        max_length=50,
    )
    message: str | None = None


class ExternalRequestResponse(BaseModel):
    id: int
    student_id: str
    full_name: str | None = None
    gpa: Decimal | None = None
    graduation_status: str | None = None

    requester_name: str | None = None
    requester_email: str | None = None
    requester_type: str | None = None
    message: str | None = None

    status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    reject_reason: str | None = None

    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class ExternalRequestListResponse(BaseModel):
    items: list[ExternalRequestResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ExternalRequestReject(BaseModel):
    reject_reason: str


class CertificateOtpSendRequest(BaseModel):
    student_id: str = Field(..., max_length=20)
    requester_email: str = Field(..., max_length=150)


class CertificateOtpSendResponse(BaseModel):
    message: str
    expires_in_seconds: int


class CertificateOtpVerifyRequest(BaseModel):
    student_id: str = Field(..., max_length=20)
    requester_email: str = Field(..., max_length=150)
    otp_code: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
    )


class CertificateOtpVerifyResponse(BaseModel):
    message: str
    email_verification_token: str
    expires_at: datetime

class CertificateRequestCreate(BaseModel):
    student_id: str = Field(..., max_length=20)
    requester_name: str = Field(..., max_length=100)
    requester_email: str = Field(..., max_length=150)
    reason: str

    # Token backend tra ve sau khi user nhap OTP dung.
    # Frontend gui token nay khi tao yeu cau giay.
    email_verification_token: str = Field(
        ...,
        min_length=20,
        max_length=200,
    )


class CertificateRequestResponse(BaseModel):
    id: int
    student_id: str
    requester_name: str
    requester_email: str
    reason: str

    status: str
    admin_note: str | None = None
    reject_reason: str | None = None

    reviewed_by: str | None = None
    reviewed_at: datetime | None = None

    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class CertificateRequestListResponse(BaseModel):
    items: list[CertificateRequestResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class CertificateRequestApprove(BaseModel):
    admin_note: str | None = None


class CertificateRequestReject(BaseModel):
    reject_reason: str


class CertificatePrintDataResponse(BaseModel):
    # Response chi danh cho Admin in giay xac nhan.
    request_id: int
    student_id: str
    full_name: str
    date_of_birth: date | None = None

    citizen_id: str | None = None
    citizen_id_issue_date: date | None = None
    citizen_id_issue_place: str | None = None
    permanent_address: str | None = None

    institution_name: str | None = None
    faculty_name: str | None = None
    major: str | None = None
    training_mode: str | None = None

    entrance_year: int | None = None
    expected_graduation_date: date | None = None
    academic_status: str | None = None

    graduation_status: str
    graduation_date: date | None = None
    graduation_year: int | None = None
    classification: str | None = None
    gpa: Decimal | None = None

    requested_by: str
    requested_email: str
    reason: str
    approved_by: str
    approved_at: datetime | None = None


class BlockchainSyncResponse(BaseModel):
    message: str
    student_id: str
    metadata_hash: str
    tx_id: str
    synced_at: datetime

class AuditLogResponse(BaseModel):
    id: int
    username: str
    action: str
    entity_type: str
    entity_id: str
    details: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"