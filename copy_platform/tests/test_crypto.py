"""THE COPY ENGINE MUST BE ABLE TO READ WHAT THE WEBSITE WROTE.

Every broker credential travels Node -> PostgreSQL -> Python. Node encrypts it
(`server/lib/crypto.ts`), the copy engine decrypts it (`copy_platform/crypto.py`). The two are
separate implementations of AES-256-GCM in different languages that must agree exactly on key
handling and wire format. If they ever stop agreeing the copier is not degraded, it is DEAD — every
master and every follower fails to start, with nothing more informative than "could not decrypt".

THE VECTOR BELOW WAS PRODUCED BY THE REAL NODE CODE, not by this file's own encryptor. A test that
encrypts and decrypts with the same Python function proves only that Python is self-consistent; it
would stay green through any Node-side change. Regenerate it with `server/lib/crypto.ts`'s
`encrypt()` and the key below if the format ever legitimately changes.
"""
import json

from _harness import Suite, TEST_KEY, repo_path

from crypto import decrypt, decrypt_json, safe_decrypt
from config import ENCRYPTION_KEY

s = Suite("CRYPTO — Python reads what Node wrote")

# Produced by Node's createCipheriv('aes-256-gcm') under TEST_KEY. Do not hand-edit.
NODE_VECTOR = (
    "a493c5b6c9849d76120ad054:07ebf2a546d77b54409bc4ed36f07ce7:"
    "7632a56428e3efdac6adf003ca0f0167f0cbb48b138b9ec01cef063b4927b49426345c9cc7e78ac9"
    "1121185880d9283506bdd5601d4d3fc3b4c1e2f07b550538b4d321cac68e0a62cf54267cf15f1ea2"
    "e4d12c4c65bd"
)
EXPECTED = {"accessToken": "tok-abc", "refreshToken": "ref-xyz",
            "ctraderId": "47535363", "app": "sync"}

s.check("the test key reached config", ENCRYPTION_KEY, TEST_KEY)
s.check("a Node-encrypted blob decrypts in Python", decrypt_json(NODE_VECTOR), EXPECTED)

# The four fields the providers and executors actually read off this blob. `ctraderId` and
# `accessToken` are what CTraderProvider authenticates with; `app` decides WHICH cTrader
# application's credentials are used, and the wrong one fails as "invalid client".
creds = decrypt_json(NODE_VECTOR)
for field in ("accessToken", "refreshToken", "ctraderId", "app"):
    s.check(f"{field} survives the trip", creds.get(field), EXPECTED[field])


# ── THE FALLBACK PATH ───────────────────────────────────────────────────────
# safeEncrypt writes plain base64 when no key is set. Accounts connected before the key existed
# are still stored that way, so this path must keep working.
import base64  # noqa: E402

legacy = base64.b64encode(json.dumps(EXPECTED).encode()).decode()
s.check("a legacy base64 blob still decrypts", decrypt_json(legacy), EXPECTED)

# A corrupt or wrong-key blob must degrade, not crash the caller.
s.check("garbage returns None rather than raising", safe_decrypt("not-a-real-blob"), None)
s.check("an empty value returns None", safe_decrypt(""), None)
s.check("a well-formed blob under the WRONG key returns None, never a partial read",
        safe_decrypt("aa" * 12 + ":" + "bb" * 16 + ":" + "cc" * 40), None)


# ── THE TWO IMPLEMENTATIONS MUST STAY IN STEP ───────────────────────────────
# Both derive the key the same way: 64 hex characters become 32 raw bytes, anything else is
# padded/truncated to 32. If one side changes that rule, every credential becomes unreadable.
node_crypto = open(repo_path("server", "lib", "crypto.ts"), encoding="utf-8").read()
s.check("Node still uses AES-256-GCM", "aes-256-gcm" in node_crypto, True)
s.check("Node still keys off COPY_ENCRYPTION_KEY", "COPY_ENCRYPTION_KEY" in node_crypto, True)
s.check("Node still treats 64 hex chars as a raw key",
        "/^[0-9a-fA-F]{64}$/" in node_crypto, True)
s.check("Node still writes iv:tag:ciphertext in that order",
        "${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}" in node_crypto, True)


# ── TEETH ───────────────────────────────────────────────────────────────────
# Flip one character of the ciphertext: the authentication tag must reject it. Without this the
# suite could pass against an implementation that ignored the tag entirely.
tampered = NODE_VECTOR[:-1] + ("a" if NODE_VECTOR[-1] != "a" else "b")
try:
    decrypt(tampered)
    rejected = False
except Exception:
    rejected = True
s.teeth("a tampered ciphertext", rejected)

s.done()
