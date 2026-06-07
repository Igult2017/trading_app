"""
AES-256-GCM decryption — mirrors server/lib/crypto.ts exactly.
Format stored in DB: ivHex:tagHex:ciphertextHex
Fallback: plain base64 (written by safeEncrypt when no key was set).
"""
import base64
import json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import ENCRYPTION_KEY


def _get_key() -> bytes:
    k = ENCRYPTION_KEY.strip()
    if len(k) == 64 and all(c in "0123456789abcdefABCDEF" for c in k):
        return bytes.fromhex(k)
    raw = k.encode()
    buf = bytearray(32)
    buf[:len(raw)] = raw[:32]
    return bytes(buf)


def decrypt(encoded: str) -> str:
    """Decrypt 'ivHex:tagHex:ciphertextHex' → plaintext."""
    parts = encoded.split(":")
    if len(parts) == 3:
        iv         = bytes.fromhex(parts[0])
        tag        = bytes.fromhex(parts[1])
        ciphertext = bytes.fromhex(parts[2])
        # AESGCM expects ciphertext + tag concatenated
        aesgcm = AESGCM(_get_key())
        return aesgcm.decrypt(iv, ciphertext + tag, None).decode()
    # Fallback: plain base64
    return base64.b64decode(encoded).decode()


def decrypt_json(encoded: str) -> dict:
    return json.loads(decrypt(encoded))


def safe_decrypt(encoded: str | None) -> dict | None:
    if not encoded:
        return None
    try:
        return decrypt_json(encoded)
    except Exception:
        return None
