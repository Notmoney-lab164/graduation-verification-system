"""
test_fabric.py — test chaincode graduation
Usage:
  python scripts/test_fabric.py           # mặc định SV005
  python scripts/test_fabric.py SV001
  python scripts/test_fabric.py exists SV999
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

TESTNET = Path(os.environ["FABRIC_TESTNET"]).expanduser()
CHANNEL = os.environ.get("FABRIC_CHANNEL", "mychannel")
CHAINCODE = os.environ.get("FABRIC_CHAINCODE", "graduation")


def build_peer_env() -> dict:
    env = os.environ.copy()
    fabric_samples = TESTNET.parent
    env["PATH"] = f"{fabric_samples}/bin:{env.get('PATH', '')}"
    env["FABRIC_CFG_PATH"] = str(fabric_samples / "config")
    env["CORE_PEER_TLS_ENABLED"] = "true"
    env["CORE_PEER_LOCALMSPID"] = os.environ.get("FABRIC_MSP_ID", "Org1MSP")
    env["CORE_PEER_ADDRESS"] = os.environ.get("FABRIC_PEER_ENDPOINT", "localhost:7051")
    org = TESTNET / "organizations/peerOrganizations/org1.example.com"
    env["CORE_PEER_TLS_ROOTCERT_FILE"] = str(org / "peers/peer0.org1.example.com/tls/ca.crt")
    env["CORE_PEER_MSPCONFIGPATH"] = str(org / "users/Admin@org1.example.com/msp")
    return env


def peer_query(function: str, *args: str) -> str:
    payload = json.dumps({"Args": [function, *args]})
    cmd = ["peer", "chaincode", "query", "-C", CHANNEL, "-n", CHAINCODE, "-c", payload]
    proc = subprocess.run(cmd, env=build_peer_env(), capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout).strip())
    return proc.stdout.strip()


def main() -> None:
    if len(sys.argv) >= 3 and sys.argv[1].lower() == "exists":
        student_id = sys.argv[2]
        print("=== studentExists ===")
        print(peer_query("studentExists", student_id))
        return

    student_id = sys.argv[1] if len(sys.argv) > 1 else "SV005"

    print("=== queryStudent ===")
    print(peer_query("queryStudent", student_id))

    print("\n=== verifyGraduation ===")
    print(peer_query("verifyGraduation", student_id))


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        msg = str(e).strip()
        if "STUDENT_NOT_FOUND" in msg or "does not exist" in msg:
            print(f"\nNOT_FOUND: {msg}")
            raise SystemExit(2)
        print(f"\nERROR: {msg}")
        raise SystemExit(1)