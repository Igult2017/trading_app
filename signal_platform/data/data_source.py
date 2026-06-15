"""
Data source router — cTrader Open API only.

No silent fallback. If cTrader is not configured or the Spotware request
fails, a RuntimeError is raised so the caller sees exactly what went wrong.
"""
import asyncio
import logging
import os

from data import ctrader_client, ctrader_session

log = logging.getLogger(__name__)
_TIMEOUT = 20  # seconds per fetch

# Bound concurrent cTrader requests so a full scan (instruments × strategies ×
# TFs) cannot saturate the single Open API WebSocket. Excess fetches queue.
_MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_FETCHES", "8"))
_sem: asyncio.Semaphore | None = None


def _semaphore() -> asyncio.Semaphore:
    """Lazily create the semaphore so it binds to the running event loop."""
    global _sem
    if _sem is None:
        _sem = asyncio.Semaphore(_MAX_CONCURRENT)
    return _sem


async def fetch_raw(symbol: str, tf: str, count: int) -> list[dict]:
    """
    Fetch raw [{time,open,high,low,close,volume}] from cTrader Open API.
    Raises RuntimeError when unconfigured or the request fails.
    """
    if not ctrader_session.is_configured():
        raise RuntimeError(
            "cTrader not configured — set CTRADER_CLIENT_ID, "
            "CTRADER_CLIENT_SECRET, CTRADER_ACCOUNT_ID, "
            "CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN"
        )

    broker_sym = symbol.replace("/", "")
    try:
        async with _semaphore():
            return await asyncio.wait_for(
                ctrader_client.fetch_bars(broker_sym, tf, count),
                _TIMEOUT,
            )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            f"[cTrader] {symbol} {tf}: timed out after {_TIMEOUT}s — "
            "check network / Spotware server status"
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"[cTrader] {symbol} {tf}: {exc}") from exc


def active_source() -> str:
    return "cTrader Open API" if ctrader_session.is_configured() else "NOT CONFIGURED"
