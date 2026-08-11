import base64
import hashlib
import json
import tempfile
import os
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any, Callable

from dotenv import load_dotenv

load_dotenv()




class FabricClientError(RuntimeError):
    pass


class StudentNotFoundError(FabricClientError):
    pass


class StudentAlreadyExistsError(FabricClientError):
    pass


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)

    if not value:
        raise FabricClientError(f"Missing environment variable: {name}")

    return value


def _testnet_path() -> Path:
    return Path(_env("FABRIC_TESTNET")).expanduser().resolve()


STUDENT_ID_PATTERN = re.compile(r"^[A-Z0-9]{3,20}$")


def _validate_student_id(student_id: str) -> str:
    value = str(student_id or "").strip().upper()

    if not STUDENT_ID_PATTERN.fullmatch(value):
        raise FabricClientError("Invalid student_id format")

    return value


def _normalize_gpa(gpa: Any) -> str:
    if gpa is None:
        return ""

    return str(gpa).strip()


def _fabric_arg(value: Any) -> str:
    if value is None:
        return ""
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat) and not isinstance(value, str):
        return isoformat()
    return str(value).strip()


def _parse_json(output: str) -> dict[str, Any]:
    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise FabricClientError(f"Invalid Fabric JSON response: {output}") from exc


def _extract_tx_id(output: str) -> str | None:
    match = re.search(r"txid \[([a-fA-F0-9]+)\]", output)

    if match:
        return match.group(1)

    return None


def build_peer_env() -> dict[str, str]:
    testnet = _testnet_path()

    peer_msp = (
        testnet
        / "organizations"
        / "peerOrganizations"
        / "org1.example.com"
    )

    return {
        **os.environ,
        "PATH": f"{testnet.parent / 'bin'}:{os.environ.get('PATH', '')}",
        "FABRIC_CFG_PATH": str(testnet.parent / "config"),
        "CORE_PEER_TLS_ENABLED": "true",
        "CORE_PEER_LOCALMSPID": _env("FABRIC_MSP_ID", "Org1MSP"),
        "CORE_PEER_MSPCONFIGPATH": str(
            peer_msp
            / "users"
            / "Admin@org1.example.com"
            / "msp"
        ),
        "CORE_PEER_TLS_ROOTCERT_FILE": str(
            peer_msp
            / "peers"
            / "peer0.org1.example.com"
            / "tls"
            / "ca.crt"
        ),
        "CORE_PEER_ADDRESS": _env("FABRIC_PEER_ENDPOINT", "localhost:7051"),
    }


def _orderer_ca_file() -> str:
    testnet = _testnet_path()

    return str(
        testnet
        / "organizations"
        / "ordererOrganizations"
        / "example.com"
        / "orderers"
        / "orderer.example.com"
        / "msp"
        / "tlscacerts"
        / "tlsca.example.com-cert.pem"
    )


def _peer0_org1_ca_file() -> str:
    testnet = _testnet_path()

    return str(
        testnet
        / "organizations"
        / "peerOrganizations"
        / "org1.example.com"
        / "peers"
        / "peer0.org1.example.com"
        / "tls"
        / "ca.crt"
    )


def _peer0_org2_ca_file() -> str:
    testnet = _testnet_path()

    return str(
        testnet
        / "organizations"
        / "peerOrganizations"
        / "org2.example.com"
        / "peers"
        / "peer0.org2.example.com"
        / "tls"
        / "ca.crt"
    )


def run_peer_command(args: list[str]) -> str:
    timeout = int(_env("FABRIC_QUERY_TIMEOUT", "10"))

    result = subprocess.run(
        ["peer", *args],
        cwd=str(_testnet_path()),
        env=build_peer_env(),
        text=True,
        capture_output=True,
        timeout=timeout,
    )

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()
    combined_output = "\n".join(item for item in [stdout, stderr] if item)

    if result.returncode != 0:
        message = combined_output

        if "STUDENT_NOT_FOUND" in message or "does not exist" in message:
            raise StudentNotFoundError(message)

        if "STUDENT_ALREADY_EXISTS" in message or "already exists" in message:
            raise StudentAlreadyExistsError(message)

        raise FabricClientError(message)

    return combined_output


def peer_query(function_name: str, *args: str) -> str:
    channel = _env("FABRIC_CHANNEL", "mychannel")
    chaincode = _env("FABRIC_CHAINCODE", "graduation")
    payload = json.dumps({"Args": [function_name, *args]})

    output = run_peer_command([
        "chaincode",
        "query",
        "-C",
        channel,
        "-n",
        chaincode,
        "-c",
        payload,
    ])

    return output.strip()


def peer_invoke(function_name: str, *args: str) -> str:
    channel = _env("FABRIC_CHANNEL", "mychannel")
    chaincode = _env("FABRIC_CHAINCODE", "graduation")
    payload = json.dumps({"Args": [function_name, *args]})

    output = run_peer_command([
        "chaincode",
        "invoke",
        "-o",
        _env("FABRIC_ORDERER_ENDPOINT", "localhost:7050"),
        "--ordererTLSHostnameOverride",
        _env("FABRIC_ORDERER_HOSTNAME", "orderer.example.com"),
        "--tls",
        "--cafile",
        _orderer_ca_file(),
        "-C",
        channel,
        "-n",
        chaincode,
        "--peerAddresses",
        _env("FABRIC_PEER_ENDPOINT", "localhost:7051"),
        "--tlsRootCertFiles",
        _peer0_org1_ca_file(),
        "--peerAddresses",
        _env("FABRIC_ORG2_PEER_ENDPOINT", "localhost:9051"),
        "--tlsRootCertFiles",
        _peer0_org2_ca_file(),
        "--waitForEvent",
        "-c",
        payload,
    ])
    _invalidate_explorer_cache()
    return output


def sync_student(student) -> dict[str, Any]:
    student_id = _validate_student_id(student.student_id)
    gpa = _normalize_gpa(student.gpa)
    graduation_status = str(student.graduation_status or "").strip()
    metadata_hash = str(student.metadata_hash or "").strip().lower()

    if not gpa:
        raise FabricClientError("Student GPA is required")
    if not graduation_status:
        raise FabricClientError("Student graduation status is required")
    if not METADATA_HASH_PATTERN.fullmatch(metadata_hash):
        raise FabricClientError("Student has no valid v2 metadata hash")

    output = peer_invoke(
        "syncStudentV2",
        student_id,
        _fabric_arg(getattr(student, "full_name", None)),
        _fabric_arg(getattr(student, "institution_code", None)),
        _fabric_arg(getattr(student, "institution_name", None)),
        _fabric_arg(getattr(student, "faculty_name", None)),
        _fabric_arg(getattr(student, "major", None)),
        _fabric_arg(getattr(student, "training_mode", None)),
        _fabric_arg(getattr(student, "degree_id", None)),
        _fabric_arg(getattr(student, "degree_type", None)),
        _fabric_arg(getattr(student, "entrance_year", None)),
        graduation_status,
        _fabric_arg(getattr(student, "graduation_date", None)),
        _fabric_arg(getattr(student, "graduation_year", None)),
        _fabric_arg(getattr(student, "classification", None)),
        gpa,
        _fabric_arg(getattr(student, "total_credits", None)),
        metadata_hash,
    )

    tx_id = _extract_tx_id(output)
    record = query_student(student_id)
    if tx_id:
        record["transactionId"] = tx_id
    return record


def record_student_rejection(student) -> dict[str, str | None]:
    student_id = _validate_student_id(student.student_id)
    metadata_hash = str(student.metadata_hash or "").strip().lower()

    if not METADATA_HASH_PATTERN.fullmatch(metadata_hash):
        raise FabricClientError("Student has no valid SHA-256 metadata hash")

    output = peer_invoke(
        "recordStudentRejectionV2",
        student_id,
        metadata_hash,
    )

    return {
        "student_id": student_id,
        "metadata_hash": metadata_hash,
        "transaction_id": _extract_tx_id(output),
        "output": output,
    }


# EXTERNAL_REQUEST_FABRIC_DECISION_V1
def record_external_request_rejection(
    student_id: str,
    source_data_hash: str,
) -> dict[str, str | None]:
    normalized_student_id = str(student_id or "").strip().upper()
    normalized_source_hash = str(source_data_hash or "").strip().lower()

    if not normalized_student_id or len(normalized_student_id) > 20:
        raise FabricClientError("External request has no valid student ID")
    if not METADATA_HASH_PATTERN.fullmatch(normalized_source_hash):
        raise FabricClientError("External request has no valid source data hash")

    output = peer_invoke(
        "recordExternalStudentRejectionV1",
        normalized_student_id,
        normalized_source_hash,
    )
    return {
        "student_id": normalized_student_id,
        "source_data_hash": normalized_source_hash,
        "transaction_id": _extract_tx_id(output),
        "output": output,
    }


def create_student(student) -> dict[str, Any]:
    return sync_student(student)


def update_student(student) -> dict[str, Any]:
    return sync_student(student)


def query_student(student_id: str) -> dict[str, Any]:
    output = peer_query("queryStudent", _validate_student_id(student_id))
    return _parse_json(output)


def read_student(student_id: str) -> dict[str, Any]:
    return query_student(student_id)


def student_exists(student_id: str) -> bool:
    output = peer_query("studentExists", _validate_student_id(student_id))
    return output.strip().lower() == "true"


def verify_graduation(student_id: str, metadata_hash: str) -> dict[str, Any]:
    output = peer_query(
        "verifyGraduation",
        _validate_student_id(student_id),
        metadata_hash,
    )

    return _parse_json(output)

# FABRIC_EXPLORER_V1 ---------------------------------------------------------
# These read-only helpers obtain real block data through the peer/orderer CLI.
# Fabric blocks are protobuf files, so configtxlator decodes them to JSON before
# the FastAPI API returns a deliberately small public subset.

METADATA_HASH_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")
TRANSACTION_ID_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")

# FABRIC_EXPLORER_MEMORY_CACHE_V1
# Only public Explorer read models are cached. Student queries and writes are
# never cached here.
_EXPLORER_CACHE_LOCK = threading.RLock()
_EXPLORER_CACHE: dict[tuple[Any, ...], tuple[float, Any]] = {}


def _cache_seconds(name: str, default: str) -> float:
    try:
        return max(0.0, float(_env(name, default)))
    except ValueError as exc:
        raise FabricClientError(f"{name} must be a number") from exc


def _channel_cache_seconds() -> float:
    return _cache_seconds("FABRIC_EXPLORER_CHANNEL_CACHE_SECONDS", "3")


def _block_cache_seconds() -> float:
    return _cache_seconds("FABRIC_EXPLORER_BLOCK_CACHE_SECONDS", "300")


def _cache_limit() -> int:
    try:
        return max(32, int(_env("FABRIC_EXPLORER_CACHE_MAX_ENTRIES", "512")))
    except ValueError as exc:
        raise FabricClientError(
            "FABRIC_EXPLORER_CACHE_MAX_ENTRIES must be an integer"
        ) from exc


def _cache_get(key: tuple[Any, ...]) -> Any | None:
    now = time.monotonic()
    with _EXPLORER_CACHE_LOCK:
        entry = _EXPLORER_CACHE.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at <= now:
            _EXPLORER_CACHE.pop(key, None)
            return None
        return value


def _cache_set(key: tuple[Any, ...], value: Any, ttl_seconds: float) -> Any:
    if ttl_seconds <= 0:
        return value

    now = time.monotonic()
    with _EXPLORER_CACHE_LOCK:
        expired = [
            cache_key
            for cache_key, (expires_at, _) in _EXPLORER_CACHE.items()
            if expires_at <= now
        ]
        for cache_key in expired:
            _EXPLORER_CACHE.pop(cache_key, None)

        while len(_EXPLORER_CACHE) >= _cache_limit():
            oldest_key = min(
                _EXPLORER_CACHE,
                key=lambda cache_key: _EXPLORER_CACHE[cache_key][0],
            )
            _EXPLORER_CACHE.pop(oldest_key, None)

        _EXPLORER_CACHE[key] = (now + ttl_seconds, value)
    return value


def _cache_get_or_load(
    key: tuple[Any, ...],
    ttl_seconds: float,
    loader: Callable[[], Any],
) -> Any:
    # Keep the re-entrant lock while loading. This deliberately makes the
    # first caller the single loader; concurrent latest-block/latest-tx calls
    # wait and then reuse the exact same decoded block.
    with _EXPLORER_CACHE_LOCK:
        cached = _cache_get(key)
        if cached is not None:
            return cached
        return _cache_set(key, loader(), ttl_seconds)


def _invalidate_explorer_cache() -> None:
    with _EXPLORER_CACHE_LOCK:
        _EXPLORER_CACHE.clear()



def query_student_by_metadata_hash(metadata_hash: str) -> dict[str, Any]:
    value = str(metadata_hash or "").strip().lower()

    if not METADATA_HASH_PATTERN.fullmatch(value):
        raise FabricClientError("Invalid metadata hash format")

    output = peer_query("queryStudentByMetadataHash", value)
    return _parse_json(output)


def rebuild_metadata_hash_index() -> dict[str, str | None]:
    output = peer_invoke("rebuildMetadataHashIndex")
    return {
        "transaction_id": _extract_tx_id(output),
        "output": output,
    }


def _run_configtxlator(args: list[str]) -> str:
    result = subprocess.run(
        ["configtxlator", *args],
        cwd=str(_testnet_path()),
        env=build_peer_env(),
        text=True,
        capture_output=True,
        timeout=int(_env("FABRIC_QUERY_TIMEOUT", "30")),
    )

    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()

    if result.returncode != 0:
        raise FabricClientError("\n".join(item for item in [stdout, stderr] if item))

    return stdout


def _load_channel_info() -> dict[str, Any]:
    channel = _env("FABRIC_CHANNEL", "mychannel")
    output = run_peer_command(["channel", "getinfo", "-c", channel])
    match = re.search(r"(\{.*\})", output, re.DOTALL)

    if not match:
        raise FabricClientError(f"Unable to parse Fabric channel information: {output}")

    info = _parse_json(match.group(1))

    try:
        info["height"] = int(info["height"])
    except (KeyError, TypeError, ValueError) as exc:
        raise FabricClientError("Fabric channel information has no valid height") from exc

    return info


def get_channel_info() -> dict[str, Any]:
    channel = _env("FABRIC_CHANNEL", "mychannel")
    return _cache_get_or_load(
        ("channel_info", channel),
        _channel_cache_seconds(),
        _load_channel_info,
    )


def _fetch_block_from_orderer(block_number: int) -> dict[str, Any]:
    if block_number < 0:
        raise FabricClientError("Block number must not be negative")

    channel = _env("FABRIC_CHANNEL", "mychannel")

    with tempfile.TemporaryDirectory(prefix="graduation-explorer-") as directory:
        block_path = Path(directory) / f"block-{block_number}.pb"
        run_peer_command([
            "channel",
            "fetch",
            str(block_number),
            str(block_path),
            "-o",
            _env("FABRIC_ORDERER_ENDPOINT", "localhost:7050"),
            "--ordererTLSHostnameOverride",
            _env("FABRIC_ORDERER_HOSTNAME", "orderer.example.com"),
            "--tls",
            "--cafile",
            _orderer_ca_file(),
            "-c",
            channel,
        ])
        block_size_bytes = block_path.stat().st_size
        decoded = _run_configtxlator([
            "proto_decode",
            "--input",
            str(block_path),
            "--type",
            "common.Block",
        ])

    decoded_block = _parse_json(decoded)
    decoded_block["_encoded_size_bytes"] = block_size_bytes
    return decoded_block


# FABRIC_TRANSACTION_API_PEER_VALIDATION_V1
def _fetch_committed_block_from_peer(block_number: int) -> dict[str, Any]:
    """Read the peer-committed block, including transaction validation codes."""
    if block_number < 0:
        raise FabricClientError("Block number must not be negative")

    channel = _env("FABRIC_CHANNEL", "mychannel")
    timeout = int(_env("FABRIC_QUERY_TIMEOUT", "10"))
    invocation = json.dumps(
        {"Args": ["GetBlockByNumber", channel, str(block_number)]},
        separators=(",", ":"),
    )
    result = subprocess.run(
        [
            "peer",
            "chaincode",
            "query",
            "-C",
            channel,
            "-n",
            "qscc",
            "-c",
            invocation,
            "--raw",
        ],
        cwd=str(_testnet_path()),
        env=build_peer_env(),
        capture_output=True,
        timeout=timeout,
    )

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        raise FabricClientError(
            stderr or "Unable to read committed block from peer"
        )
    if not result.stdout:
        raise FabricClientError("Peer returned an empty committed block")

    # FABRIC_PEER_BLOCK_BYTE_ARRAY_V1
    # Some peer CLI builds render a binary QSCC result as "[10 70 8 ...]".
    # Convert that decimal byte array back to the original protobuf block.
    block_bytes = result.stdout
    rendered_bytes = block_bytes.strip()
    if rendered_bytes.startswith(b"[") and rendered_bytes.endswith(b"]"):
        try:
            values = rendered_bytes[1:-1].split()
            block_bytes = bytes(int(value) for value in values)
        except (TypeError, ValueError) as exc:
            raise FabricClientError(
                "Peer returned an invalid decimal byte array"
            ) from exc

    with tempfile.TemporaryDirectory(prefix="graduation-peer-block-") as directory:
        block_path = Path(directory) / f"block-{block_number}.pb"
        block_path.write_bytes(block_bytes)
        decoded = _run_configtxlator([
            "proto_decode",
            "--input",
            str(block_path),
            "--type",
            "common.Block",
        ])

    decoded_block = _parse_json(decoded)
    decoded_block["_encoded_size_bytes"] = len(block_bytes)
    return decoded_block


def _fetch_block(block_number: int) -> dict[str, Any]:
    try:
        return _fetch_committed_block_from_peer(block_number)
    except (FabricClientError, subprocess.SubprocessError, OSError):
        # Explorer remains available if the peer query is temporarily unavailable.
        return _fetch_block_from_orderer(block_number)


def _decode_base64_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    try:
        raw = base64.b64decode(value, validate=True)
        return raw.decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        return value


# FABRIC_TRANSACTION_IDENTITY_DETAILS_V1
def _read_protobuf_varint(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    shift = 0

    while offset < len(data) and shift < 64:
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, offset
        shift += 7

    raise ValueError("Invalid protobuf varint")


def _serialized_identity_msp(value: Any) -> str | None:
    if isinstance(value, dict):
        msp_id = value.get("mspid") or value.get("msp_id")
        return str(msp_id) if msp_id else None
    if not isinstance(value, str) or not value:
        return None

    try:
        data = base64.b64decode(value, validate=True)
        offset = 0

        while offset < len(data):
            tag, offset = _read_protobuf_varint(data, offset)
            field_number = tag >> 3
            wire_type = tag & 0x07

            if wire_type == 2:
                length, offset = _read_protobuf_varint(data, offset)
                end = offset + length
                if end > len(data):
                    return None
                if field_number == 1:
                    return data[offset:end].decode("utf-8")
                offset = end
            elif wire_type == 0:
                _, offset = _read_protobuf_varint(data, offset)
            elif wire_type == 1:
                offset += 8
            elif wire_type == 5:
                offset += 4
            else:
                return None
    except (ValueError, UnicodeDecodeError):
        return None

    return None


def _transaction_validation_codes(block: dict[str, Any]) -> list[int]:
    metadata = block.get("metadata", {}).get("metadata", [])

    if not isinstance(metadata, list) or len(metadata) <= 2:
        return []

    metadata_entry = metadata[2]
    encoded = (
        metadata_entry.get("value")
        if isinstance(metadata_entry, dict)
        else metadata_entry
    )

    if not isinstance(encoded, str):
        return []

    try:
        return list(base64.b64decode(encoded, validate=True))
    except ValueError:
        return []



# FABRIC_BLOCK_OVERVIEW_V1
_TRANSACTION_TYPE_NAMES = {
    0: "MESSAGE",
    1: "CONFIG",
    2: "CONFIG_UPDATE",
    3: "ENDORSER_TRANSACTION",
    4: "ORDERER_TRANSACTION",
    5: "DELIVER_SEEK_INFO",
    6: "CHAINCODE_PACKAGE",
    8: "PEER_ADMIN_OPERATION",
    9: "TOKEN_TRANSACTION",
}


def _transaction_type_name(value: Any) -> str:
    if isinstance(value, str) and not value.strip().isdigit():
        return value.strip().upper() or "UNKNOWN"

    try:
        numeric_value = int(value)
    except (TypeError, ValueError):
        return "UNKNOWN"

    return _TRANSACTION_TYPE_NAMES.get(
        numeric_value,
        f"TYPE_{numeric_value}",
    )


def _protobuf_length_delimited_fields(data: bytes) -> dict[int, list[bytes]]:
    fields: dict[int, list[bytes]] = {}
    offset = 0

    try:
        while offset < len(data):
            tag, offset = _read_protobuf_varint(data, offset)
            field_number = tag >> 3
            wire_type = tag & 0x07

            if wire_type == 2:
                length, offset = _read_protobuf_varint(data, offset)
                end = offset + length
                if end > len(data):
                    return {}
                fields.setdefault(field_number, []).append(data[offset:end])
                offset = end
            elif wire_type == 0:
                _, offset = _read_protobuf_varint(data, offset)
            elif wire_type == 1:
                offset += 8
            elif wire_type == 5:
                offset += 4
            else:
                return {}
    except (TypeError, ValueError):
        return {}

    return fields


def _block_signature_summary(block: dict[str, Any]) -> tuple[str | None, int]:
    metadata = block.get("metadata", {}).get("metadata", [])
    if not isinstance(metadata, list) or not metadata:
        return None, 0

    signature_metadata = metadata[0]
    if isinstance(signature_metadata, dict):
        signatures = signature_metadata.get("signatures", [])
        if not isinstance(signatures, list):
            return None, 0

        for signature in signatures:
            if not isinstance(signature, dict):
                continue
            signature_header = signature.get("signature_header", {})
            if isinstance(signature_header, dict):
                creator_msp = _serialized_identity_msp(
                    signature_header.get("creator")
                )
                if creator_msp:
                    return creator_msp, len(signatures)
        return None, len(signatures)

    if not isinstance(signature_metadata, str):
        return None, 0

    try:
        raw_metadata = base64.b64decode(signature_metadata, validate=True)
    except ValueError:
        return None, 0

    metadata_fields = _protobuf_length_delimited_fields(raw_metadata)
    signature_messages = metadata_fields.get(2, [])

    for signature_message in signature_messages:
        signature_fields = _protobuf_length_delimited_fields(signature_message)
        for signature_header in signature_fields.get(1, []):
            header_fields = _protobuf_length_delimited_fields(signature_header)
            creators = header_fields.get(1, [])
            if not creators:
                continue
            encoded_creator = base64.b64encode(creators[0]).decode("ascii")
            creator_msp = _serialized_identity_msp(encoded_creator)
            if creator_msp:
                return creator_msp, len(signature_messages)

    return None, len(signature_messages)


def _classify_block(
    block_number: int,
    transactions: list[dict[str, Any]],
) -> str:
    if block_number == 0:
        return "GENESIS"

    chaincodes = {
        str(item.get("chaincode_name") or "")
        for item in transactions
        if item.get("chaincode_name")
    }
    transaction_types = {
        str(item.get("transaction_type") or "")
        for item in transactions
    }

    categories = set()
    graduation_chaincode = _env("FABRIC_CHAINCODE", "graduation")
    if graduation_chaincode in chaincodes:
        categories.add("GRADUATION")
    if "_lifecycle" in chaincodes:
        categories.add("LIFECYCLE")
    if {"CONFIG", "CONFIG_UPDATE", "ORDERER_TRANSACTION"} & transaction_types:
        categories.add("CONFIGURATION")
    if chaincodes - {graduation_chaincode, "_lifecycle"}:
        categories.add("APPLICATION")

    if len(categories) > 1:
        return "MIXED"
    if categories:
        return next(iter(categories))
    return "SYSTEM"


def _parse_block_transaction(
    envelope: dict[str, Any],
    block_number: int,
    transaction_index: int,
    validation_codes: list[int],
) -> dict[str, Any] | None:
    payload = envelope.get("payload", {}) if isinstance(envelope, dict) else {}
    header = payload.get("header", {}) if isinstance(payload, dict) else {}
    channel_header = header.get("channel_header", {}) if isinstance(header, dict) else {}
    data = payload.get("data", {}) if isinstance(payload, dict) else {}
    actions = data.get("actions", []) if isinstance(data, dict) else []

    action_payload = (
        actions[0].get("payload", {})
        if isinstance(actions, list)
        and actions
        and isinstance(actions[0], dict)
        else {}
    )
    signature_header = header.get("signature_header", {}) if isinstance(header, dict) else {}
    creator_value = (
        signature_header.get("creator")
        if isinstance(signature_header, dict)
        else None
    )
    creator_msp = _serialized_identity_msp(creator_value)
    chaincode_action = (
        action_payload.get("action", {})
        if isinstance(action_payload, dict)
        else {}
    )
    endorsements = (
        chaincode_action.get("endorsements", [])
        if isinstance(chaincode_action, dict)
        else []
    )
    endorser_msps = []
    for endorsement in endorsements if isinstance(endorsements, list) else []:
        if not isinstance(endorsement, dict):
            continue
        msp_id = _serialized_identity_msp(endorsement.get("endorser"))
        if msp_id and msp_id not in endorser_msps:
            endorser_msps.append(msp_id)

    response_payload = (
        chaincode_action.get("proposal_response_payload", {})
        if isinstance(chaincode_action, dict)
        else {}
    )
    response_extension = (
        response_payload.get("extension", {})
        if isinstance(response_payload, dict)
        else {}
    )
    chaincode_response = (
        response_extension.get("response", {})
        if isinstance(response_extension, dict)
        else {}
    )
    chaincode_response_status = (
        chaincode_response.get("status")
        if isinstance(chaincode_response, dict)
        else None
    )
    proposal_payload = (
        action_payload.get("chaincode_proposal_payload", {})
        if isinstance(action_payload, dict)
        else {}
    )
    proposal_input = proposal_payload.get("input", {}) if isinstance(proposal_payload, dict) else {}
    chaincode_spec = proposal_input.get("chaincode_spec", {}) if isinstance(proposal_input, dict) else {}
    chaincode_id = chaincode_spec.get("chaincode_id", {}) if isinstance(chaincode_spec, dict) else {}
    invocation_input = chaincode_spec.get("input", {}) if isinstance(chaincode_spec, dict) else {}
    raw_args = invocation_input.get("args", []) if isinstance(invocation_input, dict) else []
    args = [_decode_base64_text(value) for value in raw_args if isinstance(value, str)]
    validation_code = (
        validation_codes[transaction_index]
        if transaction_index < len(validation_codes)
        else None
    )

    return {
        "transaction_id": str(channel_header.get("tx_id") or ""),
        "block_number": block_number,
        "transaction_index": transaction_index,
        "channel": str(channel_header.get("channel_id") or _env("FABRIC_CHANNEL", "mychannel")),
        "transaction_type": _transaction_type_name(channel_header.get("type")),
        "timestamp": channel_header.get("timestamp"),
        "validation_code": validation_code,
        "creator_msp": creator_msp,
        "endorser_msps": endorser_msps,
        "endorsement_count": len(endorsements) if isinstance(endorsements, list) else 0,
        "chaincode_response_status": chaincode_response_status,
        "status": (
            "VALID" if validation_code == 0
            else "COMMITTED" if validation_code is None
            else "INVALID"
        ),
        "chaincode_name": str(chaincode_id.get("name") or ""),
        "function_name": args[0] if args else None,
        "student_id": args[1] if len(args) > 1 and args[0] in {
            "syncStudent",
            "syncStudentV2",
            "createStudent",
            "updateStudent",
            "queryStudent",
            "verifyGraduation",
            "recordStudentRejection",
            "recordStudentRejectionV2",
            "recordExternalStudentRejectionV1",
        } else None,
        "source_data_hash": (
            args[2]
            if len(args) > 2
            and args[0] == "recordExternalStudentRejectionV1"
            else None
        ),
    }


# FABRIC_BLOCK_HASH_V1
def _der_length(length: int) -> bytes:
    """Encode a DER length exactly as Go encoding/asn1 does."""
    if length < 0:
        raise FabricClientError("DER length must not be negative")
    if length < 128:
        return bytes([length])
    encoded = length.to_bytes((length.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(encoded)]) + encoded


def _der_value(tag: int, value: bytes) -> bytes:
    return bytes([tag]) + _der_length(len(value)) + value


def _der_positive_integer(value: int) -> bytes:
    if value < 0:
        raise FabricClientError("Fabric block number must not be negative")
    encoded = (
        b"\x00"
        if value == 0
        else value.to_bytes((value.bit_length() + 7) // 8, "big")
    )
    if encoded[0] & 0x80:
        encoded = b"\x00" + encoded
    return _der_value(0x02, encoded)


def _decode_fabric_header_hash(value: Any, field_name: str) -> bytes:
    if value in (None, ""):
        return b""
    if not isinstance(value, str):
        raise FabricClientError(f"Fabric block has no valid {field_name}")
    try:
        decoded = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as exc:
        raise FabricClientError(
            f"Fabric block has invalid Base64 {field_name}"
        ) from exc
    if len(decoded) not in {0, 32}:
        raise FabricClientError(
            f"Fabric block has invalid {field_name} length"
        )
    return decoded


def _fabric_block_hashes(
    block_number: int,
    previous_hash_value: Any,
    data_hash_value: Any,
) -> tuple[str, str | None]:
    """Return Fabric BlockHeaderHash and PreviousHash as lowercase hex.

    Hyperledger Fabric protoutil.BlockHeaderBytes ASN.1-DER encodes the
    positive block number, PreviousHash and DataHash, then BlockHeaderHash
    applies SHA-256 to those exact DER bytes.
    """
    previous_hash = _decode_fabric_header_hash(
        previous_hash_value,
        "PreviousHash",
    )
    data_hash = _decode_fabric_header_hash(data_hash_value, "DataHash")
    header_body = b"".join((
        _der_positive_integer(block_number),
        _der_value(0x04, previous_hash),
        _der_value(0x04, data_hash),
    ))
    header_der = _der_value(0x30, header_body)
    block_hash = hashlib.sha256(header_der).hexdigest()
    return block_hash, previous_hash.hex() if previous_hash else None


def _decode_block(block: dict[str, Any]) -> dict[str, Any]:
    header = block.get("header", {}) if isinstance(block, dict) else {}
    data = block.get("data", {}) if isinstance(block, dict) else {}
    envelopes = data.get("data", []) if isinstance(data, dict) else []

    try:
        block_number = int(header.get("number", 0))
    except (TypeError, ValueError) as exc:
        raise FabricClientError("Fabric block has no valid number") from exc

    validation_codes = _transaction_validation_codes(block)
    transactions = []

    for index, envelope in enumerate(envelopes if isinstance(envelopes, list) else []):
        transaction = _parse_block_transaction(
            envelope,
            block_number,
            index,
            validation_codes,
        )
        if transaction:
            transactions.append(transaction)

    first_timestamp = next(
        (item["timestamp"] for item in transactions if item.get("timestamp")),
        None,
    )
    graduation_chaincode = _env("FABRIC_CHAINCODE", "graduation")
    channel = next(
        (item["channel"] for item in transactions if item.get("channel")),
        _env("FABRIC_CHANNEL", "mychannel"),
    )
    transaction_count = (
        len(envelopes) if isinstance(envelopes, list) else 0
    )
    validation_summary_available = (
        len(validation_codes) >= transaction_count
    )
    relevant_validation_codes = validation_codes[:transaction_count]
    valid_transaction_count = (
        sum(code == 0 for code in relevant_validation_codes)
        if validation_summary_available
        else None
    )
    invalid_transaction_count = (
        sum(code != 0 for code in relevant_validation_codes)
        if validation_summary_available
        else None
    )
    creator_msp, block_signature_count = _block_signature_summary(block)
    block_hash, previous_block_hash = _fabric_block_hashes(
        block_number,
        header.get("previous_hash"),
        header.get("data_hash"),
    )

    return {
        "number": block_number,
        "channel": channel,
        "block_type": _classify_block(block_number, transactions),
        "size_bytes": block.get("_encoded_size_bytes"),
        "creator_msp": creator_msp,
        "block_signature_count": block_signature_count,
        "block_hash": block_hash,
        "previous_block_hash": previous_block_hash,
        # Giữ dữ liệu gốc trong API để tương thích; giao diện công khai không
        # còn dùng DataHash làm định danh block.
        "data_hash": header.get("data_hash"),
        "previous_hash": header.get("previous_hash"),
        "transaction_count": transaction_count,
        "valid_transaction_count": valid_transaction_count,
        "invalid_transaction_count": invalid_transaction_count,
        "validation_summary_available": validation_summary_available,
        "graduation_transaction_count": sum(
            1 for item in transactions
            if item.get("chaincode_name") == graduation_chaincode
        ),
        # Fabric headers do not contain a canonical timestamp. This is the
        # timestamp of the first transaction contained in the block.
        "first_transaction_at": first_timestamp,
        "transactions": transactions,
    }


def _get_decoded_block(block_number: int) -> dict[str, Any]:
    channel = _env("FABRIC_CHANNEL", "mychannel")
    normalized_number = int(block_number)

    def load_block() -> dict[str, Any]:
        return _decode_block(
            _fetch_block(normalized_number)
        )

    decoded = _cache_get_or_load(
        ("decoded_block", channel, normalized_number),
        _block_cache_seconds(),
        load_block,
    )

    # Rows already shown by a list page can open instantly by transaction ID.
    for transaction in decoded.get("transactions", []):
        transaction_id = str(transaction.get("transaction_id") or "").lower()
        if transaction_id:
            _cache_set(
                ("transaction", channel, transaction_id),
                transaction,
                _block_cache_seconds(),
            )

    return decoded


def get_block_by_number(block_number: int) -> dict[str, Any]:
    info = get_channel_info()
    normalized_number = int(block_number)

    if normalized_number < 0 or normalized_number >= info["height"]:
        raise FabricClientError("Block number does not exist on this channel")

    decoded = _get_decoded_block(normalized_number)
    return {
        **decoded,
        "height": info["height"],
        "previous_block_number": (
            normalized_number - 1 if normalized_number > 0 else None
        ),
        "next_block_number": (
            normalized_number + 1
            if normalized_number + 1 < info["height"]
            else None
        ),
    }


def get_recent_blocks(limit: int = 6) -> dict[str, Any]:
    limit = max(1, min(int(limit), 12))
    info = get_channel_info()
    newest_block = info["height"] - 1
    block_numbers = range(newest_block, max(-1, newest_block - limit), -1)

    return {
        "height": info["height"],
        "items": [_get_decoded_block(number) for number in block_numbers],
    }


def get_recent_transactions(limit: int = 8) -> dict[str, Any]:
    limit = max(1, min(int(limit), 20))
    info = get_channel_info()
    chaincode = _env("FABRIC_CHAINCODE", "graduation")
    max_scan = max(1, int(_env("FABRIC_EXPLORER_MAX_BLOCK_SCAN", "200")))
    transactions: list[dict[str, Any]] = []

    for offset, block_number in enumerate(range(info["height"] - 1, -1, -1)):
        if offset >= max_scan or len(transactions) >= limit:
            break

        decoded_block = _get_decoded_block(block_number)
        block_transactions = [
            item for item in decoded_block["transactions"]
            if item.get("chaincode_name") in {chaincode, "_lifecycle"}
        ]
        transactions.extend(reversed(block_transactions))

    return {
        "height": info["height"],
        "items": transactions[:limit],
    }


def find_transaction_by_id(transaction_id: str) -> dict[str, Any] | None:
    value = str(transaction_id or "").strip().lower()

    if not TRANSACTION_ID_PATTERN.fullmatch(value):
        raise FabricClientError("Invalid transaction ID format")

    channel = _env("FABRIC_CHANNEL", "mychannel")
    cached_transaction = _cache_get(("transaction", channel, value))
    if cached_transaction is not None:
        return cached_transaction

    info = get_channel_info()
    max_scan = max(1, int(_env("FABRIC_EXPLORER_MAX_BLOCK_SCAN", "200")))

    for offset, block_number in enumerate(range(info["height"] - 1, -1, -1)):
        if offset >= max_scan:
            break

        decoded_block = _get_decoded_block(block_number)
        for transaction in decoded_block["transactions"]:
            if transaction.get("transaction_id", "").lower() == value:
                return transaction

    return None


# FABRIC_BLOCK_HASH_SEARCH_V1
def find_block_by_hash(block_hash: str) -> dict[str, Any] | None:
    value = str(block_hash or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", value):
        raise FabricClientError("Invalid Fabric block hash format")

    info = get_channel_info()
    max_scan = max(1, int(_env("FABRIC_EXPLORER_MAX_BLOCK_SCAN", "200")))
    for offset, block_number in enumerate(range(info["height"] - 1, -1, -1)):
        if offset >= max_scan:
            break
        block = _get_decoded_block(block_number)
        if str(block.get("block_hash") or "").lower() == value:
            return {
                **block,
                "height": info["height"],
                "previous_block_number": (
                    block_number - 1 if block_number > 0 else None
                ),
                "next_block_number": (
                    block_number + 1
                    if block_number + 1 < info["height"]
                    else None
                ),
            }
    return None


# FABRIC_EXPLORER_LIFECYCLE_LISTS_V1
# EXPLORER_TRANSACTION_NAVIGATION_V1
def get_transaction_with_navigation(
    transaction_id: str,
) -> dict[str, Any] | None:
    """Return one public Explorer transaction and its ledger neighbours."""
    value = str(transaction_id or "").strip().lower()

    if not TRANSACTION_ID_PATTERN.fullmatch(value):
        raise FabricClientError("Invalid transaction ID format")

    transaction = find_transaction_by_id(value)
    if transaction is None:
        return None

    result = dict(transaction)
    result["previous_transaction_id"] = None
    result["next_transaction_id"] = None

    chaincode = _env("FABRIC_CHAINCODE", "graduation")
    info = get_channel_info()
    max_scan = max(1, int(_env("FABRIC_EXPLORER_MAX_BLOCK_SCAN", "200")))
    oldest_scanned_block = max(0, info["height"] - max_scan)
    block_number = int(transaction["block_number"])

    def explorer_transactions(number: int) -> list[dict[str, Any]]:
        decoded_block = _get_decoded_block(number)
        return [
            item for item in decoded_block["transactions"]
            if item.get("chaincode_name") in {chaincode, "_lifecycle"}
        ]

    current_block_transactions = explorer_transactions(block_number)
    current_index = next(
        (
            index
            for index, item in enumerate(current_block_transactions)
            if str(item.get("transaction_id") or "").lower() == value
        ),
        None,
    )
    if current_index is None:
        return result

    # Previous means older/lower in ledger order, matching "previous block".
    if current_index > 0:
        result["previous_transaction_id"] = current_block_transactions[
            current_index - 1
        ].get("transaction_id")
    else:
        for number in range(block_number - 1, oldest_scanned_block - 1, -1):
            candidates = explorer_transactions(number)
            if candidates:
                result["previous_transaction_id"] = candidates[-1].get(
                    "transaction_id"
                )
                break

    # Next means newer/higher in ledger order.
    if current_index + 1 < len(current_block_transactions):
        result["next_transaction_id"] = current_block_transactions[
            current_index + 1
        ].get("transaction_id")
    else:
        for number in range(block_number + 1, info["height"]):
            candidates = explorer_transactions(number)
            if candidates:
                result["next_transaction_id"] = candidates[0].get(
                    "transaction_id"
                )
                break

    return result


# FABRIC_EXPLORER_BLOCKS_PAGE_V1
def get_blocks_page(page: int = 1, page_size: int = 10) -> dict[str, Any]:
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 25))
    info = get_channel_info()
    total_blocks = info["height"]
    total_pages = max(1, (total_blocks + page_size - 1) // page_size)

    if page > total_pages:
        return {
            "height": total_blocks,
            "page": page,
            "page_size": page_size,
            "total_blocks": total_blocks,
            "total_pages": total_pages,
            "items": [],
        }

    newest_in_page = total_blocks - 1 - (page - 1) * page_size
    oldest_exclusive = max(-1, newest_in_page - page_size)
    return {
        "height": total_blocks,
        "page": page,
        "page_size": page_size,
        "total_blocks": total_blocks,
        "total_pages": total_pages,
        "items": [
            _get_decoded_block(number)
            for number in range(newest_in_page, oldest_exclusive, -1)
        ],
    }


# FABRIC_EXPLORER_TRANSACTIONS_PAGE_V1
def get_transactions_page(page: int = 1, page_size: int = 10) -> dict[str, Any]:
    page = max(1, int(page))
    page_size = max(1, min(int(page_size), 25))
    info = get_channel_info()
    chaincode = _env("FABRIC_CHAINCODE", "graduation")
    max_scan = max(1, int(_env("FABRIC_EXPLORER_MAX_BLOCK_SCAN", "200")))
    transactions: list[dict[str, Any]] = []

    for offset, block_number in enumerate(range(info["height"] - 1, -1, -1)):
        if offset >= max_scan:
            break
        decoded_block = _get_decoded_block(block_number)
        block_transactions = [
            item for item in decoded_block["transactions"]
            if item.get("chaincode_name") in {chaincode, "_lifecycle"}
        ]
        transactions.extend(reversed(block_transactions))

    total_transactions = len(transactions)
    total_pages = max(1, (total_transactions + page_size - 1) // page_size)
    start = (page - 1) * page_size
    items = transactions[start:start + page_size] if page <= total_pages else []
    return {
        "height": info["height"],
        "page": page,
        "page_size": page_size,
        "total_transactions": total_transactions,
        "total_pages": total_pages,
        "items": items,
    }
