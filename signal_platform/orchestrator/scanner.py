"""
scan_markets() — concurrent market scanner.

Tenant/house model:
  Each strategy (tenant) declares what it needs. The platform (house) resolves
  dependencies, fetches only the required TFs, builds a strategy-specific
  StrategyContext, and calls analyze(context). Strategies never fetch candles,
  import utilities, or call APIs directly.

  Shared TFs across strategies are served from the TTL cache — one network
  call, zero duplication even under full concurrency.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

from core import strategy_registry, event_bus
from config.settings import settings
from data import candle_fetcher, instrument_filter
from news import news_fetcher
from scheduler.session_windows import get_current_sessions, scan_interval_seconds
from scheduler.scheduler import set_scan_interval
from orchestrator.strategy_runner import run_strategy

log = logging.getLogger(__name__)

_PORT = os.getenv("PORT", "5000")
_SESSIONS_URL = os.getenv("APP_BASE_URL", f"http://localhost:{_PORT}") + "/api/market-sessions"

# Tracks whether the scanner was active on the previous tick.
# SCAN_STARTED fires only on the closed→open transition, not every 60s tick.
_was_scanning: bool = False
# None until the first tick — lets us seed live sessions silently so a restart
# during London/NY does not re-emit SESSION_OPEN for already-open sessions.
_active_sessions: set[str] | None = None
_current_interval: int = 60   # mirrors the scheduler's initial scan interval


async def _fetch_active_sessions() -> set[str]:
    """
    Fetch active sessions from the Sessions page API (/api/market-sessions).
    Returns lowercase underscore names e.g. {"london", "new_york"}.
    Falls back to local session_windows calculation if the API is unreachable.
    """
    try:
        import requests as _req
        loop = asyncio.get_running_loop()
        data = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _req.get(_SESSIONS_URL, timeout=3).json()),
            timeout=4,
        )
        return {
            s["name"].lower().replace(" ", "_")
            for s in data.get("sessions", [])
            if s.get("isActive")
        }
    except Exception as exc:
        log.debug("[scanner] sessions API unavailable (%s) — using local fallback", exc)
        return {s.value for s in get_current_sessions() if s.value != "all"}


def _is_paused() -> bool:
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.debug("[scanner] paused — delete .scan_paused to resume")
    return paused


async def _scan_instrument(
    instrument: str,
    strategies: list,
    news_context,
    current_sessions: list,
    tick_now: datetime,
) -> None:
    """Fan each strategy out independently — no shared state between tenants."""
    await asyncio.gather(
        *[run_strategy(s, instrument, news_context, current_sessions, tick_now)
          for s in strategies],
        return_exceptions=True,
    )


async def scan_markets() -> None:
    global _was_scanning, _active_sessions, _current_interval
    tick_now = datetime.now(timezone.utc)
    current_sessions = get_current_sessions(tick_now)

    # Dynamic cadence — faster scans during the London/NY overlap (higher vol).
    desired = scan_interval_seconds(tick_now)
    if desired != _current_interval:
        set_scan_interval(desired)
        _current_interval = desired

    if _is_paused():
        _was_scanning = False
        return
    if not settings.scan_enabled:
        log.debug("[scanner] SCAN_ENABLED=false — skipping tick")
        _was_scanning = False
        return

    # Session-open detection — gated behind the guards so nothing fires while
    # paused/disabled. First tick seeds silently (sessions already open pre-boot).
    live = await _fetch_active_sessions()
    if _active_sessions is None:
        _active_sessions = live
    else:
        for name in live - _active_sessions:
            await event_bus.emit(event_bus.SESSION_OPEN, name)
        _active_sessions = live

    log.info(f"[scanner] tick at {tick_now.strftime('%H:%M:%S UTC')}")

    news_context = await news_fetcher.fetch(tick_now)
    instruments  = instrument_filter.get_open_instruments(tick_now)

    if not instruments:
        log.info("[scanner] market closed — nothing to scan")
        _was_scanning = False
        return

    strategies = strategy_registry.get_enabled()
    if not strategies:
        log.debug("[scanner] no strategies registered — nothing to do")
        _was_scanning = False
        return

    # Fire SCAN_STARTED only on the closed→open transition, not every tick.
    if not _was_scanning:
        await event_bus.emit(event_bus.SCAN_STARTED, {
            "instruments": instruments,
            "sessions":    list(live),
            "tick_now":    tick_now.isoformat(),
        })
    _was_scanning = True

    log.info(f"[scanner] {len(instruments)} instruments × {len(strategies)} strategies")

    await asyncio.gather(
        *[_scan_instrument(inst, strategies, news_context, current_sessions, tick_now)
          for inst in instruments],
        return_exceptions=True,
    )

    log.info(f"[scanner] tick complete — cache: {candle_fetcher.candle_cache.stats()}")
