from dataclasses import dataclass
from typing import Any

import fabric_client
from services.hash_service import calculate_student_hash


@dataclass
class BlockchainRecord:
    student_id: str
    metadata_hash: str
    graduation_status: str
    tx_id: str | None = None


def sync_student_to_blockchain(student) -> BlockchainRecord:
    fabric_student = fabric_client.sync_student(student)

    return BlockchainRecord(
        student_id=fabric_student.get("studentId", student.student_id),
        metadata_hash=fabric_student.get("metadataHash", student.metadata_hash),
        graduation_status=fabric_student.get(
            "graduationStatus",
            student.graduation_status,
        ),
        tx_id=fabric_student.get("transactionId"),
    )


def get_student_from_blockchain(student_id: str) -> dict[str, Any] | None:
    try:
        return fabric_client.query_student(student_id)
    except fabric_client.StudentNotFoundError:
        return None


def verify_student_on_blockchain(student):
    current_metadata_hash = calculate_student_hash(student)
    record = get_student_from_blockchain(student.student_id)

    if record is None:
        return {
            "verification_status": "Not Found",
            "metadata_hash_mysql": current_metadata_hash,
            "metadata_hash_blockchain": None,
            "message": "Student exists in MySQL but does not exist on blockchain.",
        }

    blockchain_hash = record.get("metadataHash")

    if blockchain_hash != current_metadata_hash:
        return {
            "verification_status": "Mismatch",
            "metadata_hash_mysql": current_metadata_hash,
            "metadata_hash_blockchain": blockchain_hash,
            "message": "Student data has been changed. MySQL hash does not match blockchain hash.",
        }

    return {
        "verification_status": "Verified",
        "metadata_hash_mysql": current_metadata_hash,
        "metadata_hash_blockchain": blockchain_hash,
        "message": "Student data is verified on blockchain.",
    }