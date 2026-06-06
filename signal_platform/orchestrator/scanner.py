"""
scan_markets() — concurrent, on-demand scanner.

Tenant/house model:
  The platform (house) provides shared infrastructure: news, sessions, DB,
  event bus, Telegram. Each strategy (tenant) runs independently, fetching
  only the TFs it declared — on demand, only after passing all pre-filters.

  When two strategies share a TF, the first fetch fills the TTL cache; the
  second gets a cache hit at zero network cost. The in-flight dedup in
  candle_fetcher prevents duplicate cTrader calls even under full concurrency.

Runtime pause: create signal_platform/.scan_paused to stop scanning.
"""

import asyncio
import logging
import os
import traceback
from datetime import datetime, timezone

from core import event_bus, strategy_registry, indicator_registry, pattern_registry
from core.types import Session, Trend
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from data import candle_fetcher, instrument_filter
from data.candle_fetcher import fetch_candles
from data.mtf_aligner import build as build_mtf
from news import news_fetcher, news_filter
from scheduler.session_windows import get_current_sessions
from shared import trend_detector
from shared.mtf_utils import to_minutes
from storage import signal_repo
from validation import signal_validator
from validation.ai_validator import validate_chart
from charting.chart_generator import generate_chart
from config.settings import settings

log = logging.getLogger(__name__)
_tick_now: datetime = datetime.now(timezone.utc)


def _is_paused() -> bool:
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.info("[scanner] paused — delete .scan_paused to resume")
    return paused


async def _run_strategy(strategy, instrument: str,
                        news_context, current_sessions: list) -> None:
    """
    Run one strategy on one instrument — isolated, on-demand.

    Candles are fetched only after passing all pre-filters, and only for the
    TFs this strategy (and its indicators/patterns) declared. Shared TFs with
    other strategies are served from the TTL cache — one network call, zero
    duplication even when strategies run concurrently on the same instrument.
    """
    # Filter 1: instrument whitelist
    if (strategy.allowed_instruments is not None
            and instrument not in strategy.allowed_instruments):
        return

    # Filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            return

    # Filter 3: trend — fetches only the HTF this check needs, on demand.
    # If the cache is warm (another strategy already fetched this pair) this
    # is a zero-cost read; otherwise one cTrader call fires and is cached.
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(strategy.required_timeframes, key=to_minutes)
        htf_candles = await fetch_candles(instrument, htf)
        if not htf_candles:
            log.debug(f"[scanner] {instrument}/{strategy.id}: no HTF candles — skip")
            return
        if trend_detector.detect(htf_candles) not in strategy.allowed_trends:
            return

    # Filter 4: news
    if not news_filter.check(strategy, news_context, instrument, now=_tick_now):
        log.debug(f"[scanner] {instrument}/{strategy.id}: news filter — skip")
        return

    # Fetch every TF this strategy (and its indicators/patterns) declared.
    # Concurrent gather: unique TFs fire in parallel; TFs shared with another
    # strategy that already fetched them are instant cache hits.
    owned_tfs: list[str] = list(
        set(strategy.required_timeframes)
        | {tf for ind_id in strategy.required_indicators
           for tf in indicator_registry.get_timeframes(ind_id)}
        | {tf for pat_id in strategy.required_patterns
           for tf in pattern_registry.get_timeframes(pat_id)}
    )

    fetched = await asyncio.gather(
        *[fetch_candles(instrument, tf) for tf in owned_tfs],
        return_exceptions=True,
    )
    candle_view: dict = {
        tf: (r if isinstance(r, list) else [])
        for tf, r in zip(owned_tfs, fetched)
    }

    # Strategy receives exactly and only its declared TFs — nothing from other strategies
    candles = build_mtf(candle_view, strategy.required_timeframes)

    # Each indicator is computed with strategy TFs ∪ its own declared TFs.
    # indicator_cache is local — not shared with any other strategy.
    indicator_cache: dict = {}
    for ind_id in strategy.required_indicators:
        ind_tfs = set(strategy.required_timeframes) | set(indicator_registry.get_timeframes(ind_id))
        ind_candles = build_mtf(candle_view, list(ind_tfs))
        result = indicator_registry.compute(ind_id, ind_candles)
        if result:
            indicator_cache[ind_id] = result

    indicators = IndicatorBundle.from_cache(indicator_cache, strategy.required_indicators)

    # Patterns receive strategy TFs + any TFs the pattern itself declared.
    # pattern_cache is local — not shared with any other strategy.
    pattern_tfs = set(strategy.required_timeframes)
    for pat_id in strategy.required_patterns:
        pattern_tfs.update(pattern_registry.get_timeframes(pat_id))
    candles_by_tf = {tf: candle_view[tf] for tf in pattern_tfs if tf in candle_view}
    pattern_cache: dict = {}
    for pat_id in strategy.required_patterns:
        pattern_cache[pat_id] = pattern_registry.detect(pat_id, candles_by_tf)

    patterns = PatternBundle.from_cache(pattern_cache, strategy.required_patterns)

    try:
        result = await strategy.analyze(candles, indicators, patterns, news_context)
    except Exception:
        log.error(f"[scanner] {strategy.id} on {instrument} raised:\n"
                  + traceback.format_exc())
        return

    valid_signals = signal_validator.validate(result, instrument)
    if not valid_signals:
        return

    htf = max(strategy.required_timeframes, key=to_minutes)
    pri_candles = candle_view.get(htf, [])

    for signal in valid_signals:
        signal.strategy_id   = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        chart_path = await generate_chart(pri_candles, signal)
        signal.chart_path = chart_path

        if not await validate_chart(chart_path):
            log.info(f"[scanner] {instrument} signal rejected by AI validator")
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
