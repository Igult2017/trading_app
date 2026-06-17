"""
Per-strategy execution — resolves deps, builds context, runs one strategy
against one instrument, applies all filters, and emits confirmed signals.

Called concurrently by scanner._scan_instrument for every (strategy, instrument)
pair. Strategies never import utilities or call APIs directly.
"""

import asyncio
import logging
import traceback
from datetime import datetime

from core import event_bus
from core.types import Session, Trend
from core.dependency_resolver import resolve
from core.strategy_context_builder import build as build_context
from data.candle_fetcher import fetch_candles
from news import news_filter
from shared import trend_detector
from shared.mtf_utils import to_minutes
from storage import signal_repo
from validation import signal_validator, ai_validator
from risk import spread_filter, volatility_filter, sl_validator

log = logging.getLogger(__name__)


async def run_strategy(
    strategy,
    instrument: str,
    news_context,
    current_sessions: list,
    tick_now: datetime,
) -> None:
    # Pre-filter 1: instrument whitelist
    if strategy.allowed_instruments is not None:
        if instrument not in strategy.allowed_instruments:
            log.debug(f"[runner] {strategy.id}: {instrument} not in allowed_instruments — skip")
            return

    # Pre-filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            log.info(f"[runner] {strategy.id}/{instrument}: outside allowed session — skip")
            return

    # Resolve deps early — pure computation, gives correct HTF for all filters
    deps = resolve(strategy)

    if not deps.timeframes:
        log.warning(f"[runner] {strategy.id}/{instrument}: no timeframes resolved — skip")
        return  # no TFs resolved — strategy cannot run

    # Pre-filter 3: trend — only fetches HTF; instant cache hit if scanner ran recently
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(deps.timeframes, key=to_minutes)
        htf_candles = await fetch_candles(instrument, htf)
        if not htf_candles:
            log.warning(f"[runner] {strategy.id}/{instrument}: no {htf} candles for trend check — skip")
            return
        current_trend = trend_detector.detect(htf_candles)
        if current_trend not in strategy.allowed_trends:
            log.info(f"[runner] {strategy.id}/{instrument}: trend={current_trend.value} not in allowed — skip")
            return

    # Pre-filter 4: news
    if not news_filter.check(strategy, news_context, instrument, now=tick_now):
        log.info(f"[runner] {strategy.id}/{instrument}: blocked by news filter — skip")
        return

    # Fetch all required TFs — use per-strategy bar counts when declared
    _counts = getattr(strategy, "candle_counts", {})
    fetched = await asyncio.gather(
        *[fetch_candles(instrument, tf, count=_counts.get(tf, 100))
          for tf in deps.timeframes],
        return_exceptions=True,
    )
    candle_view = {
        tf: (r if isinstance(r, list) else [])
        for tf, r in zip(deps.timeframes, fetched)
    }

    context = build_context(
        symbol=instrument, deps=deps, candle_view=candle_view,
        news_context=news_context, current_sessions=current_sessions,
    )
    if context is None:
        return

    try:
        result = await strategy.analyze(context)
    except Exception:
        log.error(f"[runner] {strategy.id} on {instrument}:\n{traceback.format_exc()}")
        return

    valid_signals = signal_validator.validate(result, instrument)
    if not valid_signals:
        log.info(f"[runner] {strategy.id}/{instrument}: analyze() ran — no valid signal (rr/confidence/dedup filter)")
        return

    htf         = max(deps.timeframes, key=to_minutes)
    pri_candles = candle_view.get(htf, [])
    loop        = asyncio.get_running_loop()

    for signal in valid_signals:
        # Preserve strategy-set strategy_id (e.g. _watch / _setup suffixes)
        if not signal.strategy_id:
            signal.strategy_id = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        # Setup alerts: Telegram only — no DB save, no dedup registration
        if signal.alert_only:
            await event_bus.emit(event_bus.SIGNAL_ALERT, signal)
            log.info(
                f"[runner] SETUP ALERT — {instrument} "
                f"{signal.direction.value.upper()} strategy={signal.strategy_id}"
            )
            continue

        # Risk filters — only run when strategy opted in
        if strategy.requires_volatility:
            if not pri_candles:
                signal_validator.release(signal.symbol, signal.direction.value)
                continue
            if not volatility_filter.check(signal, pri_candles):
                signal_validator.release(signal.symbol, signal.direction.value)
                continue
            if not sl_validator.check(signal, pri_candles):
                signal_validator.release(signal.symbol, signal.direction.value)
                continue
        if strategy.requires_spread and context.spread is not None:
            if not spread_filter.check(signal, context.spread):
                signal_validator.release(signal.symbol, signal.direction.value)
                continue

        if ai_validator.is_available():
            if not await ai_validator.validate_signal(signal, pri_candles):
                log.info(f"[runner] {instrument} rejected by AI validator")
                signal_validator.release(signal.symbol, signal.direction.value)
                continue

        # Release the dedup reservation on a hard save failure — else this
        # symbol+direction stays locked for the process lifetime with nothing saved.
        try:
            await loop.run_in_executor(None, signal_repo.save, signal)
        except Exception as exc:
            log.error(f"[runner] {instrument} save failed ({exc}) — releasing dedup reservation")
            signal_validator.release(signal.symbol, signal.direction.value)
            continue
        signal_validator.register_confirmed(signal)
        await event_bus.emit(event_bus.SIGNAL_CONFIRMED, signal)
        log.info(
            f"[runner] CONFIRMED — {instrument} "
            f"{signal.direction.value.upper()} "
            f"conf={signal.confidence:.0%} strategy={strategy.id}"
        )
