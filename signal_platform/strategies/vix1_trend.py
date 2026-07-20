"""
VIX.1 — the structure rule: HH+HL is up, LH+LL is down, anything else is no clear trend.

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
    """Distinct swing levels, NEWEST last (find_swing_points returns chronological order, so [-1] is
    the most recent and [-2] the one before it) — consecutive ties collapse into one."""
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


def broke_structure(trend_candles: list[Candle], close_price: float, bullish: bool) -> bool:
    """
    CHoCH — did `close_price` CLOSE beyond the swing point that defined the OLD trend, on the
    TREND timeframe's structure? A bullish reversal must close above the last swing HIGH; a bearish
    one below the last swing LOW. Takes an explicit close so it works CROSS-TF: the trend now lives on
    H4, but the candle doing the breaking is the 1HR momentum candle — we test that 1HR close against
    the H4 swings.

    This separates a REVERSAL from a deep pullback: a big candle running against the trend is ordinary
    retracement until it takes out the structure. It is a BODY CLOSE, never a wick — a wick through the
    level is a liquidity grab (platform-wide rule for both strategies).
    """
    pts = [p for p in find_swing_points(trend_candles, n=_SWING_N) if p.is_high == bullish]
    if not pts:
        return False
    level = pts[-1].price
    return close_price > level if bullish else close_price < level
