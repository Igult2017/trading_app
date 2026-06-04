"""
Signal lifecycle monitor — runs every 30s.
Checks TP/SL hit on active signals and expires stale ones.
Current price comes from yfinance fast_info (low-latency single call).
"""

import asyncio
import logging
from config.instruments import SYMBOL_TO_YF
from core.types import Direction, SignalStatus
from core import event_bus
from storage import signal_repo

log = logging.getLogger(__name__)


async def check_all() -> None:
    """Iterate all active signals and update their status."""
    try:
        active = signal_repo.get_active()
        if not active:
            return

        await asyncio.gather(*[_check_signal(row) for row in active],
                             return_exceptions=True)
        signal_repo.expire_stale(older_than_hours=24)

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
        signal_repo.update_status(row.id, new_status, ts_field)
        # Release from in-memory duplicate guard so instrument can trade again
        from validation.signal_validator import release
        release(row.symbol, row.type)
        await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
        log.info(f"[signal_monitor] {row.symbol} -> {new_status.value} (price={price})")


async def _get_price(symbol: str) -> float | None:
    """Fast single-call yfinance price fetch, run in executor."""
    loop = asyncio.get_event_loop()
    yf_ticker = SYMBOL_TO_YF.get(symbol)
    if not yf_ticker:
        return None

    def _sync():
        import yfinance as yf
        try:
            return yf.Ticker(yf_ticker).fast_info.last_price
        except Exception:
            return None

    return await loop.run_in_executor(None, _sync)
