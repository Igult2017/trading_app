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


def _is_hex(s: str) -> bool:
    return len(s) > 0 and all(c in "0123456789abcdefABCDEF" for c in s)


def decrypt(encoded: str) -> str:
    """Decrypt 'ivHex:tagHex:ciphertextHex' (AES-256-GCM), or fall back to plain base64
    (written by safeEncrypt when no key was set, e.g. accounts connected before the key
    existed). Only takes the AES path when all 3 parts are valid hex, and on ANY AES
    failure (corrupt / wrong key) falls back to base64 — so a legacy or mismatched token
    degrades instead of crashing the caller."""
    parts = encoded.split(":")
    if len(parts) == 3 and all(_is_hex(p) for p in parts):
        try:
            iv, tag, ciphertext = (bytes.fromhex(p) for p in parts)
            # AESGCM expects ciphertext + tag concatenated
            return AESGCM(_get_key()).decrypt(iv, ciphertext + tag, None).decode()
        except Exception:
            pass  # wrong key / corrupt AES blob → try base64 below
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
