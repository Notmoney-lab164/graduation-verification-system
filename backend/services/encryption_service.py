import os

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv


load_dotenv()


class EncryptionError(RuntimeError):
    pass


def _get_fernet() -> Fernet:
    encryption_key = os.getenv("ENCRYPTION_KEY")

    if not encryption_key:
        raise EncryptionError("ENCRYPTION_KEY is not configured")

    try:
        return Fernet(encryption_key.strip().encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise EncryptionError("ENCRYPTION_KEY is invalid") from exc


def encrypt_value(value: str | None) -> str | None:
    if value is None:
        return None

    normalized_value = str(value).strip()

    if not normalized_value:
        return None

    return _get_fernet().encrypt(
        normalized_value.encode("utf-8")
    ).decode("utf-8")


def decrypt_value(encrypted_value: str | None) -> str | None:
    if encrypted_value is None:
        return None

    normalized_value = str(encrypted_value).strip()

    if not normalized_value:
        return None

    try:
        return _get_fernet().decrypt(
            normalized_value.encode("utf-8")
        ).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionError(
            "Cannot decrypt sensitive student data"
        ) from exc


def encrypt_text(value: str | None) -> str | None:
    return encrypt_value(value)


def decrypt_text(value: str | None) -> str | None:
    return decrypt_value(value)
