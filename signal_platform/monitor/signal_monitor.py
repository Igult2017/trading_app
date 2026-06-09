"""
Signal lifecycle monitor — runs every 30s.
Checks TP/SL hit on active signals and expires stale ones.
Current price from the most recent M1 bar (TTL cache hit when scanner ran
recently; falls through to a fresh cTrader fetch on a cold check).
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
    price = await _get_price(row.symbol)
    if price is None:
        return

    hit_tp = False
    hit_sl = False

    if row.type == Direction.BUY.value:
        if row.take_profit and price >= float(row.take_profit):
            hit_tp = True
        elif row.stop_loss and price <= float(row.stop_loss):
            hit_sl = True
    else:  # SELL
        if row.take_profit and price <= float(row.take_profit):
            hit_tp = True
        elif row.stop_loss and price >= float(row.stop_loss):
            hit_sl = True

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
        log.info(f"[signal_monitor] {row.symbol} → {new_status.value} (price={price})")


async def _get_price(symbol: str) -> float | None:
    """
    Latest price for a symbol — M1 close from the TTL cache or a fresh
    cTrader fetch if cache is cold. Accurate to within one M1 bar (~60s).
    """
    from data.candle_fetcher import fetch_candles
    try:
        bars = await fetch_candles(symbol, "M1", 1)
        return bars[-1].close if bars else None
    except Exception as exc:
        log.debug(f"[signal_monitor] price fetch failed for {symbol}: {exc}")
        return None
