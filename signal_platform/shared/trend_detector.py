"""
Lightweight structural trend detector used as a pre-filter.
Only needs ~50 candles — runs before any heavy computation.
"""

from core.types import Candle, Trend
from shared.swing_points import find_swing_points, classify_structure

MIN_LEAD = 2     # trend-side labels must outnumber the other side by at least this many


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

    # A TREND NEEDS A LEAD OF AT LEAST 2 (18 Nov 2026, his order: "Fix it for every strategy"). With a lead of 1, ONE
    # flat range read DOWN, RANGING or UP depending only on which candle the 50-candle window ended on (12 window ends:
    # 4 / 4 / 4). Lead of 2: ranging at all 12. Measured on real 4H (GBP/USD, GBP/JPY, XAU/USD): ~24% of readings
    # change, ranging 34-38% of the time (was 11-14%), reading changes a month down 8-22%. A stricter "latest high and
    # latest low must agree" was measured too and rejected: it still misread the flat range at 3 of 12 ends.
    if bullish_score - bearish_score >= MIN_LEAD and bullish_score >= 2:
        return Trend.UPTREND
    if bearish_score - bullish_score >= MIN_LEAD and bearish_score >= 2:
        return Trend.DOWNTREND
    return Trend.RANGING
