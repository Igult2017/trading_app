"""PIX — BUYING AND SELLING, ESTIMATED from our own live price stream, PER MARKET (18 Nov 2026; per market 19 Nov).

Gold and forex trade over the counter: there is no exchange record of who bought and who sold — his point, 19 Nov:
*"forex has no centralized data"*. cTrader's stream carries the quoted prices only, not the trades, so this COUNTS PRICE
MOVES as they arrive: a bid that ticks UP is counted as a buyer, a bid that ticks DOWN as a seller (the "tick rule"). An
unchanged bid is not counted — the stream also sends a message when only the ask moved.

IT IS AN ESTIMATE, and every card says so. It counts moves, not money. It was gold-only (`pix_goldflow`) until 19 Nov;
it is now kept per symbol, so a forex pair gets its own count the moment PIX trades one — nothing else changes.

COVERAGE. Counting starts when the stream connects, so the minute in progress at that moment is incomplete and is not
used; after any silence of over a minute the minute where counting resumes is part-counted and not used either; and a
minute with NO tick at all (stream down, market shut) is missing rather than zero. Nothing is read from cTrader's tick
history: that request shares the broker's scarce budget (~5 a second) with everything else.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

KEEP_S = 8 * 3600
SOURCE = "price-tick estimate"


@dataclass
class _Book:
    minutes: dict = field(default_factory=dict)    # minute open (s) → [up ticks, down ticks]
    levels:  dict = field(default_factory=dict)    # minute → price → [up ticks, down ticks] — the FOOTPRINT estimate
    partial: set = field(default_factory=set)      # minutes where counting (re)started part-way — never used
    last:    float | None = None
    first_minute: int | None = None
    last_epoch:   float | None = None


_books: dict[str, _Book] = {}


def on_tick(symbol: str, bid: float, epoch: float) -> None:
    if not symbol or bid is None:
        return
    b = _books.setdefault(symbol, _Book())
    m = int(epoch) // 60 * 60
    if b.first_minute is None:
        b.first_minute = m                     # this minute began before we were listening — never used
    if b.last_epoch is not None and epoch - b.last_epoch > 60:
        b.partial.add(m)                       # the stream was silent over a minute: this minute is only part-counted
    b.last_epoch = epoch
    last, b.last = b.last, bid
    b.minutes.setdefault(m, [0, 0])
    if last is None or bid == last:
        return
    side = 0 if bid > last else 1
    b.minutes[m][side] += 1
    b.levels.setdefault(m, {}).setdefault(bid, [0, 0])[side] += 1     # counted AT the price it moved to
    if len(b.minutes) > KEEP_S // 60 + 60:
        for k in sorted(b.minutes)[:60]:
            del b.minutes[k]
            b.levels.pop(k, None)
            b.partial.discard(k)


def flows(symbol: str, tf: str, now: float | None = None) -> tuple[str, dict[int, tuple[float, float]]]:
    """(SOURCE, {open time: (up ticks, down ticks)}) for CLOSED, fully counted M1 / M5 candles of `symbol`."""
    now = time.time() if now is None else now
    b = _books.get(symbol)
    if b is None or b.first_minute is None:
        return "", {}
    done = {m: v for m, v in b.minutes.items() if m > b.first_minute and m + 60 <= now and m not in b.partial}
    if tf == "M1":
        return SOURCE, {m: (float(v[0]), float(v[1])) for m, v in done.items()}
    if tf == "M5":
        out = {}
        for start in {m // 300 * 300 for m in done}:
            parts = [done.get(start + 60 * k) for k in range(5)]
            if all(p is not None for p in parts):
                out[start] = (float(sum(p[0] for p in parts)), float(sum(p[1] for p in parts)))
        return SOURCE, out
    return "", {}


def prints(symbol: str, tf: str, now: float | None = None) -> dict[int, dict[float, tuple[float, float]]]:
    """The footprint ESTIMATE: {candle open time: {price: (up ticks, down ticks)}} for the candles `flows` covers."""
    _, fl = flows(symbol, tf, now)
    b = _books.get(symbol)
    out: dict[int, dict[float, tuple[float, float]]] = {}
    for t in fl:
        cell: dict[float, list[float]] = {}
        for m in ([t] if tf == "M1" else [t + 60 * k for k in range(5)]):
            for p, (u, d) in b.levels.get(m, {}).items():
                c = cell.setdefault(p, [0.0, 0.0])
                c[0] += u
                c[1] += d
        out[t] = {p: (v[0], v[1]) for p, v in cell.items()}
    return out


def reset() -> None:
    """Tests and a fresh connection: forget everything counted, for every market."""
    _books.clear()
