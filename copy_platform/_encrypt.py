"""
AES-256-GCM encrypt — mirrors server/lib/crypto.ts encrypt().
Used only for writing refreshed tokens back to the database.
"""
import os
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


def encrypt_str(plaintext: str) -> str:
    """Returns 'ivHex:tagHex:ciphertextHex' — same format as TypeScript encrypt()."""
    key    = _get_key()
    iv     = os.urandom(12)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext+tag concatenated (tag is last 16 bytes)
    ct_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    ct     = ct_tag[:-16]
    tag    = ct_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ct.hex()}"
