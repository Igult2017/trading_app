"""
4H key zone check for EURUSD Pullback.

Rule (from spec): if the entry price is AT OR INSIDE an unmitigated 4H
swing level or FVG zone, reject the trade.

This is a proximity check on the current entry price — not a forward-path
calculation. If price is already sitting in a key zone, institutional
orders at that level create an unfavourable entry environment.
"""
from core.types import Candle, ZoneType
from shared.swing_points import find_swing_points
from shared.zone_detection import find_fvg_zones

_PIP       = 0.00010
_PROXIMITY = 10 * _PIP   # within 10 pips = "at" a key level


def _is_mitigated(h4: list[Candle], swing) -> bool:
    """Swing mitigated when a later candle closes through its price."""
    for c in h4[swing.index + 1:]:
        if swing.is_high and c.close >= swing.price:
            return True
        if not swing.is_high and c.close <= swing.price:
            return True
    return False


def is_at_4h_key_level(h4: list[Candle], entry: float) -> bool:
    """
    True if entry price is at or inside any unmitigated 4H key level.

    Checked levels:
    1. Swing S/R: unmitigated H4 swing high or low within 10 pips of entry
    2. FVG zones: entry price falls inside an unmitigated H4 fair-value gap
    """
    for s in find_swing_points(h4, n=5):
        if _is_mitigated(h4, s):
            continue
        if abs(entry - s.price) < _PROXIMITY:
            return True

    for fvg in find_fvg_zones(h4, "H4"):
        if fvg.mitigated:
            continue
        if fvg.bottom <= entry <= fvg.top:
            return True

    return False
