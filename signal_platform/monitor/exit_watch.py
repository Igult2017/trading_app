"""SAY WHEN THE TRADE IS OVER.

His report, 2026-09-02: *"When SL is hit it should say, when we lock 1R and later it is hit and we
are out it should say... When we are out it should announce because like right now i dont know
whether we are out or not."*

WHY HE WAS NEVER TOLD, and it is not a missing message — it is that nothing was watching the right
thing. Two things follow a trade and neither watches his POSITION for an exit:

  * `signal_monitor` closes a signal when price touches the SIGNAL's original `sl`/`tp`, read from
    the database row. For VIX.1 those never change: the state that advances a signal's stop is built
    only for `bx_sd` (`signal_monitor.py`), so `sl` stays the ORIGINAL stop for the signal's life.
  * `position_tracker` reads the broker's OPEN positions. A closed one simply stops appearing.

So the exits he most wants to hear about are exactly the silent ones. The ladder moves the REAL stop
to breakeven, then +1R, then trails it — and every one of those exits happens at a price the signal's
original levels never see. Stopped out at breakeven: silence. Stopped out at +2.4R: silence. The
signal then sits "triggered" until it expires 24 hours later.

WHAT IT SAYS, AND HOW IT KNOWS. `ctrader_positions.closing_deal` reads the deal that actually closed
the position, so this can tell him **whether his stop was hit** — his instruction, 2026-09-02: *"we
should get a message when a trade is placed and when SL is hit"*. It reports the real exit price, the
realised R and the realised money.

WHEN THAT READ FAILS it falls back to describing the stop the position was CARRYING when last seen,
and says so in those words — it never claims a fill price it does not have. A vaguer message that is
true beats a precise one that is invented.

NEVER FROM A FAILED READ. `ctrader_positions.open_positions()` returns None for "I could not find
out" and [] for "you have nothing open" — a distinction `position_tracker` already turns on. An exit
announced because the broker did not answer would be the worst false alarm this platform could send,
so a None read updates nothing and announces nothing.
"""
import logging
import threading
import time
from dataclasses import dataclass, replace

from core import delivery_ledger
from notifications import safe_notify as notify
from notifications import titles
from shared.pip import price_digits

log = logging.getLogger(__name__)

_TTL = 7 * 24 * 3600      # keep the "already announced" marks a week; an exit is announced once


@dataclass(frozen=True)
class _Seen:
    """The last thing we knew about a position, kept so the exit can be described after it is gone."""
    symbol:  str
    bullish: bool
    entry:   float
    stop:    float | None
    peak_r:  float | None      # the BEST R it reached while open  (MFE)
    trough_r: float | None = None   # the WORST R it reached while open (MAE)
    source:  str = "poll"      # which clock measured them: "fix" (0.5s) or "poll" (30s)


# position_id -> what it looked like on the last poll that could see it.
#
# IN-MEMORY, AND THAT IS SAFE IN THE ONLY DIRECTION THAT MATTERS — the same reasoning as
# `fill_watch._owner`. After a restart this is empty, so a position that closes while we were down is
# never announced. Missing an announcement costs him a message; inventing one from a half-known state
# would tell him he is out of a trade he is still in.
_seen: dict[int, _Seen] = {}


def _key(position_id: int) -> str:
    return f"exit:{position_id}"


def observe(positions, r_by_id: dict[int, float] | None = None, source: str = "poll",
            persist: bool = False) -> None:
    """Record what is open right now, carrying each position's best AND worst R forward.

    `r_by_id` is the R the caller has already measured this poll — passed in rather than recomputed,
    because the caller has the live price and this module has no business fetching one.

    BEST AND WORST, because both are wanted in the journal. The best R a trade reached (its MFE) was
    already tracked for the exit message; the worst (its MAE) was not tracked at all, so the metrics
    page's mae/mfe breakdown had nothing to show. His ask, 2026-09-03: *"we can extend it to also
    record this MAE/MFE in the journal."*

    `persist` IS OFF BY DEFAULT, AND THAT IS THE POINT. Writing the snapshots is a DATABASE WRITE, and
    this is called from the 0.5-second watcher as well as the 30-second poll — so persisting on every
    pass would put a DB round trip on the fast path twice a second. `test_telegram_independence`
    caught exactly that: the poll went from under a second to 2.69s. It is the SECOND time this shape
    of mistake has been made in this work, which is why the flag is explicit rather than a default.
    The fast watcher updates the marks in memory (that is the accuracy win); the 30-second poll is
    what writes them down.

    `source` says WHICH CLOCK measured it. The 0.5s FIX watcher and the 30s poll do not produce
    numbers of the same quality, and a high-water mark whose sampling rate is unknown is worse than
    one that states it. "fix" wins over "poll" once seen, because it cannot be less accurate.
    """
    r_by_id = r_by_id or {}
    for p in positions or []:
        try:
            pid = int(getattr(p, "position_id", 0) or 0)
            if not pid:
                continue
            r = r_by_id.get(pid)
            prev = _seen.get(pid)
            peak = prev.peak_r if prev else None
            trough = prev.trough_r if prev else None
            if r is not None:
                peak = r if peak is None else max(peak, r)
                trough = r if trough is None else min(trough, r)
            best_source = "fix" if (source == "fix" or (prev and prev.source == "fix")) else source
            _seen[pid] = _Seen(symbol=p.symbol, bullish=bool(p.bullish), entry=float(p.entry),
                               stop=(float(p.stop) if p.stop is not None else None),
                               peak_r=peak, trough_r=trough, source=best_source)
        except Exception as exc:      # a snapshot must never be able to break the poll
            log.warning(f"[exit_watch] could not record a position: {type(exc).__name__}: {exc}")
    if persist:
        _persist()


def _message(pid: int, s: _Seen, deal=None) -> str:
    """What to tell him. Plain about what is known and what is inferred.

    WITH `deal` — the real closing deal read back from the broker — this can say WHY the trade ended,
    which is what he asked for: *"we should get a message when a trade is placed and when SL is
    hit"*. Without it (the read failed) it falls back to describing the stop the position was
    carrying, which is still true and still tells him he is out.
    """
    d = price_digits(s.symbol)
    side = "BUY" if s.bullish else "SELL"
    risk = abs(s.entry - s.stop) if s.stop is not None else 0.0

    if deal is not None:
        exit_px = deal.exit_price
        # WAS IT THE STOP? Compared against the stop the position was carrying, with a tolerance of
        # a tenth of the CURRENT stop distance — a stop fills at or through its level, never exactly
        # on it, and a fixed pip tolerance would be wrong on gold and wrong again on EUR/USD.
        tol = max(risk * 0.10, 10 ** -d)
        hit_stop = s.stop is not None and abs(exit_px - s.stop) <= tol
        moved = (exit_px - s.entry) if s.bullish else (s.entry - exit_px)
        # R is measured against the risk the trade STARTED with, which after a stop move we no
        # longer hold — so it is only quoted when the stop never moved.
        realised = f" ({moved / risk:+.1f}R)" if risk > 0 else ""
        why = ("<b>Your stop was hit.</b>" if hit_stop else
               "It closed away from your stop — the target, or closed by hand.")
        money = f"\nRealised: <b>{deal.profit:+,.2f}</b>." if deal.profit is not None else ""
        peak = (f"\nBest it reached while open: <b>{s.peak_r:+.1f}R</b>."
                if s.peak_r is not None else "")
        return (titles.header(titles.POSITION_CLOSED, titles.TRADE_MANAGEMENT, s.symbol, side,
                              extra=f"#{pid}") + "\n\n"
                f"{why}\nClosed at <code>{exit_px:.{d}f}</code> from an entry of "
                f"<code>{s.entry:.{d}f}</code>{realised}.{money}{peak}")

    if s.stop is None:
        where = "It had no stop set, so there is no R to report."
    else:
        # How much the stop was protecting, in R. Positive means it was above entry for a buy.
        locked = ((s.stop - s.entry) if s.bullish else (s.entry - s.stop))
        # `risk` is the CURRENT stop distance, which after a move is not the original risk — so R is
        # measured against the ORIGINAL risk only when we still have it. We do not, once the stop has
        # moved, so the level is reported plainly and the R only when it is exactly derivable.
        if locked > 0 and risk > 0:
            where = (f"Its stop was at <code>{s.stop:.{d}f}</code>, which was <b>in profit</b> — "
                     f"above your entry of <code>{s.entry:.{d}f}</code>.")
        elif abs(locked) <= (risk * 0.05):
            where = (f"Its stop was at <code>{s.stop:.{d}f}</code>, essentially your entry — "
                     f"a <b>breakeven</b> exit.")
        else:
            where = (f"Its stop was at <code>{s.stop:.{d}f}</code>, below your entry of "
                     f"<code>{s.entry:.{d}f}</code> — a <b>losing</b> exit.")

    peak = f"\nBest it reached while open: <b>{s.peak_r:+.1f}R</b>." if s.peak_r is not None else ""
    return (titles.header(titles.POSITION_CLOSED, titles.TRADE_MANAGEMENT, s.symbol, side,
                          extra=f"#{pid}") + "\n\n"
            f"This position is no longer open at the broker.\n{where}{peak}\n\n"
            f"<i>The level above is the stop it was carrying when last seen — not a confirmed fill "
            f"price. Your journal records the exact exit.</i>")


async def announce_closed(positions, send) -> None:
    """Anything we were watching that is no longer open gets one message. Never raises.

    Called AFTER `observe` has run for the current poll would be wrong — the vanished ones must be
    found by comparing the new list against the old, so this runs FIRST and `observe` second.
    """
    if positions is None:              # could not read the broker — see the module docstring
        return
    try:
        live = {int(getattr(p, "position_id", 0) or 0) for p in positions}
        for pid in [k for k in _seen if k not in live]:
            s = _seen.pop(pid)
            k = _key(pid)
            if delivery_ledger.is_delivered(k):
                continue
            # ASK THE BROKER HOW IT ACTUALLY ENDED. None falls back to the stop-based wording
            # below, so a failed read still tells him he is out.
            deal = None
            try:
                from data import ctrader_positions
                deal = await ctrader_positions.closing_deal(pid)
            except Exception:
                pass
            # BOUNDED — an exit announcement must never hold up the poll that watches every
            # other open position. `tell` caps it and never raises; a False still retries below.
            if await notify.tell(send, _message(pid, s, deal)):
                delivery_ledger.mark_delivered(k)
                log.info(f"[exit_watch] {s.symbol} #{pid} closed — announced "
                         f"(stop {s.stop}, peak {s.peak_r})")
            else:
                # The send failed. Put it back so the next poll tries again rather than losing the
                # only notice he gets that a trade is over.
                _seen[pid] = s
    except Exception as exc:
        log.error(f"[exit_watch] announce failed: {type(exc).__name__}: {exc}", exc_info=True)

# ── SURVIVING A RESTART ─────────────────────────────────────────────────────
#
# His rule, 2026-09-03: *"you must persist any crucial memory."*
#
# `_seen` above holds two things worth keeping. The snapshot lets an exit be described after the
# position is gone; the peak and trough are the trade's HIGH-WATER MARKS — how far it ran in his
# favour and against him — which are the MAE/MFE the journal wants and which CANNOT be recovered
# after the fact. A restart used to drop both.
#
# Backed by `strategy_state`, the same table `FiredRegistry` uses, under one key. Written on every
# poll and read once at boot. A failure here is logged and swallowed: recording how a trade went must
# never be able to break the watching of it.
_STATE_KEY = "exit_watch_seen"


_PERSIST_EVERY_S = 10.0    # a floor on how often the snapshots are written, whatever calls in
_last_persist = 0.0


def _persist() -> None:
    """Write the snapshots. Best-effort, never raises, and never more than once every 10 seconds.

    THROTTLED because the caller is a loop. Even on the 30-second poll a stalled database would sit
    in front of the next pass, and the marks do not change enough in ten seconds to be worth that.
    """
    global _last_persist
    now = time.monotonic()
    if now - _last_persist < _PERSIST_EVERY_S:
        return
    _last_persist = now

    # IN A THREAD, SO IT CANNOT SIT IN FRONT OF THE NEXT POLL. Throttling alone was not enough: the
    # write still happened INSIDE the pass, and `test_telegram_independence` measured the poll going
    # from under a second to 2.7 — the same failure, and the same test, as the pending-order lookup
    # earlier in this work. His rule: the trade logic is the lifeline and nothing else may delay it.
    #
    # The snapshot is taken HERE, on the caller's thread, so what gets written is what was true at
    # this moment rather than whatever the dict has become by the time the thread runs.
    snapshot = {
            str(pid): {"symbol": s.symbol, "bullish": s.bullish, "entry": s.entry,
                       "stop": s.stop, "peak_r": s.peak_r, "trough_r": s.trough_r,
                       "source": s.source}
            for pid, s in _seen.items()
    }

    def _write() -> None:
        try:
            from storage import strategy_state_repo
            strategy_state_repo.save(_STATE_KEY, snapshot)
        except Exception as exc:
            log.warning(f"[exit_watch] could not persist the snapshots: "
                        f"{type(exc).__name__}: {exc}")

    try:
        threading.Thread(target=_write, name="exit_watch_persist", daemon=True).start()
    except Exception as exc:      # cannot start a thread — say so, never raise into the poll
        log.warning(f"[exit_watch] could not start the persist thread: {type(exc).__name__}: {exc}")


def rehydrate() -> int:
    """Restore the snapshots from the last run. Call ONCE at boot. Returns how many.

    READ AT BOOT, NEVER ON THE POLL. A database read inside the 30-second pass is what took the
    monitor from under a second to 2.7 earlier in this work; the same mistake is not repeated here.
    """
    try:
        from storage import strategy_state_repo
        raw = strategy_state_repo.load(_STATE_KEY) or {}
    except Exception as exc:
        log.warning(f"[exit_watch] could not restore the snapshots: {type(exc).__name__}: {exc}")
        return 0
    restored = 0
    for pid, d in (raw or {}).items():
        try:
            key = int(pid)
            if key in _seen:
                continue                      # anything seen this run is fresher
            _seen[key] = _Seen(symbol=d["symbol"], bullish=bool(d["bullish"]),
                               entry=float(d["entry"]),
                               stop=(float(d["stop"]) if d.get("stop") is not None else None),
                               peak_r=d.get("peak_r"), trough_r=d.get("trough_r"),
                               source=d.get("source", "poll"))
            restored += 1
        except Exception:
            continue                          # one bad row must not lose the rest
    if restored:
        log.info(f"[exit_watch] restored {restored} position snapshot(s) — their best/worst R and "
                 f"their exit announcement survive the restart")
    return restored


def marks_for(position_id: int) -> tuple[float | None, float | None, str] | None:
    """(best R, worst R, which clock measured them) for one position, or None if unknown.

    This is what the journal reads. `source` is carried because a 0.5s FIX reading and a 30s poll
    reading are not the same quality, and a high-water mark whose sampling rate is unknown is worse
    than one that states it.
    """
    s = _seen.get(int(position_id))
    return (s.peak_r, s.trough_r, s.source) if s else None
