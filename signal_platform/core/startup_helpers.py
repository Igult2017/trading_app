"""
Boot-phase helpers for main.py — status file writer and Node token bootstrap.
"""

import asyncio
import json
import logging
import time
from pathlib import Path

import httpx

log = logging.getLogger("signal_platform")

_STATUS_FILE = Path("/app/.signal_platform_status.json")


def write_status(status: str, error: str = "", hint: str = "") -> None:
    try:
        _STATUS_FILE.write_text(json.dumps({
            "status": status,
            "error":  error,
            "hint":   hint,
            "ts":     int(time.time()),
        }))
    except OSError:
        pass


async def bootstrap_ctrader_tokens(settings) -> None:
    """Pull fresh tokens from Node's broker_accounts — always current even after rotation."""
    if not settings.admin_secret:
        log.warning("[boot] ADMIN_SECRET not set — cannot fetch tokens from Node DB, falling back to CTRADER_REFRESH_TOKEN env var (may be stale)")
        return
    if not settings.node_api_url:
        log.warning("[boot] node_api_url not set — cannot fetch tokens from Node DB")
        return
    url = f"{settings.node_api_url}/api/internal/ctrader-credentials"
    for attempt in range(4):
        try:
            async with httpx.AsyncClient(timeout=5) as http:
                r = await http.get(url, headers={"x-admin-secret": settings.admin_secret})
            if r.status_code == 200:
                data = r.json()
                object.__setattr__(settings, "ctrader_access_token",  data["access_token"])
                object.__setattr__(settings, "ctrader_refresh_token", data["refresh_token"])
                from data.ctrader_session import set_node_bridge
                set_node_bridge(data["account_id"], settings.admin_secret, settings.node_api_url)
                log.info("[boot] tokens loaded from Node DB (ctrader_id=%s)", data.get("ctrader_id", "?"))
                return
            elif r.status_code == 404:
                log.info("[boot] Node: no cTrader account in DB — using env vars")
                return
            else:
                log.debug("[boot] Node credentials endpoint HTTP %d", r.status_code)
        except Exception as exc:
            log.debug("[boot] Node API attempt %d failed: %s", attempt + 1, exc)
        if attempt < 3:
            await asyncio.sleep(5)
    log.warning("[boot] could not fetch tokens from Node after 4 attempts — falling back to env vars")
