"""
VOCANT.1 — the structure rule: HH+HL is up, LH+LL is down, anything else is no clear trend.

Pure price structure, no indicators. The 1HR bias ONLY. The 1M deliberately does not use it: a
spike-and-return inside one hour never prints the two highs and two lows this needs, so it read
"no trend" through every long-wick case and threw real entries away. There, the LINE answers it.

Ties are handled deliberately. find_swing_points flags EVERY bar whose high/low equals the window
extreme, so a neighbour that ties a pivot records the SAME level twice — and "higher than the last
one" would then compare a price against itself and report no trend. A tie is ordinary price action,
not an absence of trend, and on 5-decimal data it is common, so consecutive equal levels collapse.
"""
from core.types import Candle
from shared.swing_points import find_swing_points

_SWING_N = 3   # generic swing-pivot half-width


def _levels(pts, is_high: bool) -> list[float]:
    """Distinct swing levels, oldest last — consecutive ties collapse into one."""
    out: list[float] = []
    for p in pts:
        if p.is_high == is_high and (not out or abs(p.price - out[-1]) > 1e-9):
            out.append(p.price)
    return out


def clear_trend(candles: list[Candle]) -> int:
    """+1 uptrend (HH+HL) / -1 downtrend (LH+LL) / 0 no clear trend."""
    pts   = find_swing_points(candles, n=_SWING_N)
    highs = _levels(pts, True)
    lows  = _levels(pts, False)
    if len(highs) < 2 or len(lows) < 2:
        return 0
    if highs[-1] > highs[-2] and lows[-1] > lows[-2]:
        return 1
    if highs[-1] < highs[-2] and lows[-1] < lows[-2]:
        return -1
    return 0
