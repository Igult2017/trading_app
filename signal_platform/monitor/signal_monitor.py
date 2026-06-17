"""
Signal lifecycle monitor — runs every 30s.
Checks TP/SL hit on active signals and expires stale ones.
TP/SL detection uses the most recent M1 bar's HIGH/LOW (so an intrabar spike
through a level is caught, not just the close); TTL cache hit when the scanner
ran recently, else a fresh cTrader fetch.
"""

import asyncio
import logging

from core.types import Direction, SignalStatus
from core import event_bus
from storage import signal_repo

log = logging.getLogger(__name__)


async def check_all() -> None:
    """Iterate all active signals and update their status."""
    try:
        loop = asyncio.get_running_loop()
        active = await loop.run_in_executor(None, signal_repo.get_active)
        if not active:
            return

        await asyncio.gather(*[_check_signal(row) for row in active],
                             return_exceptions=True)
        await loop.run_in_executor(None, signal_repo.expire_stale, 24)

    except Exception as exc:
        log.error(f"[signal_monitor] check_all error: {exc}")


async def _check_signal(row) -> None:
    bar = await _get_bar(row.symbol)
    if bar is None:
        return

    # Use the bar's HIGH/LOW, not just the close: a spike/wick that pierces TP or
    # SL intrabar and closes back inside would otherwise be missed entirely.
    hi, lo = bar.high, bar.low
    hit_tp = False
    hit_sl = False

    if row.type == Direction.BUY.value:
        if row.take_profit and hi >= float(row.take_profit):
            hit_tp = True
        if row.stop_loss and lo <= float(row.stop_loss):
            hit_sl = True
    else:  # SELL
        if row.take_profit and lo <= float(row.take_profit):
            hit_tp = True
        if row.stop_loss and hi >= float(row.stop_loss):
            hit_sl = True

    # Both levels touched within one M1 bar — the intrabar order is unknown, so
    # assume the stop hit first (conservative: never over-report a win).
    if hit_tp and hit_sl:
        hit_tp = False

    if hit_tp or hit_sl:
        new_status = SignalStatus.EXECUTED if hit_tp else SignalStatus.INVALIDATED
        ts_field   = "executed_at" if hit_tp else "invalidated_at"
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, signal_repo.update_status, row.id, new_status, ts_field
        )
        from validation.signal_validator import release
        release(row.symbol, row.type)
        await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
        log.info(f"[signal_monitor] {row.symbol} → {new_status.value} (H={hi} L={lo})")


async def _get_bar(symbol: str):
    """
    Latest completed M1 bar for a symbol — from the TTL cache, or a fresh cTrader
    fetch if cache is cold. Its high/low capture intrabar spikes through TP/SL
    (still bounded by ~1 bar / ~60s of latency for the touch to register).
    """
    from data.candle_fetcher import fetch_candles
    try:
        bars = await fetch_candles(symbol, "M1", 1)
        return bars[-1] if bars else None
    except Exception as exc:
        log.debug(f"[signal_monitor] bar fetch failed for {symbol}: {exc}")
        return None
