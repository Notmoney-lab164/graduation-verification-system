from dataclasses import dataclass
from typing import Any

import fabric_client
from services.hash_service import (
    METADATA_HASH_VERSION,
    calculate_student_hash,
)


@dataclass
class BlockchainRecord:
    student_id: str
    metadata_hash: str
    graduation_status: str
    tx_id: str | None = None
    hash_version: str = METADATA_HASH_VERSION


# MULTI_USER_APPROVAL_RECOVERY_V1
def _record_matches_student(record: dict[str, Any], student) -> bool:
    expected_hash = str(getattr(student, "metadata_hash", "") or "").lower()
    recorded_hash = str(record.get("metadataHash") or "").lower()
    return bool(expected_hash) and recorded_hash == expected_hash


def _to_blockchain_record(record: dict[str, Any], student) -> BlockchainRecord:
    return BlockchainRecord(
        student_id=record.get("studentId", student.student_id),
        metadata_hash=record.get("metadataHash", student.metadata_hash),
        graduation_status=record.get(
            "graduationStatus",
            student.graduation_status,
        ),
        tx_id=record.get("transactionId"),
        hash_version=(
            record.get("hashVersion")
            or getattr(student, "metadata_hash_version", None)
            or METADATA_HASH_VERSION
        ),
    )


def sync_student_to_blockchain(student) -> BlockchainRecord:
    # A previous request may have committed to Fabric before its MySQL commit
    # failed. Reuse that immutable receipt instead of writing a duplicate tx.
    existing_record = get_student_from_blockchain(student.student_id)
    if existing_record is not None:
        if not _record_matches_student(existing_record, student):
            raise fabric_client.FabricClientError(
                "Blockchain already contains a different record for this student"
            )
        return _to_blockchain_record(existing_record, student)

    try:
        fabric_student = fabric_client.sync_student(student)
    except Exception as invoke_error:
        # The CLI can time out after Orderer/peers have already committed. Query
        # once to recover the receipt; otherwise preserve the original error.
        try:
            recovered_record = get_student_from_blockchain(student.student_id)
        except Exception:
            raise invoke_error

        if (
            recovered_record is None
            or not _record_matches_student(recovered_record, student)
        ):
            raise invoke_error
        fabric_student = recovered_record

    return _to_blockchain_record(fabric_student, student)


def record_student_rejection_on_blockchain(student) -> BlockchainRecord:
    decision = fabric_client.record_student_rejection(student)

    return BlockchainRecord(
        student_id=decision["student_id"] or student.student_id,
        metadata_hash=decision["metadata_hash"] or student.metadata_hash,
        graduation_status=student.graduation_status,
        tx_id=decision.get("transaction_id"),
    )


# EXTERNAL_REQUEST_FABRIC_DECISION_V1
def record_external_request_rejection_on_blockchain(
    student_id: str,
    source_data_hash: str,
) -> dict[str, str | None]:
    return fabric_client.record_external_request_rejection(
        student_id,
        source_data_hash,
    )


def get_student_from_blockchain(student_id: str) -> dict[str, Any] | None:
    try:
        return fabric_client.query_student(student_id)
    except fabric_client.StudentNotFoundError:
        return None


def verify_student_on_blockchain(student):
    student.metadata_hash_version = METADATA_HASH_VERSION
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