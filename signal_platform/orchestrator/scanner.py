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


async def _fetch_active_sessions() -> set[str] | None:
    """
    Active sessions from the Sessions API (/api/market-sessions), as lowercase
    underscore names e.g. {"london", "new_york"}.

    Returns None when the API is unreachable. The caller then SKIPS session-open
    detection for that tick rather than seeding/diffing against the local
    taxonomy (which uses "asian" instead of "tokyo"/"sydney"). Mixing the two
    sources is what made a restart announce already-open sessions as "just
    opened" — so we deliberately use a single source and wait for it.
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
        log.debug("[scanner] sessions API unavailable (%s) — skipping session-open detection this tick", exc)
        return None


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
    # paused/disabled. Uses ONE source (the sessions API); when it's unreachable
    # (e.g. the first seconds after a restart, before Node is up) we skip this
    # tick rather than diff against a different taxonomy. The first *real* reading
    # seeds silently, so a restart never re-announces already-open sessions.
    live = await _fetch_active_sessions()
    if live is not None:
        if _active_sessions is None:
            _active_sessions = live                       # seed silently on first real reading
        elif live != _active_sessions:
            for name in sorted(live - _active_sessions):
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

    # Fire SCAN_STARTED only on the closed→open transition — AND only once the
    # active session is established (sessions API reachable). After a restart we
    # hold the announcement until then, so it always names the accurate session
    # instead of going out session-less in the first seconds before Node is up.
    if not _was_scanning and _active_sessions is not None:
        await event_bus.emit(event_bus.SCAN_STARTED, {
            "instruments": instruments,
            "sessions":    sorted(_active_sessions),
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
