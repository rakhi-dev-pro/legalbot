import os
import hashlib
import base64
from pathlib import Path
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from config import settings

# Base upload directory
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True, parents=True)

def _get_fernet_key(salt: bytes = b"legalbot_fixed_salt_2026") -> bytes:
    """Derive a deterministic 32-byte Fernet key from settings.SECRET_KEY."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    return base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode()))


def compute_sha256(file_bytes: bytes) -> str:
    """Compute SHA-256 hash of file content for auditability and deduplication."""
    return hashlib.sha256(file_bytes).hexdigest()


def save_encrypted_file(file_bytes: bytes, filename: str) -> str:
    """Encrypt raw file bytes with AES-256 Fernet encryption and save to disk."""
    key = _get_fernet_key()
    fernet = Fernet(key)
    encrypted_data = fernet.encrypt(file_bytes)

    # Save to unique file path in uploads/
    safe_hash = hashlib.sha256(file_bytes).hexdigest()[:16]
    sanitized_name = "".join(c for c in filename if c.isalnum() or c in (".", "_", "-"))
    target_filename = f"{safe_hash}_{sanitized_name}.enc"
    target_path = UPLOAD_DIR / target_filename

    with open(target_path, "wb") as f:
        f.write(encrypted_data)

    return str(target_path)


def read_decrypted_file(file_path: str) -> bytes:
    """Read encrypted file from disk and decrypt back to raw bytes."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Encrypted document file not found at: {file_path}")

    key = _get_fernet_key()
    fernet = Fernet(key)

    with open(file_path, "rb") as f:
        encrypted_data = f.read()

    return fernet.decrypt(encrypted_data)


def delete_encrypted_file(file_path: str) -> bool:
    """Remove encrypted file from disk storage."""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
    except Exception as e:
        print(f"Warning: Could not delete file {file_path}: {e}")
    return False
