"""
Credential manager — decrypts broker account credentials for all platforms.
cTrader also refreshes the OAuth token. Others just decrypt and annotate.
"""
import logging
from db import BrokerAccount
from crypto import decrypt_json

log = logging.getLogger("cred_manager")


def _decrypt(account: BrokerAccount) -> dict | None:
    if not account.password_enc:
        return None
    try:
        return decrypt_json(account.password_enc)
    except Exception:
        return None


async def get_creds(broker_account: BrokerAccount) -> dict | None:
    """Return a creds dict usable by providers and executors for any platform."""
    platform = (broker_account.platform or "").lower()

    if platform in ("ctrader", "ct"):
        from token_manager import get_ctrader_creds
        return await get_ctrader_creds(broker_account)

    creds = _decrypt(broker_account)
    if creds is None:
        log.error(f"Could not decrypt creds for account {broker_account.id} ({platform})")
        return None

    # Annotate with metadata needed by providers / executors
    creds["loginId"]     = broker_account.login_id or ""
    creds["server"]      = broker_account.server or ""
    creds["accountType"] = broker_account.account_type or "demo"
    # Binance: loginId = apiKey, secret already in creds
    if platform == "binance":
        creds["apiKey"] = broker_account.login_id or ""

    return creds
