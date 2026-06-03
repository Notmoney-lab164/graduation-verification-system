from sqlalchemy import Column, Date, DateTime, Integer, Numeric, String, func

from database import Base


class Student(Base):
    __tablename__ = "students"

    student_id = Column(String(20), primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    date_of_birth = Column(Date, nullable=True)
    citizen_id_hash = Column(String(64), nullable=False)

    institution_code = Column(String(50), nullable=False)
    institution_name = Column(String(200), nullable=False)
    faculty_name = Column(String(150), nullable=False)
    major = Column(String(150), nullable=False)

    degree_id = Column(String(50), unique=True, nullable=False)
    degree_type = Column(String(50), nullable=False)

    graduation_status = Column(String(30), nullable=False)
    graduation_date = Column(Date, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    classification = Column(String(50), nullable=True)
    gpa = Column(Numeric(3, 2), nullable=True)
    total_credits = Column(Integer, nullable=True)
    entrance_year = Column(Integer, nullable=True)

    metadata_hash = Column(String(64), nullable=True)
    blockchain_tx_id = Column(String(100), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
