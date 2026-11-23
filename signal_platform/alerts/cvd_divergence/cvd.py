"""HIS cTRADER INDICATOR, LINE FOR LINE — `C:\\Users\\FSD\\Desktop\\CVD Divergence.cs`, with its DEFAULT settings (he uses it
as it is, 23 Nov 2026). Pure functions; nothing here reads a feed or sends anything.

What it does, in plain words (the .cs line numbers in brackets):
  * DELTA of a candle — its tick count split by where it closed in its range: `volume × (close−low)/(high−low)` is
    counted as buying, the rest as selling; delta = buying − selling; a candle with no range = 0 (.cs:233-249). Source
    timeframe "Current": each 1H candle uses itself.
  * CVD — the sum of the last PERIOD (20) deltas, this one included (.cs:113-123); no smoothing (.cs:258-261).
    The first PERIOD candles of the series get no delta at all (.cs:102-108), so CVD only exists from candle
    2·PERIOD−1 on — before that his indicator holds NaN, and every comparison with it is false. Copied as None.
  * SWING HIGH — a candle whose high is above the SWING (5) candles each side; an EQUAL high before it disqualifies it,
    an equal one after does not (.cs:177-187). Swing low mirrored (.cs:189-199).
  * D (divergence) — judged only once SWING later candles have CLOSED (.cs:148-152). Bearish: a new swing high ABOVE
    the previous swing high with CVD LOWER there. Bullish: a new swing low BELOW the previous one with CVD HIGHER
    (.cs:154-174). The previous swing is ALWAYS updated, D or not (.cs:162, :173).
"""
from __future__ import annotations

from dataclasses import dataclass

PERIOD = 20    # "Cumulative Period", default 20 (.cs:33)
SWING = 5      # "Swing Candles Each Side", default 5 (.cs:45)


def delta(c) -> float:
    rng = c.high - c.low
    if rng <= 0:
        return 0.0
    pos = (c.close - c.low) / rng
    return c.volume * pos - c.volume * (1 - pos)


def cvd_series(candles: list) -> list[float | None]:
    """CVD at every candle, None where his indicator holds NaN (fewer than PERIOD deltas exist)."""
    deltas = [delta(c) if i >= PERIOD else None for i, c in enumerate(candles)]
    out: list[float | None] = []
    for i in range(len(candles)):
        window = deltas[max(0, i - PERIOD + 1):i + 1]
        out.append(sum(window) if i >= PERIOD and len(window) == PERIOD and None not in window else None)
    return out


def is_swing_high(candles: list, p: int, last_closed: int) -> bool:
    h = candles[p].high
    for j in range(p - SWING, min(p + SWING, last_closed) + 1):
        if j == p:
            continue
        if j < p and candles[j].high >= h:
            return False
        if j > p and candles[j].high > h:
            return False
    return True


def is_swing_low(candles: list, p: int, last_closed: int) -> bool:
    lo = candles[p].low
    for j in range(p - SWING, min(p + SWING, last_closed) + 1):
        if j == p:
            continue
        if j < p and candles[j].low <= lo:
            return False
        if j > p and candles[j].low < lo:
            return False
    return True


def _lower(a, b) -> bool:      # a < b, false when either is NaN — exactly as C# compares doubles
    return a is not None and b is not None and a < b


@dataclass(frozen=True)
class Mark:
    """One D, as his indicator draws it: on candle `time` at `price` (its high for bearish, its low for bullish)."""
    side: str          # "bearish" | "bullish"
    time: int
    price: float
    cvd: float
    prev_time: int
    prev_price: float
    prev_cvd: float


def scan(closed: list) -> tuple[list[Mark], int, int]:
    """Run his indicator over CLOSED candles, oldest first, as cTrader does with a forming candle after them.
    Returns (every D, index of the last swing high, index of the last swing low); -1 = none yet."""
    cvd = cvd_series(closed)
    marks: list[Mark] = []
    last_hi = last_lo = -1
    for index in range(len(closed) + 1):          # `index` = the candle cTrader is calculating; index−1 = newest closed
        p = index - 1 - SWING
        if p - SWING < PERIOD:
            continue
        if is_swing_high(closed, p, index - 1) and p != last_hi:
            if last_hi >= 0 and closed[p].high > closed[last_hi].high and _lower(cvd[p], cvd[last_hi]):
                marks.append(Mark("bearish", closed[p].time, closed[p].high, cvd[p],
                                  closed[last_hi].time, closed[last_hi].high, cvd[last_hi]))
            last_hi = p
        if is_swing_low(closed, p, index - 1) and p != last_lo:
            if last_lo >= 0 and closed[p].low < closed[last_lo].low and _lower(cvd[last_lo], cvd[p]):
                marks.append(Mark("bullish", closed[p].time, closed[p].low, cvd[p],
                                  closed[last_lo].time, closed[last_lo].low, cvd[last_lo]))
            last_lo = p
    return marks, last_hi, last_lo
