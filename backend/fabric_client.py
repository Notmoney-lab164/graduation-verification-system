import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

STUDENT_ID_PATTERN = re.compile(r"^[A-Z0-9_-]{2,30}$")


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


def _validate_student_id(student_id: str) -> str:
    value = str(student_id).strip()

    if not STUDENT_ID_PATTERN.fullmatch(value):
        raise FabricClientError("Invalid student_id format")

    return value


def _normalize_gpa(gpa: Any) -> str:
    if gpa is None:
        return ""

    return str(gpa).strip()


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

    return run_peer_command([
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


def sync_student(student) -> dict[str, Any]:
    student_id = _validate_student_id(student.student_id)
    gpa = _normalize_gpa(student.gpa)
    graduation_status = str(student.graduation_status).strip()

    output = peer_invoke(
        "syncStudent",
        student_id,
        gpa,
        graduation_status,
    )

    tx_id = _extract_tx_id(output)
    record = query_student(student_id)

    if tx_id:
        record["transactionId"] = tx_id

    return record


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