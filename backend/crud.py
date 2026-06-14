from datetime import datetime

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
import schemas
from services.hash_service import calculate_student_hash


def get_student(db: Session, student_id: str):
    return (
        db.query(models.Student)
        .filter(
            models.Student.student_id == student_id,
            models.Student.is_deleted == False,
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
    query = db.query(models.Student).filter(models.Student.is_deleted == False)

    if search:
        keyword = f"%{search}%"
        query = query.filter(
            or_(
                models.Student.student_id.like(keyword),
                models.Student.full_name.like(keyword),
            )
        )

    if graduation_status:
        query = query.filter(models.Student.graduation_status == graduation_status)

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
):
    student = models.Student(**student_data.model_dump())
    student.updated_by = updated_by
    student.metadata_hash = calculate_student_hash(student)
    student.is_mismatch = False
    student.is_deleted = False

    db.add(student)
    db.commit()
    db.refresh(student)

    return student


def update_student(
    db: Session,
    student: models.Student,
    student_data: schemas.StudentUpdate,
    updated_by: str | None = "admin",
    sync_hash: bool = True,
):
    update_data = student_data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(student, key, value)

    student.updated_by = updated_by

    if sync_hash:
        student.metadata_hash = calculate_student_hash(student)

    db.commit()
    db.refresh(student)

    return student


def delete_student(
    db: Session,
    student: models.Student,
    deleted_by: str | None = "admin",
):
    student.is_deleted = True
    student.deleted_at = datetime.utcnow()
    student.deleted_by = deleted_by

    db.commit()
    db.refresh(student)

    return student


def get_stats(db: Session):
    active_students = db.query(models.Student).filter(models.Student.is_deleted == False)

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
        .filter(models.Student.is_mismatch == True)
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