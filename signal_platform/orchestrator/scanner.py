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
from scheduler.session_windows import get_current_sessions
from orchestrator.strategy_runner import run_strategy

log = logging.getLogger(__name__)

# Tracks whether the scanner was active on the previous tick.
# SCAN_STARTED fires only on the closed→open transition, not every 60s tick.
_was_scanning: bool = False


def _is_paused() -> bool:
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.info("[scanner] paused — delete .scan_paused to resume")
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
    global _was_scanning
    tick_now = datetime.now(timezone.utc)

    if _is_paused():
        _was_scanning = False
        return
    if not settings.scan_enabled:
        log.debug("[scanner] SCAN_ENABLED=false — skipping tick")
        _was_scanning = False
        return

    log.info(f"[scanner] tick at {tick_now.strftime('%H:%M:%S UTC')}")

    news_context     = await news_fetcher.fetch(tick_now)
    current_sessions = get_current_sessions(tick_now)
    instruments      = instrument_filter.get_open_instruments(tick_now)

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
            "sessions":    current_sessions,
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
