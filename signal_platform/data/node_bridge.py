"""
Node.js token bridge — writes rotated cTrader refresh tokens back to broker_accounts.
Configured by main.py after bootstrapping tokens from the Node API.
"""

import logging

import httpx

log = logging.getLogger(__name__)

# Populated by set_node_bridge() once startup bootstrap succeeds
_node_bridge: dict = {}   # keys: account_id, admin_secret, node_api_url


def set_node_bridge(account_id: str, admin_secret: str, node_api_url: str) -> None:
    _node_bridge.update({
        "account_id":   account_id,
        "admin_secret": admin_secret,
        "node_api_url": node_api_url,
    })


def signal_account_param() -> dict:
    """`{"ctrader_id": "..."}` for the pinned account, or `{}` when unpinned.

    THE ONE PLACE THAT BUILDS THIS, so no caller can forget it. Every credential read must carry the
    pin: the token is re-read every ~3 minutes (`ctrader_session.py`) while the account we
    authenticate AS is fixed at boot, so a single unpinned read is enough to hand us somebody else's
    token under our own identity — which cTrader rejects, crash-looping the platform.
    """
    from config.settings import settings
    pin = str(getattr(settings, "ctrader_signal_account_id", "") or "").strip()
    return {"ctrader_id": pin} if pin else {}


async def refetch_from_node() -> dict | None:
    """Pull the CURRENT cTrader tokens from Node's DB. Node keeps them fresh for the copy
    engine, so this recovers the signal platform when its own refresh token goes stale —
    without hammering cTrader's token endpoint (which 429s on a bad token).
    Returns {access_token, refresh_token} or None.

    THIS IS THE CALL THAT MATTERS. It runs every ~3 minutes for the life of the process, and until
    2026-08-30 it asked for no particular account — so it returned whichever one had been touched
    last, by any user. That is how account-page activity reached a running scanner without a restart.
    """
    if not _node_bridge.get("node_api_url") or not _node_bridge.get("admin_secret"):
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            r = await http.get(
                f"{_node_bridge['node_api_url']}/api/internal/ctrader-credentials",
                headers={"x-admin-secret": _node_bridge["admin_secret"]},
                params=signal_account_param(),
            )
        if r.status_code == 200:
            d = r.json()
            if d.get("access_token"):
                return {"access_token": d["access_token"], "refresh_token": d.get("refresh_token", "")}
    except Exception as exc:
        log.debug("[ctrader] could not refetch tokens from Node: %s", exc)
    return None


async def push_rotated_token(new_refresh: str, access_token: str) -> None:
    """Persist a rotated refresh token back to broker_accounts via Node API."""
    if not _node_bridge.get("account_id"):
        return
    try:
        async with httpx.AsyncClient(timeout=5) as http:
            await http.put(
                f"{_node_bridge['node_api_url']}/api/internal/ctrader-credentials",
                headers={"x-admin-secret": _node_bridge["admin_secret"]},
                json={
                    "account_id":    _node_bridge["account_id"],
                    "access_token":  access_token,
                    "refresh_token": new_refresh,
                },
            )
            log.info("[ctrader] rotated refresh token persisted to Node DB")
    except Exception as exc:
        log.debug("[ctrader] could not push rotated token to Node: %s", exc)
