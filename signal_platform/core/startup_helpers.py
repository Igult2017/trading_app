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
_S3_MARKER   = Path("/app/.s3_down")   # dedup so a crash-loop alerts ONCE, not every restart


def _send_coded(text: str) -> None:
    """Coded telemetry to the PRIVATE admin chat (WATCHDOG_CHAT_ID) — never the public channel.
    Same 'S3' code the Node watchdog uses, so it reads as routine and only you understand it."""
    import os
    bot  = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat = os.getenv("WATCHDOG_CHAT_ID", "")
    if not bot or not chat:
        return
    try:
        with httpx.Client(timeout=8) as h:
            h.post(f"https://api.telegram.org/bot{bot}/sendMessage", json={"chat_id": chat, "text": text})
    except Exception:
        pass


def _spell_duration(seconds: int) -> str:
    """"4h 45m", "12m", "2d 3h" — a length someone can feel, not a count of seconds."""
    m = max(1, int(seconds // 60))
    d, rem = divmod(m, 1440)
    h, mm = divmod(rem, 60)
    if d:
        return f"{d}d {h}h" if h else f"{d}d"
    if h:
        return f"{h}h {mm:02d}m" if mm else f"{h}h"
    return f"{mm}m"


def report_downtime(outage) -> None:
    """THE OUTAGE THAT LEAVES NO PROCESS BEHIND TO REPORT IT.

    The existing S3 alert fires from `write_status` on a BOOT ERROR — Python started, ran its checks
    and found a fault. That covers a misconfigured or unreachable start, and it covers nothing else:
    if the process is KILLED, or the container dies, or the host goes away, `write_status` is never
    called, so no down alert is sent and no recovery is sent either (⏫ only fires when a prior ⏬ left
    the marker behind). An absence with nothing running is invisible to it BY CONSTRUCTION.

    That is exactly what happened on 15 Aug 2026: the platform was gone 09:00 → 13:45 UTC, 4h 45m,
    and nothing said a word. The outage WAS detected and written to `platform_downtime` at the next
    boot — and then sat in the database, because nothing read it. It surfaced five days later only
    because the heartbeat was finally exposed through the API.

    THE HEARTBEAT'S AGE AT BOOT IS THE ONLY WITNESS to that class of failure, so this is the only
    place such an outage can be announced from. Sent through the same private coded channel as the
    other S3 telemetry, and ⏫ because by the time this runs the platform is back.

    NO DEDUP NEEDED, and none is added: `detect_downtime` compares the heartbeat's age at THIS boot,
    so a crash-loop restarting every 60s sees a 60-second-old heartbeat, falls under the 300s
    threshold and returns None. The alert can only fire on a genuine absence.
    """
    if outage is None:
        return
    try:
        _send_coded(
            f"🛰️ S3 ⏫\n\n"
            f"The signal engine was NOT RUNNING for {_spell_duration(outage.seconds)} —\n"
            f"   from  {outage.down_from:%d %b %H:%M} UTC\n"
            f"   to    {outage.down_to:%d %b %H:%M} UTC\n\n"
            f"No signal of any kind could have been sent in that window. Anything that set up while "
            f"it was down was MISSED, not declined — that is the difference this tells you.\n\n"
            f"It is back up and scanning now."
        )
    except Exception:
        # Telemetry must never be able to stop the platform booting.
        pass


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
    # Fail-loud: on a boot ERROR, ping the private chat IMMEDIATELY (no waiting for the 10-min
    # watchdog), deduped by the marker so a crash-loop alerts once. "ok" = scheduler confirmed
    # running → clear the marker and send the coded recovery. "starting" never alerts.
    try:
        if status == "error" and not _S3_MARKER.exists():
            _S3_MARKER.write_text((error or hint or "boot error")[:200])
            _send_coded(f"🛰️ S3 ⏬\n{(error or hint or 'boot error')[:180]}")
        elif status == "ok" and _S3_MARKER.exists():
            # Recovery: mirror the down alert's clarity — say plainly it's resolved and echo the
            # prior fault (stored in the marker), so the ⏫ reads as a real 'all-clear', not a bare code.
            try:
                prior = _S3_MARKER.read_text().strip()[:150]
            except Exception:
                prior = ""
            _S3_MARKER.unlink(missing_ok=True)
            _send_coded("🛰️ S3 ⏫ RESOLVED — signal scanner back online"
                        + (f"\n(was: {prior})" if prior else ""))
    except Exception:
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
                # Adopt the account the loaded token ACTUALLY belongs to — overrides any stale
                # CTRADER_ACCOUNT_ID env. Without this the session authenticates a different
                # account than the token (e.g. env=47535363 vs token ctrader_id=47535327),
                # cTrader rejects it as "account invalid", and the platform crash-loops on boot.
                # configure() runs after this (main.py), so the override takes effect; this also
                # self-corrects whenever the connected cTrader account changes.
                ctid = data.get("ctrader_id")
                if ctid:
                    try:
                        object.__setattr__(settings, "ctrader_account_id", int(ctid))
                    except (TypeError, ValueError):
                        pass
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
