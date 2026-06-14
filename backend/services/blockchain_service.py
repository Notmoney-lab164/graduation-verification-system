from dataclasses import dataclass


@dataclass
class BlockchainRecord:
    student_id: str
    metadata_hash: str
    graduation_status: str
    tx_id: str | None = None


_mock_blockchain_storage: dict[str, BlockchainRecord] = {}


def sync_student_to_blockchain(student) -> BlockchainRecord:
    tx_id = f"mock-tx-{student.student_id}"

    record = BlockchainRecord(
        student_id=student.student_id,
        metadata_hash=student.metadata_hash,
        graduation_status=student.graduation_status,
        tx_id=tx_id,
    )

    _mock_blockchain_storage[student.student_id] = record

    return record


def get_student_from_blockchain(student_id: str) -> BlockchainRecord | None:
    return _mock_blockchain_storage.get(student_id)


def verify_student_on_blockchain(student):
    record = get_student_from_blockchain(student.student_id)

    if record is None:
        return {
            "verification_status": "Not Found",
            "metadata_hash_blockchain": None,
            "message": "Student exists in MySQL but has not been synced to blockchain.",
        }

    if record.metadata_hash != student.metadata_hash:
        return {
            "verification_status": "Mismatch",
            "metadata_hash_blockchain": record.metadata_hash,
            "message": "Student data hash does not match blockchain record.",
        }

    return {
        "verification_status": "Verified",
        "metadata_hash_blockchain": record.metadata_hash,
        "message": "Student data is verified on blockchain.",
    }

