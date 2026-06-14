from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

# ============================================================
# SCHEMAS - Dinh nghia cau truc du lieu vao/ra cua API
#
# So do quan he:
#
#   StudentBase
#       ├── StudentCreate              (Them moi SV)
#       └── StudentResponse            (Tra ve thong tin SV)
#
#   StudentUpdate                      (Cap nhat SV)
#   VerifyResponse                     (Ket qua xac minh Blockchain)
#   StatsResponse                      (Thong ke Dashboard)
#   StudentListResponse                (Danh sach SV co phan trang)
#   BlockchainSyncResponse             (Ket qua sync Blockchain)
#   PDFExportResponse                  (Thong tin file PDF xac minh)
#   LoginRequest                       (Dang nhap admin)
#   TokenResponse                      (Token sau khi login)
# ============================================================


class StudentBase(BaseModel):
    student_id: str = Field(..., max_length=20)
    full_name: str = Field(..., max_length=100)
    date_of_birth: date | None = None
    citizen_id_hash: str = Field(..., max_length=64)
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


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    full_name: str | None = None
    date_of_birth: date | None = None
    citizen_id_hash: str | None = None
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


class StudentResponse(StudentBase):
    metadata_hash: str | None = None
    blockchain_tx_id: str | None = None
    updated_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class VerifyResponse(BaseModel):
    student_id: str
    full_name: str | None = None
    major: str | None = None
    degree_type: str | None = None
    graduation_status: str
    graduation_date: date | None = None
    graduation_year: int | None = None
    classification: str | None = None
    gpa: Decimal | None = None
    verification_status: str
    message: str
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


class BlockchainSyncResponse(BaseModel):
    message: str
    student_id: str
    metadata_hash: str
    tx_id: str
    synced_at: datetime


class PDFExportResponse(BaseModel):
    student_id: str
    file_name: str
    download_url: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"