"""
Lightweight structural trend detector used as a pre-filter.
Only needs ~50 candles — runs before any heavy computation.
"""

from core.types import Candle, Trend
from shared.swing_points import find_swing_points, classify_structure


def detect(candles: list[Candle], lookback: int = 50) -> Trend:
    """
    Detect trend from the last `lookback` candles using HH/HL (uptrend)
    or LH/LL (downtrend) structure. Returns RANGING when ambiguous.
    """
    sample = candles[-lookback:] if len(candles) >= lookback else candles
    if len(sample) < 10:
        return Trend.RANGING

    points = find_swing_points(sample, n=3)
    if not points:
        return Trend.RANGING

    labelled = classify_structure(points)
    labels = [label for label, _ in labelled]

    hh_count = labels.count("HH")
    hl_count = labels.count("HL")
    lh_count = labels.count("LH")
    ll_count = labels.count("LL")

    bullish_score  = hh_count + hl_count
    bearish_score  = lh_count + ll_count

    if bullish_score > bearish_score and bullish_score >= 2:
        return Trend.UPTREND
    if bearish_score > bullish_score and bearish_score >= 2:
        return Trend.DOWNTREND
    return Trend.RANGING
