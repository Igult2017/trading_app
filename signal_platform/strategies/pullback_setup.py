"""
Helper functions for EURUSD Pullback strategy.
Handles: volume candle detection, pullback measurement,
4H obstruction check, and 1M fractal break confirmation.
"""
from core.types import Candle, ZoneType
from shared.candle_math import body_size, body_ratio, is_bullish
from shared.swing_points import find_swing_points
from shared.zone_detection import find_fvg_zones


def find_volume_candle(candles: list[Candle], bullish: bool, lookback: int = 15) -> int | None:
    """
    Scan the last `lookback` confirmed 1H bars (newest-first) for a volume candle
    aligned with `bullish` direction.
    Criteria: body > previous candle body AND body_ratio >= 0.60 (small wicks).
    Returns index in the original list, or None.
    """
    end   = len(candles) - 1       # exclude the currently-forming bar
    start = max(1, end - lookback)
    for i in range(end - 1, start - 1, -1):
        c, prev = candles[i], candles[i - 1]
        if is_bullish(c) != bullish:
            continue
        if body_size(c) > body_size(prev) and body_ratio(c) >= 0.60:
            return i
    return None


def measure_pullback(
    candles: list[Candle],
    vol_idx: int,
    bullish: bool,
) -> tuple[float, float, int] | None:
    """
    Count consecutive against-direction candles immediately after the volume candle.
    Bullish impulse → count bearish pullback candles. Bearish → count bullish.
    Returns (pullback_high, pullback_low, count) if 1 ≤ count ≤ 3, else None.
    """
    pb_candles: list[Candle] = []

    for c in candles[vol_idx + 1:]:
        going_against = (not is_bullish(c)) if bullish else is_bullish(c)
        if going_against:
            pb_candles.append(c)
        else:
            break   # impulse resuming — pullback ends here

    count = len(pb_candles)
    if count < 1 or count > 3:
        return None

    return (
        max(c.high for c in pb_candles),
        min(c.low  for c in pb_candles),
        count,
    )


def _is_mitigated(h4: list[Candle], swing: "SwingPoint") -> bool:
    """
    A swing HIGH is mitigated when a later candle closed above it.
    A swing LOW  is mitigated when a later candle closed below it.
    Wick-only touches do not count — full close required.
    """
    for c in h4[swing.index + 1:]:
        if swing.is_high and c.close >= swing.price:
            return True
        if not swing.is_high and c.close <= swing.price:
            return True
    return False


def has_4h_obstruction(
    h4: list[Candle],
    entry: float,
    bullish: bool,
    risk: float,
    min_rr: float = 2.0,
) -> bool:
    """
    True if an UNMITIGATED 4H level blocks the path to 2R.
    Two types of levels are checked:

    1. Swing highs / lows (S&R):
       - Unmitigated swing HIGH between entry and TP blocks a BUY.
       - Unmitigated swing LOW  between entry and TP blocks a SELL.
       - Any unmitigated level within 0.5R of entry is also a block.

    2. FVG zones (Fair Value Gaps / demand-supply imbalance):
       - Unmitigated 4H demand FVG (bullish imbalance) overlapping the
         SELL path → institutions sitting there can reverse price.
       - Unmitigated 4H supply FVG (bearish imbalance) overlapping the
         BUY path → institutions sitting there can reverse price.

    Mitigated = price already closed through the level → orders consumed,
    level no longer defends.
    """
    target    = entry + risk * min_rr if bullish else entry - risk * min_rr
    proximity = risk * 0.50

    # ── 1. Swing highs / lows ─────────────────────────────────────────
    for s in find_swing_points(h4):
        if _is_mitigated(h4, s):
            continue
        if abs(entry - s.price) < proximity:
            return True
        if bullish     and s.is_high     and entry < s.price < target:
            return True
        if not bullish and not s.is_high and target < s.price < entry:
            return True

    # ── 2. FVG zones (demand / supply imbalances) ─────────────────────
    lo, hi = (target, entry) if not bullish else (entry, target)
    for fvg in find_fvg_zones(h4, "H4"):
        if fvg.mitigated:
            continue
        # Zone overlaps the trade path if it sits anywhere between lo and hi
        zone_overlaps = fvg.bottom < hi and fvg.top > lo
        if not zone_overlaps:
            continue
        if not bullish and fvg.type == ZoneType.DEMAND:
            return True   # demand in SELL path — likely bounce before TP
        if bullish     and fvg.type == ZoneType.SUPPLY:
            return True   # supply in BUY path — likely reversal before TP

    return False


def fractal_broken(
    m1: list[Candle],
    pb_high: float,
    pb_low: float,
    bullish: bool,
    lookback: int = 5,
) -> bool:
    """
    True when the 1M pullback structure is broken by a close.
    BUY : any of the last `lookback` 1M candles closed ABOVE pb_high.
    SELL: any of the last `lookback` 1M candles closed BELOW pb_low.
    """
    recent = m1[-lookback:]
    if bullish:
        return any(c.close > pb_high for c in recent)
    return any(c.close < pb_low for c in recent)
