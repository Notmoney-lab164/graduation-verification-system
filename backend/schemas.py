from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


STUDENT_ID_PATTERN = r"^[A-Z]{2}\d{6}$"
CITIZEN_ID_PATTERN = r"^\d{12}$"


class StudentBase(BaseModel):
    student_id: str = Field(..., max_length=20)
    full_name: str = Field(..., max_length=100)
    date_of_birth: date | None = None
    email: str | None = Field(default=None, max_length=150)

    institution_code: str = Field(..., max_length=50)
    institution_name: str = Field(..., max_length=200)
    faculty_name: str = Field(..., max_length=150)
    major: str = Field(..., max_length=150)
    training_mode: str | None = Field(default=None, max_length=100)

    # Chua co ma bang chinh thuc nen degree_id duoc phep de trong.
    degree_id: str | None = Field(default=None, max_length=50)
    degree_type: str = Field(..., max_length=50)

    graduation_status: str = Field(..., max_length=30)
    graduation_date: date | None = None
    graduation_year: int | None = Field(default=None, ge=1900, le=2200)
    classification: str | None = Field(default=None, max_length=50)
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=1,
    )
    total_credits: int | None = Field(default=None, ge=0)
    entrance_year: int | None = Field(default=None, ge=1900, le=2200)

    expected_graduation_date: date | None = None
    academic_status: str | None = Field(default=None, max_length=50)


class StudentCreate(StudentBase):
    student_id: str = Field(..., pattern=STUDENT_ID_PATTERN)

    # Frontend gui CCCD dang ro; backend bam va ma hoa truoc khi luu.
    citizen_id: str = Field(
        ...,
        min_length=12,
        max_length=12,
        pattern=CITIZEN_ID_PATTERN,
    )

    citizen_id_issue_date: date | None = None
    citizen_id_issue_place: str | None = Field(default=None, max_length=150)
    permanent_address: str | None = Field(default=None, max_length=500)


class StudentUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    date_of_birth: date | None = None
    email: str | None = Field(default=None, max_length=150)

    institution_code: str | None = Field(default=None, max_length=50)
    institution_name: str | None = Field(default=None, max_length=200)
    faculty_name: str | None = Field(default=None, max_length=150)
    major: str | None = Field(default=None, max_length=150)
    training_mode: str | None = Field(default=None, max_length=100)

    degree_id: str | None = Field(default=None, max_length=50)
    degree_type: str | None = Field(default=None, max_length=50)

    graduation_status: str | None = Field(default=None, max_length=30)
    graduation_date: date | None = None
    graduation_year: int | None = Field(default=None, ge=1900, le=2200)
    classification: str | None = Field(default=None, max_length=50)
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=1,
    )
    total_credits: int | None = Field(default=None, ge=0)
    entrance_year: int | None = Field(default=None, ge=1900, le=2200)

    expected_graduation_date: date | None = None
    academic_status: str | None = Field(default=None, max_length=50)

    # Khi sua, de trong citizen_id nghia la giu nguyen CCCD hien tai.
    citizen_id: str | None = Field(
        default=None,
        min_length=12,
        max_length=12,
        pattern=CITIZEN_ID_PATTERN,
    )
    citizen_id_issue_date: date | None = None
    citizen_id_issue_place: str | None = Field(default=None, max_length=150)
    permanent_address: str | None = Field(default=None, max_length=500)


class StudentResponse(StudentBase):
    # GPA_ONE_DECIMAL_API_VALIDATION_V1
    # Keep old read-only records compatible even if they contain two decimals.
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=2,
    )
    # Một số bản ghi cũ dùng năm 0 để biểu thị chưa có thông tin. API cần đọc
    # được các bản ghi này (đặc biệt trong danh sách đã xóa), nhưng quy tắc
    # 1900-2200 của StudentCreate/StudentUpdate vẫn được giữ nguyên.
    graduation_year: int | None = Field(default=None)
    entrance_year: int | None = Field(default=None)

    # Khong tra CCCD ro, hash CCCD, dia chi hoac noi cap qua API danh sach.
    metadata_hash: str | None = None
    metadata_hash_version: str | None = None
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


# ADMIN_STUDENT_PRIVATE_DETAIL_V1
class AdminStudentDetailResponse(StudentResponse):
    # Only returned by the authenticated Admin detail endpoint.
    citizen_id: str | None = None


class VerifyResponse(BaseModel):
    student_id: str
    full_name: str | None = None

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
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=2,
    )
    is_graduated: bool = False

    verification_status: str
    message: str
    verified_at: datetime | None = None

    metadata_hash_mysql: str | None = None
    metadata_hash_blockchain: str | None = None
    metadata_hash_version: str | None = None
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
    metadata_hash_version: str | None = None


class ExternalRequestCreate(BaseModel):
    # API cu nhap thu cong van duoc giu de khong lam hong chuc nang khac.
    student_id: str = Field(..., pattern=STUDENT_ID_PATTERN)
    full_name: str | None = Field(default=None, max_length=100)
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=1,
    )
    graduation_status: str | None = Field(default=None, max_length=30)

    requester_name: str | None = Field(default=None, max_length=100)
    requester_email: str | None = Field(default=None, max_length=150)
    requester_type: str | None = Field(default=None, max_length=50)
    message: str | None = Field(default=None, max_length=1000)


class ExternalRequestResponse(BaseModel):
    id: int
    student_id: str
    full_name: str | None = None
    # Ho so ngoai can giu nguyen ca GPA sai de admin xem ly do khong hop le.
    # Quy tac GPA 0-4 van duoc kiem tra khi duyet vao danh sach sinh vien chinh thuc.
    gpa: Decimal | None = None
    graduation_status: str | None = None

    requester_name: str | None = None
    requester_email: str | None = None
    requester_type: str | None = None
    message: str | None = None

    # Thong tin ho so tu CSV/XLSX dang cho admin xem xet.
    source_file_name: str | None = None
    source_row_number: int | None = None
    verification_status: str | None = None
    verification_message: str | None = None
    matched_student_name: str | None = None
    import_data: str | None = None

    # EXTERNAL_REQUEST_FABRIC_DECISION_V1
    source_data_hash: str | None = None
    blockchain_tx_id: str | None = None
    blockchain_action: str | None = None

    status: str
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    reject_reason: str | None = None

    # Trang thai luu tru mem chi duoc backend quan ly.
    is_deleted: bool = False
    deleted_at: datetime | None = None
    deleted_by: str | None = None

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
    reject_reason: str = Field(..., min_length=2, max_length=1000)


class ExternalFileImportInvalidRow(BaseModel):
    row_number: int
    student_id: str | None = None
    message: str


# Giu ten cu de code khac neu dang import class nay van hoat dong.
class ExternalImportRowError(ExternalFileImportInvalidRow):
    pass


class ExternalFileImportResponse(BaseModel):
    file_name: str
    total_rows: int
    imported_rows: int
    ready_for_review_count: int
    invalid_count: int
    duplicate_count: int
    non_fpt_count: int
    invalid_rows: list[ExternalFileImportInvalidRow] = Field(default_factory=list)


class CertificateOtpSendRequest(BaseModel):
    student_id: str = Field(..., pattern=STUDENT_ID_PATTERN)
    requester_email: str = Field(..., max_length=150)


class CertificateOtpSendResponse(BaseModel):
    message: str
    expires_in_seconds: int


class CertificateOtpVerifyRequest(BaseModel):
    student_id: str = Field(..., pattern=STUDENT_ID_PATTERN)
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
    student_id: str = Field(..., pattern=STUDENT_ID_PATTERN)
    requester_name: str = Field(..., max_length=100)
    requester_email: str = Field(..., max_length=150)
    reason: str = Field(..., min_length=2, max_length=1000)

    # Token backend tra ve sau khi nguoi dung nhap OTP dung.
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
    admin_note: str | None = Field(default=None, max_length=1000)


class CertificateRequestReject(BaseModel):
    reject_reason: str = Field(..., min_length=2, max_length=1000)


class CertificatePrintDataResponse(BaseModel):
    # Response rieng cho admin in giay xac nhan.
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
    gpa: Decimal | None = Field(
        default=None,
        ge=0,
        le=4,
        decimal_places=2,
    )

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


# FABRIC_EXPLORER_V1
class ExplorerTransactionResponse(BaseModel):
    transaction_id: str
    block_number: int
    transaction_index: int
    channel: str
    # FABRIC_BLOCK_OVERVIEW_SCHEMA_V1
    transaction_type: str | None = None
    timestamp: str | None = None
    validation_code: int | None = None
    # FABRIC_TRANSACTION_API_PEER_VALIDATION_V1
    creator_msp: str | None = None
    endorser_msps: list[str] = Field(default_factory=list)
    endorsement_count: int = 0
    chaincode_response_status: int | None = None
    status: str
    chaincode_name: str | None = None
    function_name: str | None = None
    student_id: str | None = None
    source_data_hash: str | None = None
    # EXPLORER_TRANSACTION_NAVIGATION_V1
    previous_transaction_id: str | None = None
    next_transaction_id: str | None = None


class ExplorerBlockResponse(BaseModel):
    number: int
    channel: str | None = None
    block_type: str | None = None
    size_bytes: int | None = None
    creator_msp: str | None = None
    block_signature_count: int = 0
    # FABRIC_BLOCK_HASH_V1
    block_hash: str | None = None
    previous_block_hash: str | None = None
    data_hash: str | None = None
    previous_hash: str | None = None
    transaction_count: int
    valid_transaction_count: int | None = None
    invalid_transaction_count: int | None = None
    validation_summary_available: bool = False
    graduation_transaction_count: int
    first_transaction_at: str | None = None
    transactions: list[ExplorerTransactionResponse] = Field(default_factory=list)

    # Các trường điều hướng chỉ có trong API chi tiết một block.
    height: int | None = None
    previous_block_number: int | None = None
    next_block_number: int | None = None


class ExplorerBlockListResponse(BaseModel):
    height: int
    items: list[ExplorerBlockResponse] = Field(default_factory=list)


class ExplorerTransactionListResponse(BaseModel):
    height: int
    items: list[ExplorerTransactionResponse] = Field(default_factory=list)


class ExplorerRecordResponse(BaseModel):
    student_id: str | None = None
    metadata_hash: str | None = None
    metadata_hash_version: str | None = None

    full_name: str | None = None
    institution_code: str | None = None
    institution_name: str | None = None
    faculty_name: str | None = None
    major: str | None = None
    training_mode: str | None = None
    degree_id: str | None = None
    degree_type: str | None = None
    entrance_year: str | int | None = None

    graduation_status: str | None = None
    graduation_date: str | None = None
    graduation_year: str | int | None = None
    classification: str | None = None
    gpa: str | None = None
    total_credits: str | int | None = None

    issuer_msp: str | None = None
    transaction_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

# EXPLORER_CHANGED_HASH_RESPONSE_V1
class ExplorerSearchResponse(BaseModel):
    lookup: str
    lookup_type: str
    record: ExplorerRecordResponse | None = None
    transaction: ExplorerTransactionResponse | None = None
    block: ExplorerBlockResponse | None = None
    verification_status: str | None = None
    message: str | None = None
    current_metadata_hash: str | None = None
    confirmed_metadata_hash: str | None = None


# FABRIC_EXPLORER_BLOCKS_PAGE_V1
class ExplorerBlockPageResponse(BaseModel):
    height: int
    page: int
    page_size: int
    total_blocks: int
    total_pages: int
    items: list[ExplorerBlockResponse] = Field(default_factory=list)


# FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1
class ExplorerTransactionPageResponse(BaseModel):
    height: int
    page: int
    page_size: int
    total_transactions: int
    total_pages: int
    items: list[ExplorerTransactionResponse] = Field(default_factory=list)
