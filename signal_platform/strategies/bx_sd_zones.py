"""
BX-S/D — supply/demand zones from inefficiency.

Book Ch.6, "Mitigation / Inefficiency":
  * "Supply/demand is a zone, where price rapidly pushes away from (lots of orders placed), creating
    inefficiency (IFC), and breaks structure (BOS) / changes character (CHoCH)."
  * IFC / imbalance = a 3-candle gap (fair-value gap) — the fast move skipped a price range:
      bullish IFC: candle[i-1].high < candle[i+1].low
      bearish IFC: candle[i-1].low  > candle[i+1].high
  * THE ZONE (p29, near-verbatim): "Find areas where IFC has been created. Find the LAST RECENT
    CANDLE BEFORE THE IFC. It doesn't have to be in the opposite direction! (For example: if the IFC
    was created on the long side, you can choose an upside move candle, it doesn't have to be a
    downside move candle.) Always choose the last candle that created the IFC!"

    So: ONE zone per IFC, at the candle immediately before it, WHATEVER COLOUR it is. We must not
    walk backwards hunting an opposite-coloured candle — the book rules that out in as many words,
    and doing it collapses every IFC in one impulse onto a single zone at the impulse's ORIGIN, tens
    of pips from where the inefficiency actually formed. That zone is then rarely revisited, so it
    reads "unmitigated" forever while the real zones next to price are never marked at all.
  * WICK ZONES (p33-35): if the impulse candle's own wick traded back through the candle before it,
    "there aren't any resting orders left on this candle, all of them get mitigated by this following
    candle" — the zone is then the IMPULSE candle's wick ("orders are sitting on THIS WICK!"), and
    marking the body instead is "NOT HERE!". See _wick_zone.
  * mitigated / unmitigated (p27): "When price taps into a d/s zone, that has not been tapped yet, it
    becomes mitigated from unmitigated." BX-S/D only ever trades UNMITIGATED zones.

The other two validity factors (broke structure, liquidity grabbed) are applied by bx_sd_setup;
selecting the most recent zone that carries all three is its job too (p32). Reads only raw candles.
"""
from dataclasses import dataclass

from core.types import Candle


@dataclass
class FVG:
    direction: str    # "bull" | "bear"
    index:     int    # middle candle of the 3-candle gap
    bottom:    float  # gap low
    top:       float  # gap high


@dataclass
class Zone:
    direction:    str      # "demand" | "supply"
    top:          float
    bottom:       float
    proximal:     float    # entry edge (near price)
    distal:       float    # SL edge (far)
    eq50:         float    # mean threshold (50%)
    origin_index: int      # the zone candle (last before the IFC)
    ifc_index:    int      # the FVG that validates it
    mitigated:    bool = False


def find_fvgs(candles: list[Candle]) -> list[FVG]:
    """3-candle fair-value gaps (inefficiencies), oldest first."""
    out: list[FVG] = []
    for i in range(1, len(candles) - 1):
        p, n = candles[i - 1], candles[i + 1]
        if p.high < n.low:
            out.append(FVG("bull", i, p.high, n.low))
        elif p.low > n.high:
            out.append(FVG("bear", i, n.high, p.low))
    return out


def _wick_zone(candles: list[Candle], ifc: int, bull: bool) -> tuple[float, float] | None:
    """Book p33-35 — "When should you use wicks as the zones?".

    If the impulse candle's own wick traded back THROUGH the candle before it, then (p34) "there
    aren't any resting orders left on this candle, all of them get mitigated by this following
    candle" — that candle is dead as a zone. "In this case, this is your valid supply level, orders
    are sitting on THIS WICK!" So the zone becomes the impulse candle's OWN wick; p35 marks the body
    and says "NOT HERE!". Returns (top, bottom) of the wick zone, or None when the ordinary
    candle-before rule stands. The wick must actually exist — if the BODY did the sweeping there is
    no wick to rest orders on, and we leave the normal rule in charge.
    """
    imp, zc = candles[ifc], candles[ifc - 1]
    body_hi, body_lo = max(imp.open, imp.close), min(imp.open, imp.close)
    if bull:
        if imp.low <= zc.low and imp.low < body_lo:      # lower wick swept the whole prior candle
            return body_lo, imp.low
    elif imp.high >= zc.high and imp.high > body_hi:     # upper wick swept the whole prior candle
        return imp.high, body_hi
    return None


def _is_mitigated(candles: list[Candle], after: int, direction: str, top: float, bottom: float) -> bool:
    """A fresh zone is mitigated the first time price taps back to its proximal edge (p27)."""
    for j in range(after + 1, len(candles)):
        c = candles[j]
        if direction == "demand" and c.low <= top:
            return True
        if direction == "supply" and c.high >= bottom:
            return True
    return False


def find_zones(candles: list[Candle]) -> list[Zone]:
    """Every IFC-backed S/D zone with its mitigation state — one per IFC, most-recent last.

    The zone candle is the one immediately before the IFC and its colour is irrelevant (p29). Zones
    come out ordered because find_fvgs walks the candles in order.
    """
    zones: list[Zone] = []
    for fvg in find_fvgs(candles):
        zi = fvg.index - 1
        if zi < 0:
            continue
        bull      = fvg.direction == "bull"
        direction = "demand" if bull else "supply"
        wick      = _wick_zone(candles, fvg.index, bull)
        if wick is not None:
            top, bottom = wick              # p33-35: the prior candle is mitigated; orders rest here
            origin = fvg.index
        else:
            z = candles[zi]
            top, bottom = z.high, z.low     # p29: the last candle before the IFC, any colour
            origin = zi
        zones.append(Zone(
            direction    = direction,
            top          = top,
            bottom       = bottom,
            proximal     = top if bull else bottom,     # entry edge faces the market
            distal       = bottom if bull else top,     # SL edge is the far side
            eq50         = (top + bottom) / 2.0,
            origin_index = origin,
            ifc_index    = fvg.index,
            mitigated    = _is_mitigated(candles, fvg.index, direction, top, bottom),
        ))
    return zones


def unmitigated(zones: list[Zone], direction: str | None = None) -> list[Zone]:
    """Fresh zones only (optionally filtered to 'demand' / 'supply'), most-recent last."""
    return [z for z in zones if not z.mitigated and (direction is None or z.direction == direction)]
