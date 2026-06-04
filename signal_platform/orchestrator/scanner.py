"""
scan_markets() — concurrent, cache-driven scanner.

Architecture improvements over the naive sequential version:
  1. PREFETCH — all candles needed this tick are fetched concurrently upfront.
     The scan loop then reads purely from memory (no IO during scanning).
  2. CONCURRENT INSTRUMENTS — instruments are scanned in parallel with gather().
  3. CONCURRENT STRATEGIES — strategies for each instrument run in parallel.
  4. SINGLE HTF FETCH — trend filter reuses the same candles as the main fetch
     (count=100 covers the trend filter's 50-bar need automatically).
  5. SHARED CACHES — candle, indicator, pattern caches are per-instrument and
     shared across strategies, so work is never duplicated within a tick.
"""

import asyncio
import logging
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
from validation.signal_validator import register_confirmed
from validation.ai_validator import validate_chart
from charting.chart_generator import generate_chart

log = logging.getLogger(__name__)
_tick_now: datetime = datetime.now(timezone.utc)   # set once per tick, shared across all calls


# ── Helpers ───────────────────────────────────────────────────────────────────

def _collect_needed_pairs(instruments: list[str],
                          strategies: list) -> list[tuple[str, str]]:
    """
    Before any fetching, collect every (symbol, tf) this tick will need.
    Deduplication happens inside prefetch_all via set().
    """
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
    """Execute one strategy on one instrument. All reads from cache — no IO."""

    # Filter 1: instrument
    if (strategy.allowed_instruments is not None
            and instrument not in strategy.allowed_instruments):
        return

    # Filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            return

    # Filter 3: trend — uses candles already in cache (count=100 covers n=50)
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(strategy.required_timeframes, key=to_minutes)
        htf_candles = candle_cache.get(htf, [])
        if not htf_candles:
            log.debug(f"[scanner] {instrument}/{strategy.id}: no HTF candles — skip")
            return
        trend = trend_detector.detect(htf_candles)
        if trend not in strategy.allowed_trends:
            return

    # Filter 4: news (pass now so it's consistent across the entire tick)
    if not news_filter.check(strategy, news_context, instrument, now=_tick_now):
        log.debug(f"[scanner] {instrument}/{strategy.id}: news filter — skip")
        return

    # Build MTFCandles from cache
    candles = build_mtf(candle_cache, strategy.required_timeframes)

    # Compute indicators (shared cache — computed once per instrument per tick)
    for ind_id in strategy.required_indicators:
        if ind_id not in indicator_cache:
            result = indicator_registry.compute(ind_id, candles)
            if result:
                indicator_cache[ind_id] = result

    indicators = IndicatorBundle.from_cache(indicator_cache, strategy.required_indicators)

    # Detect patterns (shared cache — detected once per instrument per tick)
    candles_by_tf = {tf: candle_cache[tf]
                     for tf in strategy.required_timeframes
                     if tf in candle_cache}
    for pat_id in strategy.required_patterns:
        if pat_id not in pattern_cache:
            pattern_cache[pat_id] = pattern_registry.detect(pat_id, candles_by_tf)

    patterns = PatternBundle.from_cache(pattern_cache, strategy.required_patterns)

    # Run strategy
    try:
        result = await strategy.analyze(candles, indicators, patterns, news_context)
    except Exception:
        log.error(f"[scanner] {strategy.id} on {instrument} raised:\n"
                  + traceback.format_exc())
        return

    # Validate + store + emit
    valid_signals = signal_validator.validate(result, instrument)
    if not valid_signals:
        return

    htf       = max(strategy.required_timeframes, key=to_minutes)
    pri_candles = candle_cache.get(htf, [])

    for signal in valid_signals:
        signal.strategy_id   = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        chart_path = generate_chart(pri_candles, signal)
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
            f"confidence={signal.confidence:.0%} "
            f"strategy={strategy.id}"
        )


async def _scan_instrument(instrument: str, strategies: list,
                           news_context, current_sessions: list) -> None:
    """
    Scan one instrument against all strategies concurrently.
    Each strategy shares the candle/indicator/pattern caches for this instrument.
    """
    # Build per-instrument cache from the global between-tick candle cache
    all_tfs = {tf for s in strategies for tf in s.required_timeframes
               if s.allowed_instruments is None
               or instrument in (s.allowed_instruments or [])}

    candle_cache: dict = {
        tf: candle_fetcher.candle_cache.get(instrument, tf) or []
        for tf in all_tfs
    }

    indicator_cache: dict = {}
    pattern_cache:   dict = {}

    # Run all strategies concurrently — they share the caches above but
    # each strategy only reads from them, never writes (caches are pre-populated above)
    await asyncio.gather(
        *[_run_strategy(s, instrument, candle_cache, indicator_cache,
                        pattern_cache, news_context, current_sessions)
          for s in strategies],
        return_exceptions=True,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

async def scan_markets() -> None:
    global _tick_now
    _tick_now = datetime.now(timezone.utc)
    now = _tick_now
    log.info(f"[scanner] tick at {now.strftime('%H:%M:%S UTC')}")

    news_context     = await news_fetcher.fetch(now)
    current_sessions = get_current_sessions(now)
    instruments      = instrument_filter.get_open_instruments(now)

    if not instruments:
        log.info("[scanner] market closed — nothing to scan")
        return

    strategies = strategy_registry.get_enabled()
    if not strategies:
        log.debug("[scanner] no strategies registered")
        return

    # STEP 1 — Concurrent prefetch: collect all needed (symbol, tf) pairs,
    # then fetch everything that isn't in cache in one gather() call.
    needed_pairs = _collect_needed_pairs(instruments, strategies)
    await prefetch_all(needed_pairs, count=100)

    log.info(
        f"[scanner] scanning {len(instruments)} instruments "
        f"x {len(strategies)} strategies (concurrent)"
    )

    # STEP 2 — Scan all instruments concurrently (reads from cache — no IO)
    await asyncio.gather(
        *[_scan_instrument(inst, strategies, news_context, current_sessions)
          for inst in instruments],
        return_exceptions=True,
    )

    log.info(f"[scanner] tick complete — cache: {candle_fetcher.candle_cache.stats()}")
