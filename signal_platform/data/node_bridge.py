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
