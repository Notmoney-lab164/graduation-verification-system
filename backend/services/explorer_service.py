"""Public, privacy-preserving read models for the Fabric Explorer."""

from __future__ import annotations

import re
from typing import Any

import fabric_client


METADATA_HASH_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")
TRANSACTION_ID_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")
# FABRIC_BLOCK_HASH_V1


def _public_record(record: dict[str, Any]) -> dict[str, Any]:
    """Expose only immutable/public academic facts from the Fabric record."""
    return {
        "student_id": record.get("studentId"),
        "full_name": record.get("fullName"),
        "institution_code": record.get("institutionCode"),
        "institution_name": record.get("institutionName"),
        "faculty_name": record.get("facultyName"),
        "major": record.get("major"),
        "training_mode": record.get("trainingMode"),
        "degree_id": record.get("degreeId"),
        "degree_type": record.get("degreeType"),
        "entrance_year": record.get("entranceYear"),
        "graduation_status": record.get("graduationStatus"),
        "graduation_date": record.get("graduationDate"),
        "graduation_year": record.get("graduationYear"),
        "classification": record.get("classification"),
        "gpa": record.get("gpa"),
        "total_credits": record.get("totalCredits"),
        "metadata_hash": record.get("metadataHash"),
        "metadata_hash_version": record.get("hashVersion") or "v2",
        "issuer_msp": record.get("issuerMsp"),
        "transaction_id": record.get("transactionId"),
        "created_at": record.get("createdAt"),
        "updated_at": record.get("updatedAt"),
    }


def search_explorer(lookup: str) -> dict[str, Any] | None:
    value = str(lookup or "").strip().lower()

    if not value:
        return None

    # EXPLORER_64_HEX_SEARCH_ONLY_V1
    if not TRANSACTION_ID_PATTERN.fullmatch(value):
        raise fabric_client.FabricClientError(
            "Explorer accepts only a 64-character hexadecimal code"
        )

    # Fabric transaction IDs, BlockHash and SHA-256 metadata hashes are all
    # 64 hex characters. Prefer transaction, then block, then student data.
    # characters. Prefer a real transaction match, then try the hash index.
    if TRANSACTION_ID_PATTERN.fullmatch(value):
        transaction = fabric_client.find_transaction_by_id(value)
        if transaction:
            return {
                "lookup": value,
                "lookup_type": "transaction_id",
                "record": None,
                "transaction": transaction,
            }

        block = fabric_client.find_block_by_hash(value)
        if block:
            return {
                "lookup": value,
                "lookup_type": "block_hash",
                "record": None,
                "transaction": None,
                "block": block,
            }

    if METADATA_HASH_PATTERN.fullmatch(value):
        try:
            record = fabric_client.query_student_by_metadata_hash(value)
        except fabric_client.StudentNotFoundError:
            return None

        transaction_id = str(record.get("transactionId") or "")
        transaction = (
            fabric_client.find_transaction_by_id(transaction_id)
            if transaction_id
            else None
        )
        return {
            "lookup": value,
            "lookup_type": "metadata_hash",
            "record": _public_record(record),
            "transaction": transaction,
        }

    raise fabric_client.FabricClientError(
        "Explorer accepts only a 64-character Fabric BlockHash, transaction ID, "
        "or SHA-256 student metadata hash"
    )


def list_recent_blocks(limit: int) -> dict[str, Any]:
    return fabric_client.get_recent_blocks(limit)


def list_recent_transactions(limit: int) -> dict[str, Any]:
    return fabric_client.get_recent_transactions(limit)


# FABRIC_EXPLORER_NAVIGATION_V1
def get_block_detail(block_number: int) -> dict[str, Any]:
    return fabric_client.get_block_by_number(block_number)


def get_transaction_detail(transaction_id: str) -> dict[str, Any] | None:
    # EXPLORER_TRANSACTION_NAVIGATION_V1
    return fabric_client.get_transaction_with_navigation(transaction_id)


# FABRIC_EXPLORER_BLOCKS_PAGE_V1
def list_blocks_page(page: int, page_size: int) -> dict[str, Any]:
    return fabric_client.get_blocks_page(page, page_size)


# FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1
def list_transactions_page(page: int, page_size: int) -> dict[str, Any]:
    return fabric_client.get_transactions_page(page, page_size)
