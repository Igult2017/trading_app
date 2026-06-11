"""
4H obstruction check for EURUSD Pullback strategy.
Blocks a trade when an unmitigated S/R level or FVG zone sits between
entry and the 2R target on the H4 timeframe.
"""
from core.types import Candle, ZoneType
from shared.swing_points import find_swing_points
from shared.zone_detection import find_fvg_zones


def _is_mitigated(h4: list[Candle], swing) -> bool:
    """
    Swing HIGH mitigated when a later H4 candle closes above it.
    Swing LOW  mitigated when a later H4 candle closes below it.
    Wick-only touches do not count.
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

    Checked levels:
    1. Swing S/R: unmitigated H4 swing high (BUY path) or swing low (SELL path)
       between entry and TP. Also blocks if any unmitigated level is within 0.5R.
    2. FVG zones: unmitigated supply FVG in BUY path or demand FVG in SELL path.

    Mitigated = price closed through the level → orders consumed, no longer active.
    """
    target    = entry + risk * min_rr if bullish else entry - risk * min_rr
    proximity = risk * 0.50

    for s in find_swing_points(h4, n=5):   # n=5: only significant pivots, not micro-structure
        if _is_mitigated(h4, s):
            continue
        if abs(entry - s.price) < proximity:
            return True
        if bullish     and s.is_high     and entry < s.price < target:
            return True
        if not bullish and not s.is_high and target < s.price < entry:
            return True

    lo, hi = (target, entry) if not bullish else (entry, target)
    for fvg in find_fvg_zones(h4, "H4"):
        if fvg.mitigated:
            continue
        if fvg.bottom < hi and fvg.top > lo:
            if not bullish and fvg.type == ZoneType.DEMAND:
                return True
            if bullish     and fvg.type == ZoneType.SUPPLY:
                return True

    return False
