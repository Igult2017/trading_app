"""
OAuth token refresh for cTrader (and extensible to other platforms).
Decrypts stored credentials, refreshes if needed, saves updated token back to DB.
"""
import json
import logging
import aiohttp
from datetime import datetime, timezone
from uuid import uuid4
from db import Session, BrokerAccount
from crypto import decrypt_json
from config import CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CT_TOKEN_URL

log = logging.getLogger("token_manager")


async def get_ctrader_creds(broker_account: BrokerAccount) -> dict | None:
    """Return the decrypted creds — does NOT refresh the token.

    cTrader rotates the refresh token on EVERY refresh, and this token is shared by Node's sync,
    the signal scanner and this copy engine. When the copy engine refreshed here (a separate
    process from Node, so it can't be coalesced), it rotated the shared token and invalidated the
    signal scanner — CH_ACCESS_TOKEN_INVALID, crash-loop. So NODE is now the single token
    refresher (near-expiry, coalesced) and every Python consumer just READS the current DB token,
    which Node + the health watchdog keep fresh. If the read token is briefly stale the caller
    skips and retries next cycle."""
    return _decrypt_creds(broker_account)


def _decrypt_creds(account: BrokerAccount) -> dict | None:
    if not account.password_enc:
        return None
    try:
        return decrypt_json(account.password_enc)
    except Exception:
        return None


async def _refresh_ctrader_token(refresh_token: str) -> dict | None:
    async with aiohttp.ClientSession() as session:
        async with session.post(CT_TOKEN_URL, data={
            "grant_type":    "refresh_token",
            "refresh_token": refresh_token,
            "client_id":     CTRADER_CLIENT_ID,
            "client_secret": CTRADER_CLIENT_SECRET,
        }) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
            expires_in = int(data.get("expires_in", 3600))
            now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
            return {
                "accessToken":   data["access_token"],
                "refreshToken":  data.get("refresh_token", refresh_token),
                "tokenExpiresAt": now_ms + expires_in * 1000,
            }


def _save_creds(account_id: str, creds: dict) -> None:
    # Re-encrypt using AES-256-GCM (same format as TypeScript server/lib/crypto.ts)
    try:
        from _encrypt import encrypt_str
        enc = encrypt_str(json.dumps(creds))
        with Session() as s:
            acc = s.get(BrokerAccount, account_id)
            if acc:
                acc.password_enc = enc
                s.commit()
    except Exception as e:
        log.warning(f"Could not save refreshed token for {account_id}: {e}")
