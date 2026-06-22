from sqlalchemy import Boolean, Column, Date, DateTime, Enum, Text
from sqlalchemy import Integer, Numeric, String, func

from database import Base


class Student(Base):
    """
    Bang luu thong tin sinh vien chinh thuc cua truong.

    Quy trinh:
        1. Admin them sinh vien chinh thuc vao MySQL.
        2. Backend tao metadata_hash tu du lieu sinh vien.
        3. Backend sync Blockchain de luu metadata_hash.
        4. Khi verify, he thong so sanh hash MySQL voi hash Blockchain.
    """

    __tablename__ = "students"

    # --- Thong tin ca nhan ---
    student_id = Column(String(20), primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    citizen_id_hash = Column(String(64), nullable=False)
    # --- Thong tin rieng tu: chi dung cho Admin in giay ---
    citizen_id_encrypted = Column(Text, nullable=True)
    citizen_id_issue_date = Column(Date, nullable=True)
    citizen_id_issue_place_encrypted = Column(Text, nullable=True)
    permanent_address_encrypted = Column(Text, nullable=True)
    email = Column(String(150), nullable=True)

    # --- Thong tin truong ---
    institution_code = Column(String(50), nullable=False, index=True)
    institution_name = Column(String(200), nullable=False)
    faculty_name = Column(String(150), nullable=False)
    major = Column(String(150), nullable=False)
    training_mode = Column(String(50), nullable=True)

    # --- Thong tin bang cap ---
    degree_id = Column(String(50), unique=True, nullable=False)
    degree_type = Column(String(50), nullable=False)

    # --- Thong tin tot nghiep ---
    graduation_status = Column(String(30), nullable=False, index=True)
    graduation_date = Column(Date, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    classification = Column(String(50), nullable=True)
    gpa = Column(Numeric(4, 2), nullable=True)
    total_credits = Column(Integer, nullable=True)
    entrance_year = Column(Integer, nullable=True)
    expected_graduation_date = Column(Date, nullable=True)
    academic_status = Column(String(50), nullable=True)

    # --- Blockchain ---
    metadata_hash = Column(String(64), nullable=True)
    blockchain_tx_id = Column(String(100), nullable=True)
    is_mismatch = Column(Boolean, default=False)

    # --- Xoa mem ---
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(50), nullable=True)

    # --- Xac nhan ho so ---
    approval_status = Column(String(30), nullable=False, default="APPROVED")
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String(50), nullable=True)

    # --- He thong ---
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ExternalRequest(Base):
    """
    Bang luu thong tin ben ngoai gui vao de admin kiem tra.

    Quy trinh:
        1. Ben ngoai gui thong tin sinh vien can xac minh.
        2. Backend luu vao external_requests voi status=PENDING_REVIEW.
        3. Admin kiem tra:
            - Neu dung sinh vien truong: APPROVED va co the tao Student chinh thuc.
            - Neu sai/khong hop le: REJECTED.
        4. Public verify khong doc truc tiep bang nay.
    """

    __tablename__ = "external_requests"

    id = Column(Integer, primary_key=True, index=True)

    # --- Thong tin duoc gui vao ---
    student_id = Column(String(20), nullable=False, index=True)
    full_name = Column(String(100), nullable=True)
    gpa = Column(Numeric(4, 2), nullable=True)
    graduation_status = Column(String(30), nullable=True)

    # --- Thong tin nguoi gui yeu cau ---
    requester_name = Column(String(100), nullable=True)
    requester_email = Column(String(150), nullable=True)
    requester_type = Column(String(50), nullable=True)
    message = Column(Text, nullable=True)

    # --- Trang thai xu ly ---
    status = Column(String(30), nullable=False, default="PENDING_REVIEW")
    reviewed_by = Column(String(50), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)

    # --- He thong ---
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CertificateRequest(Base):
    """
    Bang luu yeu cau cap giay xac nhan chinh thuc.

    Quy trinh:
        1. User/doanh nghiep gui yeu cau cap giay xac nhan tu trang verify.
        2. Backend luu vao certificate_requests voi status=CERTIFICATE_PENDING.
        3. Admin xem dashboard va xu ly:
            - CERTIFICATE_APPROVED: chap nhan, ghi huong dan nhan giay.
            - CERTIFICATE_REJECTED: tu choi, ghi ly do.
        4. Email thong bao co the bo sung sau.
    """

    __tablename__ = "certificate_requests"

    id = Column(Integer, primary_key=True, index=True)

    # --- Sinh vien can xac nhan ---
    student_id = Column(String(20), nullable=False, index=True)

    # --- Thong tin nguoi yeu cau ---
    requester_name = Column(String(100), nullable=False)
    requester_email = Column(String(150), nullable=False)
    reason = Column(Text, nullable=False)

    # --- Trang thai xu ly ---
    status = Column(String(40), nullable=False, default="CERTIFICATE_PENDING")
    admin_note = Column(Text, nullable=True)
    reject_reason = Column(Text, nullable=True)

    reviewed_by = Column(String(50), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    # --- He thong ---
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class CertificateEmailVerification(Base):
    """
    Luu OTP xac minh email truoc khi user gui yeu cau giay xac nhan.

    Khong luu OTP dang ro. Chi luu hash cua OTP.
    """

    __tablename__ = "certificate_email_verifications"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(String(20), nullable=False, index=True)
    requester_email = Column(String(150), nullable=False, index=True)
    purpose = Column(
        String(50),
        nullable=False,
        default="CERTIFICATE_REQUEST",
    )

    # SHA-256 cua OTP 6 so, khong luu OTP that.
    otp_hash = Column(String(64), nullable=False)

    # Token tra ve sau khi OTP dung; frontend gui token nay khi tao request.
    verification_token_hash = Column(
        String(64),
        unique=True,
        nullable=True,
    )

    attempt_count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime, nullable=False)

    verified_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
    )


class User(Base):
    """
    Bang luu tai khoan admin quan ly he thong.
    Sinh vien va doanh nghiep khong can dang nhap de verify public.
    """

    __tablename__ = "users"

    # --- Thong tin tai khoan ---
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(
        Enum("admin", "viewer", name="user_role"),
        nullable=False,
    )
    email = Column(String(150), nullable=True)

    # --- Trang thai tai khoan ---
    is_active = Column(Boolean, default=True)
    last_login = Column(DateTime, nullable=True)

    # --- He thong ---
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

class AuditLog(Base):
    """
    Luu lich su thao tac quan trong trong he thong.

    Khong luu CCCD, dia chi, hoac du lieu nhay cam dang giai ma.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Tai khoan da thuc hien thao tac.
    username = Column(String(50), nullable=False, index=True)

    # Vi du: CREATE_STUDENT, UPDATE_STUDENT, APPROVE_CERTIFICATE_REQUEST.
    action = Column(String(100), nullable=False, index=True)

    # Vi du: Student, CertificateRequest, ExternalRequest.
    entity_type = Column(String(50), nullable=False)

    # Vi du: SVFAB012 hoac request id 3.
    entity_id = Column(String(100), nullable=False, index=True)

    # Chi luu mo ta an toan, khong luu CCCD that.
    details = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)