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
    """Return decrypted creds dict, refreshing access token if expired."""
    creds = _decrypt_creds(broker_account)
    if not creds:
        return None

    refresh_token = creds.get("refreshToken")
    if not refresh_token:
        return creds

    # Only refresh when the token is missing an expiry or is within 5 min of it —
    # avoids a network round-trip on every command (cTrader tokens last ~1 hour).
    now_ms     = int(datetime.now(timezone.utc).timestamp() * 1000)
    expires_at = creds.get("tokenExpiresAt")
    needs_refresh = (not expires_at) or now_ms >= (int(expires_at) - 300_000)
    if not needs_refresh:
        return creds

    try:
        new_creds = await _refresh_ctrader_token(refresh_token)
        if new_creds:
            creds.update(new_creds)
            _save_creds(broker_account.id, creds)
            return creds
    except Exception as e:
        log.warning(f"Token refresh failed for {broker_account.id}: {e}")

    # Refresh did not succeed. If the existing token is already expired, handing it
    # back would just loop the provider in auth-fail forever — return None so the
    # caller skips and retries next cycle. If we're only inside the 5-min early-refresh
    # window (token still valid), the old token still works, so use it.
    is_expired = (not expires_at) or now_ms >= int(expires_at)
    if is_expired:
        log.error(f"cTrader token for {broker_account.id} expired and refresh failed — skipping")
        return None
    return creds


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
