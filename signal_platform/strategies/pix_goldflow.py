"""PIX — GOLD'S BUYING AND SELLING, ESTIMATED from our own live price stream (18 Nov 2026).

Gold trades over the counter: there is no free exchange record of who bought and who sold (the real one is the CME
futures feed, which is paid). So this COUNTS PRICE MOVES from the broker's live stream (FIX), as they arrive: a bid
that ticks UP is counted as a buyer, a bid that ticks DOWN as a seller (the "tick rule"). An unchanged bid is not
counted — the stream also sends a message when only the ask moved, and that says nothing about who traded.

IT IS AN ESTIMATE, and every card says so. It counts moves, not money.

COVERAGE. Counting starts when the stream connects, so the minute in progress at that moment is incomplete and is not
used; after any silence of over a minute the minute where counting resumes is part-counted and not used either; and a
minute with NO tick at all (stream down, market shut) is missing rather than zero. The verdict needs every
candle of the approach, so right after a restart gold's order flow is UNKNOWN — and UNKNOWN refuses — until about an
hour of 5M candles has been counted. Nothing is read from cTrader's tick history: that request shares the broker's
scarce budget (~5 a second) with everything else.
"""
from __future__ import annotations

import time

SYMBOL = "XAU/USD"
KEEP_S = 8 * 3600
_minutes: dict[int, list[int]] = {}        # minute open (s) → [up ticks, down ticks]
_partial: set[int] = set()                 # minutes where counting (re)started part-way — never used
_state = {"last": None, "first_minute": None, "last_epoch": None}


def on_tick(symbol: str, bid: float, epoch: float) -> None:
    if symbol != SYMBOL or bid is None:
        return
    m = int(epoch) // 60 * 60
    if _state["first_minute"] is None:
        _state["first_minute"] = m             # this minute began before we were listening — never used
    gap = _state["last_epoch"] is not None and epoch - _state["last_epoch"] > 60
    if gap:
        _partial.add(m)                        # the stream was silent over a minute: this minute is only part-counted
    _state["last_epoch"] = epoch
    last = _state["last"]
    _state["last"] = bid
    if last is None or bid == last:
        _minutes.setdefault(m, [0, 0])
        return
    row = _minutes.setdefault(m, [0, 0])
    row[0 if bid > last else 1] += 1
    if len(_minutes) > KEEP_S // 60 + 60:
        for k in sorted(_minutes)[:60]:
            del _minutes[k]


def flows(tf: str, now: float | None = None) -> tuple[str, dict[int, tuple[float, float]]]:
    """("price-tick estimate", {open time: (up ticks, down ticks)}) for CLOSED, fully counted M1 / M5 candles."""
    now = time.time() if now is None else now
    first = _state["first_minute"]
    if first is None:
        return "", {}
    done = {m: v for m, v in _minutes.items() if m > first and m + 60 <= now and m not in _partial}
    if tf == "M1":
        return "price-tick estimate", {m: (float(v[0]), float(v[1])) for m, v in done.items()}
    if tf == "M5":
        out = {}
        for start in {m // 300 * 300 for m in done}:
            parts = [done.get(start + 60 * k) for k in range(5)]
            if all(p is not None for p in parts):
                out[start] = (float(sum(p[0] for p in parts)), float(sum(p[1] for p in parts)))
        return "price-tick estimate", out
    return "", {}


def reset() -> None:
    """Tests and a fresh connection: forget everything counted."""
    _minutes.clear()
    _partial.clear()
    _state.update(last=None, first_minute=None, last_epoch=None)
