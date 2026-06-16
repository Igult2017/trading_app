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
from shared.zone_detection import find_fvg_zones, find_zones, unmitigated

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


def nearby_zone_warnings(h4: list[Candle], d1: list[Candle], ref: float) -> list[str]:
    """
    Informational (NEVER disqualifying) report of the nearest unmitigated supply
    above `ref` and nearest unmitigated demand below `ref`, on H4 and D1.
    Returns card-ready lines so the trader can see what's overhead/below.
    """
    out: list[str] = []
    for tf, candles in (("H4", h4), ("D1", d1)):
        zones = unmitigated(find_zones(candles, tf))
        sup = [z for z in zones if z.type == ZoneType.SUPPLY and z.bottom >= ref]
        dem = [z for z in zones if z.type == ZoneType.DEMAND and z.top <= ref]
        if sup:
            z = min(sup, key=lambda z: z.bottom - ref)
            out.append(f"{tf} supply {z.bottom:.5f}-{z.top:.5f} (~{(z.bottom - ref) / _PIP:.0f} pips above)")
        if dem:
            z = max(dem, key=lambda z: z.top)
            out.append(f"{tf} demand {z.bottom:.5f}-{z.top:.5f} (~{(ref - z.top) / _PIP:.0f} pips below)")
    return out
