"""
scan_markets() — concurrent, on-demand scanner.

Tenant/house model:
  Each strategy (tenant) declares what it needs. The platform (house) resolves
  dependencies, fetches only the required TFs, builds a strategy-specific
  StrategyContext, and calls analyze(context). Strategies never fetch candles,
  import utilities, or call APIs.

  Shared TFs across strategies are served from the TTL cache — one network
  call, zero duplication even under full concurrency.
"""

import asyncio
import logging
import os
import traceback
from datetime import datetime, timezone

from core import event_bus, strategy_registry
from core.types import Session, Trend
from core.dependency_resolver import resolve
from core.strategy_context_builder import build as build_context
from data import candle_fetcher, instrument_filter
from data.candle_fetcher import fetch_candles
from news import news_fetcher, news_filter
from scheduler.session_windows import get_current_sessions
from shared import trend_detector
from shared.mtf_utils import to_minutes
from storage import signal_repo
from validation import signal_validator, ai_validator
from charting.chart_generator import generate_chart
from config.settings import settings
from risk import spread_filter, volatility_filter, sl_validator

log = logging.getLogger(__name__)
_tick_now: datetime = datetime.now(timezone.utc)


def _is_paused() -> bool:
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.info("[scanner] paused — delete .scan_paused to resume")
    return paused


async def _run_strategy(strategy, instrument: str,
                        news_context, current_sessions: list) -> None:
    # Pre-filter 1: instrument whitelist
    if strategy.allowed_instruments is not None:
        if instrument not in strategy.allowed_instruments:
            return

    # Pre-filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            return

    # Pre-filter 3: trend — fetches only the HTF; cache hit if already warm
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(strategy.required_timeframes, key=to_minutes)
        htf_candles = await fetch_candles(instrument, htf)
        if not htf_candles:
            return
        if trend_detector.detect(htf_candles) not in strategy.allowed_trends:
            return

    # Pre-filter 4: news
    if not news_filter.check(strategy, news_context, instrument, now=_tick_now):
        return

    # Resolve every TF and component this strategy needs from its declarations
    deps = resolve(strategy)

    # Fetch all required TFs concurrently — shared TFs are instant cache hits
    fetched = await asyncio.gather(
        *[fetch_candles(instrument, tf) for tf in deps.timeframes],
        return_exceptions=True,
    )
    candle_view = {
        tf: (r if isinstance(r, list) else [])
        for tf, r in zip(deps.timeframes, fetched)
    }

    # Build the strategy's context — returns None if any TF has too few candles
    context = build_context(
        symbol=instrument, deps=deps, candle_view=candle_view,
        news_context=news_context, current_sessions=current_sessions,
    )
    if context is None:
        return

    try:
        result = await strategy.analyze(context)
    except Exception:
        log.error(f"[scanner] {strategy.id} on {instrument}:\n{traceback.format_exc()}")
        return

    valid_signals = signal_validator.validate(result, instrument)
    if not valid_signals:
        return

    htf         = max(strategy.required_timeframes, key=to_minutes)
    pri_candles = candle_view.get(htf, [])

    for signal in valid_signals:
        signal.strategy_id   = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        # Risk filters — only run when strategy declared it needs them
        if strategy.requires_volatility:
            if not volatility_filter.check(signal, pri_candles):
                continue
            if not sl_validator.check(signal, pri_candles):
                continue
        if strategy.requires_spread and context.spread is not None:
            if not spread_filter.check(signal, context.spread):
                continue

        chart_path = await generate_chart(pri_candles, signal)
        signal.chart_path = chart_path

        if ai_validator.is_available():
            if not await ai_validator.validate_chart(chart_path):
                log.info(f"[scanner] {instrument} rejected by AI validator")
                continue

        signal_repo.save(signal)
        signal_validator.register_confirmed(signal)
        await event_bus.emit(event_bus.SIGNAL_CONFIRMED, signal)
        log.info(
            f"[scanner] CONFIRMED — {instrument} "
            f"{signal.direction.value.upper()} "
            f"conf={signal.confidence:.0%} strategy={strategy.id}"
        )


async def _scan_instrument(instrument: str, strategies: list,
                           news_context, current_sessions: list) -> None:
    """Fan each strategy out independently — no shared state between tenants."""
    await asyncio.gather(
        *[_run_strategy(s, instrument, news_context, current_sessions)
          for s in strategies],
        return_exceptions=True,
    )


async def scan_markets() -> None:
    global _tick_now
    _tick_now = datetime.now(timezone.utc)
    now = _tick_now

    if _is_paused():
        return
    if not settings.scan_enabled:
        log.debug("[scanner] SCAN_ENABLED=false — skipping tick")
        return

    log.info(f"[scanner] tick at {now.strftime('%H:%M:%S UTC')}")

    news_context     = await news_fetcher.fetch(now)
    current_sessions = get_current_sessions(now)
    instruments      = instrument_filter.get_open_instruments(now)

    if not instruments:
        log.info("[scanner] market closed — nothing to scan")
        return

    strategies = strategy_registry.get_enabled()
    if not strategies:
        log.debug("[scanner] no strategies registered — nothing to do")
        return

    log.info(f"[scanner] {len(instruments)} instruments × {len(strategies)} strategies")

    await asyncio.gather(
        *[_scan_instrument(inst, strategies, news_context, current_sessions)
          for inst in instruments],
        return_exceptions=True,
    )

    log.info(f"[scanner] tick complete — cache: {candle_fetcher.candle_cache.stats()}")
