from sqlalchemy import Boolean, Column, Date, DateTime, Enum, Text
from sqlalchemy import Integer, Numeric, String, func

from database import Base


class Student(Base):
    """Thong tin sinh vien chinh thuc da duoc truong tiep nhan."""

    __tablename__ = "students"

    # Thong tin ca nhan
    student_id = Column(String(20), primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)

    # Hash dung de kiem tra trung; du lieu ro duoc ma hoa rieng.
    citizen_id_hash = Column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )
    citizen_id_encrypted = Column(Text, nullable=True)
    citizen_id_issue_date = Column(Date, nullable=True)
    citizen_id_issue_place_encrypted = Column(Text, nullable=True)
    permanent_address_encrypted = Column(Text, nullable=True)
    email = Column(String(150), unique=True, nullable=True, index=True)

    # Thong tin truong
    institution_code = Column(String(50), nullable=False, index=True)
    institution_name = Column(String(200), nullable=False)
    faculty_name = Column(String(150), nullable=False)
    major = Column(String(150), nullable=False)
    training_mode = Column(String(50), nullable=True)

    # Thong tin bang cap
    degree_id = Column(String(50), unique=True, nullable=True)
    degree_type = Column(String(50), nullable=False)

    # Thong tin tot nghiep
    graduation_status = Column(String(30), nullable=False, index=True)
    graduation_date = Column(Date, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    classification = Column(String(50), nullable=True)
    gpa = Column(Numeric(4, 2), nullable=True)
    total_credits = Column(Integer, nullable=True)
    entrance_year = Column(Integer, nullable=True)
    expected_graduation_date = Column(Date, nullable=True)
    academic_status = Column(String(50), nullable=True)

    # Blockchain
    metadata_hash = Column(String(64), nullable=True)
    # v1 keeps legacy hashes verifiable; new records use v2.
    metadata_hash_version = Column(
        String(10),
        nullable=False,
        default="v1",
        server_default="v1",
    )
    blockchain_tx_id = Column(String(100), nullable=True)
    is_mismatch = Column(Boolean, default=False)

    # Xoa mem
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(50), nullable=True)

    # Xac nhan ho so
    approval_status = Column(String(30), nullable=False, default="APPROVED")
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String(50), nullable=True)

    # He thong
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ExternalRequest(Base):
    """
    Ho so sinh vien tu CSV/XLSX cua nguon ben ngoai.

    Moi dong trong tep la mot ho so cho admin xem xet. Ho so chi duoc
    chuyen vao bang students va dong bo Blockchain sau khi admin duyet.
    """

    __tablename__ = "external_requests"

    id = Column(Integer, primary_key=True, index=True)

    # Thong tin tom tat de hien nhanh trong danh sach admin
    student_id = Column(String(20), nullable=False, index=True)
    full_name = Column(String(100), nullable=True)
    gpa = Column(Numeric(4, 2), nullable=True)
    graduation_status = Column(String(30), nullable=True)

    # Don vi/nguon cung cap tep
    requester_name = Column(String(100), nullable=True)
    requester_email = Column(String(150), nullable=True)
    requester_type = Column(String(50), nullable=True, index=True)
    message = Column(Text, nullable=True)

    # Nguon tep va ket qua kiem tra truoc khi admin duyet
    source_file_name = Column(String(255), nullable=True, index=True)
    source_row_number = Column(Integer, nullable=True)
    verification_status = Column(
        String(40),
        nullable=False,
        default="PENDING",
        index=True,
    )
    verification_message = Column(Text, nullable=True)
    matched_student_name = Column(String(100), nullable=True)

    # Toan bo du lieu cua mot dong CSV/XLSX. Main se ma hoa chuoi JSON
    # truoc khi luu vi trong payload co so CCCD/CMND.
    import_data = Column(Text, nullable=True)

    # EXTERNAL_REQUEST_FABRIC_DECISION_V1
    # Bang chung xu ly tren Fabric. Ly do chi tiet van chi luu noi bo.
    source_data_hash = Column(String(64), nullable=True)
    blockchain_tx_id = Column(String(100), nullable=True)
    blockchain_action = Column(String(50), nullable=True)

    # Trang thai admin xu ly ho so staging
    status = Column(
        String(30),
        nullable=False,
        default="PENDING_REVIEW",
        index=True,
    )
    reviewed_by = Column(String(50), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)

    # Xoa mem/lua tru ho so da xu ly; khong xoa sinh vien hoac Blockchain.
    is_deleted = Column(Boolean, nullable=False, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(50), nullable=True)

    # He thong
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CertificateRequest(Base):
    """Yeu cau cap giay xac nhan tot nghiep cua nguoi dung."""

    __tablename__ = "certificate_requests"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(String(20), nullable=False, index=True)

    requester_name = Column(String(100), nullable=False)
    requester_email = Column(String(150), nullable=False)
    reason = Column(Text, nullable=False)

    status = Column(
        String(40),
        nullable=False,
        default="CERTIFICATE_PENDING",
        index=True,
    )
    admin_note = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)

    reviewed_by = Column(String(50), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CertificateEmailVerification(Base):
    """OTP xac minh email truoc khi tao yeu cau cap giay."""

    __tablename__ = "certificate_email_verifications"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(String(20), nullable=False, index=True)
    requester_email = Column(String(150), nullable=False, index=True)
    purpose = Column(
        String(50),
        nullable=False,
        default="CERTIFICATE_REQUEST",
    )

    # Chi luu SHA-256 cua OTP, khong luu ma OTP dang ro.
    otp_hash = Column(String(64), nullable=False)
    verification_token_hash = Column(String(64), unique=True, nullable=True)

    attempt_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)
    verified_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class User(Base):
    """Tai khoan quan tri he thong."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("admin", "viewer", name="user_role"),
        nullable=False,
    )
    email = Column(String(150), nullable=True)

    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Lich su thao tac, khong chua du lieu nhay cam dang ro."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(100), nullable=False, index=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class EmailSetting(Base):
    """Cau hinh SMTP; App Password luon duoc luu o dang ma hoa."""

    __tablename__ = "email_settings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)

    smtp_host = Column(String(150), nullable=False)
    smtp_port = Column(Integer, nullable=False, default=587)
    smtp_username = Column(String(150), nullable=False)
    smtp_password_encrypted = Column(Text, nullable=False)
    smtp_from_email = Column(String(150), nullable=False)
    smtp_from_name = Column(String(150), nullable=False)

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
