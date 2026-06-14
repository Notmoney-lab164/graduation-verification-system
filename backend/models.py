from sqlalchemy import Boolean, Column, Date, DateTime, Enum
from sqlalchemy import Integer, Numeric, String, func

from database import Base


class Student(Base):
    """
    Bang luu thong tin sinh vien.

    Quy trinh:
        1. Admin them sinh vien vao MySQL.
        2. Backend tao metadata_hash tu du lieu sinh vien.
        3. Admin sync Blockchain de luu metadata_hash.
        4. Khi verify, he thong so sanh hash MySQL voi hash Blockchain.
    """

    __tablename__ = "students"

    # --- Thong tin ca nhan ---
    student_id = Column(String(20), primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    citizen_id_hash = Column(String(64), nullable=False)
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

    # --- Blockchain ---
    metadata_hash = Column(String(64), nullable=True)
    blockchain_tx_id = Column(String(100), nullable=True)
    is_mismatch = Column(Boolean, default=False)

    # --- Xoa mem ---
    # Khi admin xoa sinh vien, he thong khong xoa khoi database.
    # Thay vao do, chi danh dau is_deleted=True de co the audit/khoi phuc sau nay.
    is_deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)
    deleted_by = Column(String(50), nullable=True)

    # --- He thong ---
    updated_by = Column(String(50), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


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