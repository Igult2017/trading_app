"""
Read this account's cTrader credentials. It does NOT refresh them, and it no longer CAN.

NODE IS THE ONLY TOKEN REFRESHER. cTrader rotates the refresh token on EVERY refresh, and this token
is shared by Node's sync, the signal scanner and this copy engine. When the copy engine refreshed
here — a separate process from Node, so it could not be coalesced — it rotated the shared token and
invalidated the signal scanner: CH_ACCESS_TOKEN_INVALID, crash-loop. Every Python consumer now just
READS the current DB token, which Node and the health watchdog keep fresh. A briefly stale read means
the caller skips and retries next cycle.

THE REFRESH CODE IS GONE, NOT JUST UNUSED (deleted 2026-08-30). `_refresh_ctrader_token` and
`_save_creds` survived that fix with no callers anywhere in the repo — the exact function that caused
the crash-loop, still sitting in the file, one call away from doing it again. A comment saying "we do
not do this any more" beside code that still can is not a safeguard. Git holds the deleted version.
"""
from db import BrokerAccount
from crypto import decrypt_json


async def get_ctrader_creds(broker_account: BrokerAccount) -> dict | None:
    """The decrypted credentials as stored. Never refreshes — see the module docstring."""
    return _decrypt_creds(broker_account)


def _decrypt_creds(account: BrokerAccount) -> dict | None:
    if not account.password_enc:
        return None
    try:
        return decrypt_json(account.password_enc)
    except Exception:
        return None
