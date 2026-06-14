import hashlib
import json
from decimal import Decimal


HASH_FIELDS = [
    "student_id",
    "full_name",
    "date_of_birth",
    "citizen_id_hash",
    "institution_code",
    "institution_name",
    "faculty_name",
    "major",
    "training_mode",
    "degree_id",
    "degree_type",
    "graduation_status",
    "graduation_date",
    "graduation_year",
    "classification",
    "gpa",
    "total_credits",
    "entrance_year",
]


def _normalize_value(value):
    if value is None:
        return None

    if isinstance(value, Decimal):
        return str(value)

    return str(value)


def build_student_metadata(student):
    return {
        field: _normalize_value(getattr(student, field, None))
        for field in HASH_FIELDS
    }


def calculate_student_hash(student) -> str:
    metadata = build_student_metadata(student)
    canonical_json = json.dumps(
        metadata,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
