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

DETECTION REPLAYS EVERY M1 BAR — it does not sample the newest one. Until 2026-07-26 each poll read
exactly ONE bar (`fetch_candles(symbol, "M1", 1)`) while the poll runs every 30s. Any bar that
passed between two polls — a restart, a network stall, an event-loop delay, a slow DB call — was
never examined, and an entry / TP / SL touch inside it was never recorded. The worst case was
silent: a trade that filled and ran showed as never filled, expired at 24h and was logged as
"cancelled, never a loss". Wins and losses both vanished, on BOTH strategies.

Each poll now walks every bar since the signal's own clock — `triggered_at` if the entry has filled,
else `created_at`. Both are columns on the row, so there is NO "last bar seen" state to keep, lose
on restart, or let drift. Every decision is "the FIRST bar where X happened", which is idempotent:
re-reading the same bars each poll always yields the same answer, and an outage of any length heals
itself on the next successful poll.

It costs no extra API calls. `vix1.candle_counts[M1]` is max((LOOKBACK+2)*60, WATCH_M1+30) = 1530
bars (~25.5h), which the scanner already fetches and caches every 60s and which exceeds the 24h
expiry — so a full-life replay is always a cache hit.

Bar HIGH/LOW is used throughout, never the close: an intrabar spike through a level is a real touch.
Also expires stale signals — and RELEASES their dedup reservations, without which an expired signal
muted its strategy for that symbol+direction until the process restarted.
"""

import asyncio
import logging
from datetime import datetime, timezone

from core.types import Direction, SignalStatus, TF
from core import event_bus
from storage import signal_repo
from strategies.trade_management import TradeState, update as update_trade
from validation.signal_validator import release

log = logging.getLogger(__name__)

_WINDOW_FALLBACK = 1530   # used only if no strategy is registered (tests, cold boot)


def _epoch(dt) -> float:
    """A DB timestamp as unix seconds, treating a NAIVE value as UTC.

    `trading_signals` declares its DateTime columns without `timezone=True`, so Postgres returns
    naive datetimes even though every writer stores UTC. Calling `.timestamp()` on a naive datetime
    makes Python interpret it as LOCAL time — which silently shifts the replay window by the host's
    UTC offset and is invisible on a UTC host. Pin the tz explicitly instead of relying on TZ=UTC.
    """
    if dt is None:
        return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


async def check_all() -> None:
    """Iterate all active signals and update their status.

    EVERY POLL REPORTS WHAT IT DID. Until 2026-07-27 this function ran `gather(...,
    return_exceptions=True)` and THREW THE RESULTS AWAY: any exception inside `_check_signal` was
    captured by gather and never logged, never raised, never counted. Production ran 158 consecutive
    polls that looked perfectly healthy while every signal sat unexamined with `triggered_at` NULL —
    the monitor was doing nothing and saying nothing, and that combination is undiagnosable after the
    fact. Exceptions are now logged per row (with the row's identity, so it is actionable), and each
    poll emits one INFO summary line. A quiet monitor must be quiet because there was nothing to do,
    never because it failed silently.
    """
    try:
        loop = asyncio.get_running_loop()
        active = await loop.run_in_executor(None, signal_repo.get_active)
        tally: dict[str, int] = {}
        if active:
            results = await asyncio.gather(*[_check_signal(row) for row in active],
                                           return_exceptions=True)
            for row, res in zip(active, results):
                if isinstance(res, BaseException):
                    # The bug this file shipped with: this branch used to not exist.
                    tally["error"] = tally.get("error", 0) + 1
                    log.error(f"[signal_monitor] {row.symbol} {row.strategy} id={row.id} raised "
                              f"{type(res).__name__}: {res}", exc_info=res)
                else:
                    tally[res or "watching"] = tally.get(res or "watching", 0) + 1
        freed = await loop.run_in_executor(None, signal_repo.expire_stale, 24)
        for sym, direction, strat in freed:
            release(sym, direction, strat)
            log.info(f"[signal_monitor] {sym} {strat} {direction} expired at 24h — reservation freed")

        # THE TRADE TRACKER — his REAL open positions, not the signals. Runs on this tick because a
        # position's R has to be watched at the same cadence as a signal's TP/SL, and because a
        # second scheduler entry for the same 30s job would be two things to keep in step. It never
        # raises (its own try/except) so it cannot cost him TP/SL watching, which matters more.
        from monitor import position_tracker
        from notifications.dispatcher import _send_private
        await position_tracker.check_all(_send_private)

        log.info(f"[signal_monitor] poll: {len(active or [])} active "
                 f"({', '.join(f'{k}={v}' for k, v in sorted(tally.items())) or 'none'})"
                 f"{f', {len(freed)} expired' if freed else ''}")

    except Exception as exc:
        log.error(f"[signal_monitor] check_all error: {exc}", exc_info=True)


async def _check_signal(row) -> str:
    """Judge one signal against every bar since its own clock. Returns a one-word outcome for the
    poll summary — never None, so a row that did nothing is distinguishable from a row that failed."""
    bars = await _get_window(row.symbol)
    if not bars:
        # NOT a normal case: no bars means the fetch failed or returned empty, and the signal was
        # not judged at all this poll. It used to return silently and look identical to "nothing
        # happened", which is how a dead monitor stayed invisible.
        log.warning(f"[signal_monitor] {row.symbol} id={row.id} NOT JUDGED — no M1 bars available")
        return "no-bars"

    # VIX.1 TRADE MANAGEMENT (advice only — emits DM alerts, moves nothing). Once per poll, on the
    # same window. Isolated in its own try: management is a convenience, and a fault in it must
    # never stop the monitor from closing a real position below.
    if (row.strategy or "") == "vix1" and row.triggered_at is not None:
        try:
            from monitor.vix1_alerts import check as _manage
            await _manage(row, bars)
        except Exception as exc:
            log.warning(f"[signal_monitor] vix1 management alert failed for {row.symbol}: {exc}")

    # THE REPLAY WINDOW — every bar since this signal's own clock. See the module docstring for why
    # this is stateless and why it costs nothing.
    start  = _epoch(row.triggered_at) if row.triggered_at is not None else _epoch(row.created_at)
    window = [c for c in bars if c.time >= start]
    if not window:
        return "no-new-bars"                     # nothing new since the last poll — the normal case
    if bars and bars[0].time > start + 60:
        # The cached series does not reach back to where this signal begins. Judge what we have and
        # say so: a bounded, visible gap beats a silent one. Only possible if the scanner's M1 count
        # drops below the 24h expiry, which _window_size() exists to prevent.
        log.warning(f"[signal_monitor] {row.symbol} replay window starts {int(bars[0].time - start)}s "
                    f"AFTER the signal — bars before that were never judged")

    entry = float(row.entry_price) if row.entry_price else None
    sl    = float(row.stop_loss)   if row.stop_loss   else None
    tp    = float(row.take_profit) if row.take_profit else None
    buy   = row.type == Direction.BUY.value
    loop  = asyncio.get_running_loop()

    # HOW AN ENTRY FILLS DEPENDS ON THE ORDER TYPE.
    #   STOP entry (VIX.1 — always; vix1_entry rejects any entry already on the near side of price,
    #     so it is a stop by construction): fills the moment price REACHES the level from the far
    #     side, and on a GAP it fills at the open, worse. ONE-SIDED — hi >= entry BUY, lo <= entry SELL.
    #   LIMIT entry (BX — price comes back down/up to a zone): the bar must CONTAIN the level,
    #     because a one-sided test is trivially true for a limit resting the other side of market
    #     and would read every BX signal as instantly filled.
    stop_entry = (row.strategy or "").startswith("vix1")
    pending    = row.triggered_at is None
    filled     = False                            # set when THIS poll fills the entry (for the tally)

    # BREAKEVEN (BX only) — at 1R the stop moves to entry, so a trade that ran our way and came back
    # is a SCRATCH, not a loss ("breakeven is not a loss"). strategies.trade_management implements it
    # and had never been called by anything until now. TRAILING IS OFF: `allow_trailing` defaults to
    # False, so the stop moves exactly once, at 1R, and never again. VIX.1 manages its own exits.
    be = None
    if (row.strategy or "").startswith("bx_sd") and None not in (entry, sl, tp):
        be = TradeState(symbol=row.symbol, direction="BUY" if buy else "SELL", entry=entry,
                        initial_sl=sl, tp=tp, current_sl=sl, phase="initial")

    for bar in window:                           # chronological — the FIRST bar to do a thing wins
        hi, lo = bar.high, bar.low               # HIGH/LOW, never the close: an intrabar spike counts

        if pending and entry is not None:
            touched = ((hi >= entry) if buy else (lo <= entry)) if stop_entry \
                      else (lo <= entry <= hi)
            if not touched:
                # Entry untouched on this bar. If the SL side went first the order would never have
                # filled — the setup reversed before entry. CANCEL (expired), never a loss: whoever
                # followed the card was never in a trade.
                if sl is not None and ((lo <= sl) if buy else (hi >= sl)):
                    await loop.run_in_executor(
                        None, signal_repo.update_status, row.id,
                        SignalStatus.EXPIRED, "invalidated_at",
                        datetime.fromtimestamp(bar.time, timezone.utc),
                    )
                    release(row.symbol, row.type, row.strategy)
                    await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
                    log.info(f"[signal_monitor] {row.symbol} cancelled — SL side touched before the "
                             f"entry ever filled (H={hi} L={lo})")
                    return "cancelled"
                continue
            # Filled. Stamp the BAR's time, not now(): triggered_at anchors the next replay, so a
            # now() stamp would skip every bar between the real fill and the poll that saw it.
            await loop.run_in_executor(
                None, signal_repo.mark_triggered, row.id,
                datetime.fromtimestamp(bar.time, timezone.utc),
            )
            pending = False
            filled = True
            log.info(f"[signal_monitor] {row.symbol} entry TRIGGERED (H={hi} L={lo})")
            # fall through — the SAME bar can also take out TP or SL after filling

        # BREAKEVEN — advance the state with THIS bar. `be` was built before the loop, so the 1R
        # step persists across bars: reach 1R on one bar, come back to entry ten bars later, and it
        # still closes as a scratch. Building it inside the loop would reset the phase every bar and
        # the stop would never actually move.
        if be is not None and not pending:
            for px in ((lo, hi) if buy else (hi, lo)):   # ADVERSE extreme first
                update_trade(be, px)
            sl = be.current_sl                            # entry price once BE has armed

        hit_tp = bool(tp is not None and ((hi >= tp) if buy else (lo <= tp)))
        hit_sl = bool(sl is not None and ((lo <= sl) if buy else (hi >= sl)))
        # Both inside one M1 bar — the intrabar order is unknown, so assume the stop went first
        # (conservative: never over-report a win).
        if hit_tp and hit_sl:
            hit_tp = False
        if hit_tp or hit_sl:
            new_status = SignalStatus.EXECUTED if hit_tp else SignalStatus.INVALIDATED
            ts_field   = "executed_at" if hit_tp else "invalidated_at"
            # the BAR's time, not now(): replay can spot a close minutes after it happened, and
            # the outcome card and the trade record must both say when it actually closed.
            await loop.run_in_executor(
                None, signal_repo.update_status, row.id, new_status, ts_field,
                datetime.fromtimestamp(bar.time, timezone.utc),
            )
            release(row.symbol, row.type, row.strategy)   # free THIS strategy's key only
            await event_bus.emit(event_bus.SIGNAL_CLOSED, row.id)
            log.info(f"[signal_monitor] {row.symbol} → {new_status.value} (H={hi} L={lo})")
            return f"closed:{new_status.value}"

    return "triggered" if filled else "watching"


def _window_size() -> int:
    """How many M1 bars to replay — DERIVED from what the strategies already ask the scanner for,
    never a literal. Asking for exactly that count guarantees a TTL-cache hit (the scanner has
    already fetched it), so the replay adds no API load. Asking for LESS would leave a blind spot
    at the far end of a signal's 24h life; asking for MORE would force a second fetch per symbol
    per TTL and burn quota for nothing."""
    try:
        from core import strategy_registry
        counts = [s.candle_counts.get(TF.M1, 0) for s in strategy_registry.get_enabled()
                  if getattr(s, "candle_counts", None)]
        if counts:
            return max(counts)
    except Exception as exc:
        # WARNING, not DEBUG: falling back to the literal means the replay window may no longer match
        # what the strategies ask for, which silently reintroduces the blind spot this module exists
        # to close. DEBUG is invisible at production log level — that is how it stayed hidden.
        log.warning(f"[signal_monitor] could not derive window size ({exc}) — "
                    f"falling back to {_WINDOW_FALLBACK}")
    return _WINDOW_FALLBACK


async def _get_window(symbol: str, count: int | None = None):
    """The M1 series the replay walks — TTL cache when the scanner ran recently, else a fresh
    cTrader fetch. Bars come back oldest-first.

    A failure here means NO SIGNAL ON THIS SYMBOL IS JUDGED this poll, so it is a WARNING, never
    DEBUG. Logged at DEBUG until 2026-07-27, which is why a monitor that judged nothing for hours
    produced no evidence of it.
    """
    from data.candle_fetcher import fetch_candles
    try:
        bars = await fetch_candles(symbol, "M1", count or _window_size()) or []
        if not bars:
            log.warning(f"[signal_monitor] {symbol}: M1 fetch returned NO bars — nothing judged")
        return bars
    except Exception as exc:
        log.warning(f"[signal_monitor] window fetch failed for {symbol}: "
                    f"{type(exc).__name__}: {exc} — nothing judged this poll")
        return []
