"""PIX's OWN swing highs / lows and their labels — copied from `shared/swing_points` (18 Nov 2026) so PIX shares no logic.

A swing high is the highest high of `n` candles each side; a swing low the lowest low. Labels compare each swing with
the previous one of its kind: HH / LH for highs, HL / LL for lows, and EH / EL when it is EQUAL — an equal point counts
for neither side (the shared copy used to call it lower, which leaned every flat range towards a downtrend).
"""
from dataclasses import dataclass

from core.types import Candle


@dataclass
class Swing:
    price:   float
    index:   int
    is_high: bool


def find_swings(candles: list[Candle], n: int = 3) -> list[Swing]:
    out: list[Swing] = []
    for i in range(n, len(candles) - n):
        win = candles[i - n:i + n + 1]
        if candles[i].high == max(c.high for c in win):
            out.append(Swing(candles[i].high, i, True))
        if candles[i].low == min(c.low for c in win):
            out.append(Swing(candles[i].low, i, False))
    return out


def label_swings(points: list[Swing]) -> list[tuple[str, Swing]]:
    """Each swing after the first of its kind, labelled against the previous one; oldest first."""
    out: list[tuple[str, Swing]] = []
    for is_high, up, down, eq in ((True, "HH", "LH", "EH"), (False, "HL", "LL", "EL")):
        same = [p for p in points if p.is_high == is_high]
        for prev, cur in zip(same, same[1:]):
            out.append((up if cur.price > prev.price else down if cur.price < prev.price else eq, cur))
    return sorted(out, key=lambda x: x[1].index)
