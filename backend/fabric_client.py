import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

STUDENT_ID_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{6}$")


class FabricError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 500) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class StudentNotFoundError(FabricError):
    def __init__(self, student_id: str) -> None:
        super().__init__(
            code="STUDENT_NOT_FOUND",
            message=f"Student {student_id} does not exist",
            status_code=404,
        )


class InvalidStudentIdError(FabricError):
    def __init__(self) -> None:
        super().__init__(
            code="INVALID_STUDENT_ID",
            message="studentId must use format: 2 uppercase letters followed by 6 digits, for example SE182026",
            status_code=400,
        )


class FabricUnavailableError(FabricError):
    def __init__(self) -> None:
        super().__init__(
            code="FABRIC_UNAVAILABLE",
            message="Fabric network is unavailable",
            status_code=503,
        )


class FabricTimeoutError(FabricError):
    def __init__(self) -> None:
        super().__init__(
            code="FABRIC_TIMEOUT",
            message="Fabric query timed out",
            status_code=504,
        )


def validate_student_id(student_id: str) -> None:
    if not STUDENT_ID_PATTERN.fullmatch(student_id):
        raise InvalidStudentIdError()


def build_peer_env() -> dict[str, str]:
    testnet = Path(os.environ["FABRIC_TESTNET"]).expanduser()
    fabric_samples = testnet.parent

    env = os.environ.copy()
    env["PATH"] = f"{fabric_samples / 'bin'}:{env.get('PATH', '')}"
    env["FABRIC_CFG_PATH"] = str(fabric_samples / "config")
    env["CORE_PEER_TLS_ENABLED"] = "true"
    env["CORE_PEER_LOCALMSPID"] = os.environ.get("FABRIC_MSP_ID", "Org1MSP")
    env["CORE_PEER_ADDRESS"] = os.environ.get("FABRIC_PEER_ENDPOINT", "localhost:7051")

    org_path = testnet / "organizations/peerOrganizations/org1.example.com"
    env["CORE_PEER_TLS_ROOTCERT_FILE"] = str(
        org_path / "peers/peer0.org1.example.com/tls/ca.crt"
    )
    env["CORE_PEER_MSPCONFIGPATH"] = str(
        org_path / "users/Admin@org1.example.com/msp"
    )

    return env


def query_student(student_id: str) -> dict[str, Any]:
    validate_student_id(student_id)

    channel = os.environ.get("FABRIC_CHANNEL", "mychannel")
    chaincode = os.environ.get("FABRIC_CHAINCODE", "graduation")
    timeout = int(os.environ.get("FABRIC_QUERY_TIMEOUT", "10"))

    payload = json.dumps({"Args": ["queryStudent", student_id]})

    cmd = [
        "peer",
        "chaincode",
        "query",
        "-C",
        channel,
        "-n",
        chaincode,
        "-c",
        payload,
    ]

    try:
        result = subprocess.run(
            cmd,
            env=build_peer_env(),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise FabricTimeoutError() from exc
    except OSError as exc:
        raise FabricUnavailableError() from exc

    output = (result.stdout or "").strip()
    error_output = (result.stderr or "").strip()
    combined_output = f"{output}\n{error_output}"

    if result.returncode != 0:
        if "STUDENT_NOT_FOUND" in combined_output or "does not exist" in combined_output:
            raise StudentNotFoundError(student_id)

        if "connect: connection refused" in combined_output:
            raise FabricUnavailableError()

        raise FabricError(
            code="FABRIC_QUERY_FAILED",
            message="Failed to query student from Fabric",
            status_code=502,
        )

    try:
        return json.loads(output)
    except json.JSONDecodeError as exc:
        raise FabricError(
            code="INVALID_FABRIC_RESPONSE",
            message="Fabric returned invalid JSON",
            status_code=502,
        ) from exc

def peer_query(function_name: str, *args: str) -> str:
    channel = os.environ.get("FABRIC_CHANNEL", "mychannel")
    chaincode = os.environ.get("FABRIC_CHAINCODE", "graduation")
    timeout = int(os.environ.get("FABRIC_QUERY_TIMEOUT", "10"))

    payload = json.dumps({"Args": [function_name, *args]})

    cmd = [
        "peer",
        "chaincode",
        "query",
        "-C",
        channel,
        "-n",
        chaincode,
        "-c",
        payload,
    ]

    try:
        result = subprocess.run(
            cmd,
            env=build_peer_env(),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise FabricTimeoutError() from exc
    except OSError as exc:
        raise FabricUnavailableError() from exc

    output = (result.stdout or "").strip()
    error_output = (result.stderr or "").strip()
    combined_output = f"{output}\n{error_output}"

    if result.returncode != 0:
        if "STUDENT_NOT_FOUND" in combined_output or "does not exist" in combined_output:
            student_id = args[0] if args else "UNKNOWN"
            raise StudentNotFoundError(student_id)

        if "connect: connection refused" in combined_output:
            raise FabricUnavailableError()

        raise FabricError(
            code="FABRIC_QUERY_FAILED",
            message="Failed to query Fabric network",
            status_code=502,
        )

    return output


def verify_graduation(student_id: str) -> dict[str, Any]:
    validate_student_id(student_id)

    graduation_status = peer_query("verifyGraduation", student_id)
    integrity_output = peer_query("verifyStudentIntegrity", student_id)

    integrity_valid = integrity_output.lower() == "true"

    return {
        "studentId": student_id,
        "graduationStatus": graduation_status,
        "isGraduated": graduation_status == "GRADUATED",
        "integrityValid": integrity_valid,
    }