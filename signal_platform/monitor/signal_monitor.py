"""
Signal lifecycle monitor — runs every 30s.

A signal from a stop-entry strategy is an ORDER, not a position: nothing is won or lost until
price actually reaches the entry. So each active signal is watched in two phases, split by
`triggered_at`:

  PENDING   (triggered_at NULL) — watch the ENTRY level. Price touches it → mark triggered (the
            trade is live from here). Price touches the SL side FIRST → the stop order would never
            have filled: the signal is CANCELLED (status EXPIRED, released, closed-card sent) —
            never scored as a loss. Judging TP/SL from birth used to record "losses" for trades
            that never opened and "wins" that never filled, which is systematically wrong for a
            strategy whose entry is a stop order (VIX.1's always is).
  TRIGGERED — watch TP/SL exactly as before.

TP/SL/entry detection uses the most recent M1 bar's HIGH/LOW (so an intrabar spike through a
level is caught, not just the close); TTL cache hit when the scanner ran recently, else a fresh
cTrader fetch. Also expires stale signals — and RELEASES their dedup reservations, without which
an expired signal muted its strategy for that symbol+direction until the process restarted.
"""

import asyncio
import logging

from core.types import Direction, SignalStatus
from core import event_bus
from storage import signal_repo
from validation.signal_validator import release

log = logging.getLogger(__name__)


async def check_all() -> None:
    """Iterate all active signals and update their status."""
    try:
        loop = asyncio.get_running_loop()
        active = await loop.run_in_executor(None, signal_repo.get_active)
        if active:
            await asyncio.gather(*[_check_signal(row) for row in active],
                                 return_exceptions=True)
        freed = await loop.run_in_executor(None, signal_repo.expire_stale, 24)
        for sym, direction, strat in freed:
            release(sym, direction, strat)

    except Exception as exc:
        log.error(f"[signal_monitor] check_all error: {exc}")


async def _check_signal(row) -> None:
    bar = await _get_bar(row.symbol)
    if bar is None:
        return

    # Use the bar's HIGH/LOW, not just the close: a spike/wick that pierces a level
    # intrabar and closes back inside would otherwise be missed entirely.
    hi, lo = bar.high, bar.low
    buy    = row.type == Direction.BUY.value
    loop   = asyncio.get_running_loop()

    # PENDING phase — the entry is a stop ORDER that has not filled yet.
    entry = float(row.entry_price) if row.entry_price else None
    if entry is not None and row.triggered_at is None:
        if not ((hi >= entry) if buy else (lo <= entry)):
            # Entry untouched. If the SL side was taken out first, the order would simply never
            # fill — the setup reversed before entry. CANCEL (expired), never a loss: the trader
            # following the card was never in a trade.
            sl = float(row.stop_loss) if row.stop_loss else None
            if sl is not None and ((lo <= sl) if buy else (hi >= sl)):
                await loop.run_in_executor(
                    None, signal_repo.update_status, row.id,
                    SignalStatus.EXPIRED, "invalidated_at",
                )
                release(row.symbol, row.type, row.strategy)
                await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
                log.info(f"[signal_monitor] {row.symbol} cancelled — SL side touched "
                         f"before the entry ever filled (H={hi} L={lo})")
            return
        # Entry touched THIS bar — the trade is live. Fall through: the same bar can
        # also take out TP or SL after filling.
        await loop.run_in_executor(None, signal_repo.mark_triggered, row.id)
        log.info(f"[signal_monitor] {row.symbol} entry TRIGGERED (H={hi} L={lo})")

    hit_tp = False
    hit_sl = False
    if buy:
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
        await loop.run_in_executor(
            None, signal_repo.update_status, row.id, new_status, ts_field
        )
        release(row.symbol, row.type, row.strategy)   # free THIS strategy's key only
        await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
        log.info(f"[signal_monitor] {row.symbol} → {new_status.value} (H={hi} L={lo})")


async def _get_bar(symbol: str):
    """
    Latest M1 bar for a symbol — from the TTL cache, or a fresh cTrader fetch if
    cache is cold. Its high/low capture intrabar spikes through the levels
    (still bounded by ~1 bar / ~60s of latency for the touch to register).
    """
    from data.candle_fetcher import fetch_candles
    try:
        bars = await fetch_candles(symbol, "M1", 1)
        return bars[-1] if bars else None
    except Exception as exc:
        log.debug(f"[signal_monitor] bar fetch failed for {symbol}: {exc}")
        return None
