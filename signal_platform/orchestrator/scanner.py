"""
scan_markets() — concurrent, cache-driven scanner.

Runtime pause: create signal_platform/.scan_paused to stop scanning
without restarting the process. Delete the file to resume.
chart_generator.generate_chart() is async — offloads to executor so
matplotlib never blocks the event loop.
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
from data.candle_fetcher import prefetch_all
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
    """Check for the runtime pause file — no restart needed to pause/resume."""
    paused = os.path.exists(settings.scan_pause_file)
    if paused:
        log.info("[scanner] paused — delete .scan_paused to resume")
    return paused


def _collect_needed_pairs(instruments: list[str], strategies: list) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for instrument in instruments:
        for strategy in strategies:
            if (strategy.allowed_instruments is not None
                    and instrument not in strategy.allowed_instruments):
                continue
            for tf in strategy.required_timeframes:
                pairs.append((instrument, tf))
    return pairs


async def _run_strategy(strategy, instrument: str,
                        candle_cache: dict, indicator_cache: dict,
                        pattern_cache: dict, news_context,
                        current_sessions: list) -> None:

    # Filter 1: instrument
    if (strategy.allowed_instruments is not None
            and instrument not in strategy.allowed_instruments):
        return

    # Filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            return

    # Filter 3: trend
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(strategy.required_timeframes, key=to_minutes)
        htf_candles = candle_cache.get(htf, [])
        if not htf_candles:
            log.debug(f"[scanner] {instrument}/{strategy.id}: no HTF candles — skip")
            return
        trend = trend_detector.detect(htf_candles)
        if trend not in strategy.allowed_trends:
            return

    # Filter 4: news
    if not news_filter.check(strategy, news_context, instrument, now=_tick_now):
        log.debug(f"[scanner] {instrument}/{strategy.id}: news filter — skip")
        return

    candles = build_mtf(candle_cache, strategy.required_timeframes)

    for ind_id in strategy.required_indicators:
        if ind_id not in indicator_cache:
            result = indicator_registry.compute(ind_id, candles)
            if result:
                indicator_cache[ind_id] = result

    indicators = IndicatorBundle.from_cache(indicator_cache, strategy.required_indicators)

    candles_by_tf = {tf: candle_cache[tf]
                     for tf in strategy.required_timeframes
                     if tf in candle_cache}
    for pat_id in strategy.required_patterns:
        if pat_id not in pattern_cache:
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
    pri_candles = candle_cache.get(htf, [])

    for signal in valid_signals:
        signal.strategy_id   = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        # generate_chart is now async — runs in thread pool, never blocks loop
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
    all_tfs = {tf for s in strategies for tf in s.required_timeframes
               if s.allowed_instruments is None
               or instrument in (s.allowed_instruments or [])}

    candle_cache: dict = {
        tf: candle_fetcher.candle_cache.get(instrument, tf) or []
        for tf in all_tfs
    }
    indicator_cache: dict = {}
    pattern_cache:   dict = {}

    await asyncio.gather(
        *[_run_strategy(s, instrument, candle_cache, indicator_cache,
                        pattern_cache, news_context, current_sessions)
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

    needed_pairs = _collect_needed_pairs(instruments, strategies)
    await prefetch_all(needed_pairs, count=100)

    log.info(f"[scanner] {len(instruments)} instruments × {len(strategies)} strategies")

    await asyncio.gather(
        *[_scan_instrument(inst, strategies, news_context, current_sessions)
          for inst in instruments],
        return_exceptions=True,
    )

    log.info(f"[scanner] tick complete — cache: {candle_fetcher.candle_cache.stats()}")
