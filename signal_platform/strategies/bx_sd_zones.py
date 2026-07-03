"""
BX-S/D — supply/demand zones from inefficiency (Phase 2).

Per the SMC book (Ch. 3 & 6):
  * IFC / imbalance = a 3-candle gap (fair-value gap): the fast move skipped a price range.
      bullish FVG: candle[i-1].high < candle[i+1].low
      bearish FVG: candle[i-1].low  > candle[i+1].high
  * A supply/demand zone = the LAST candle BEFORE the impulsive move that created the IFC
    ("the demand candle, not the red one"). Demand = origin of a bullish impulse, supply = origin
    of a bearish impulse.
  * mitigated / unmitigated: the FIRST time price taps a fresh zone it becomes mitigated.
    BX-S/D only ever trades UNMITIGATED zones.

The 3rd validity factor (broke structure) and liquidity are assembled in later phases.
Reads only raw candles + generic candle-math.
"""
from dataclasses import dataclass

from core.types import Candle
from shared.candle_math import is_bullish, is_bearish


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
    """3-candle fair-value gaps (inefficiencies)."""
    out: list[FVG] = []
    for i in range(1, len(candles) - 1):
        p, n = candles[i - 1], candles[i + 1]
        if p.high < n.low:
            out.append(FVG("bull", i, p.high, n.low))
        elif p.low > n.high:
            out.append(FVG("bear", i, n.high, p.low))
    return out


def _dir(c: Candle) -> int:
    return 1 if is_bullish(c) else (-1 if is_bearish(c) else 0)


def _zone_candle_idx(candles: list[Candle], i: int, bull: bool) -> int:
    """Walk back to the start of the same-direction impulse run containing i, then step one
    before it — that last candle before the impulse is the S/D zone origin."""
    want = 1 if bull else -1
    s = i
    while s - 1 >= 0 and _dir(candles[s - 1]) == want:
        s -= 1
    return s - 1


def _is_mitigated(candles: list[Candle], after: int, direction: str, top: float, bottom: float) -> bool:
    """A fresh zone is mitigated once price taps back into it (first touch of the proximal edge)."""
    for j in range(after + 1, len(candles)):
        c = candles[j]
        if direction == "demand" and c.low <= top:
            return True
        if direction == "supply" and c.high >= bottom:
            return True
    return False


def find_zones(candles: list[Candle]) -> list[Zone]:
    """Every IFC-backed S/D zone with its mitigation state, most-recent last."""
    zones: list[Zone] = []
    seen: set[int] = set()
    for fvg in find_fvgs(candles):
        bull = fvg.direction == "bull"
        zi = _zone_candle_idx(candles, fvg.index, bull)
        if zi < 0 or zi in seen:
            continue
        seen.add(zi)
        z = candles[zi]
        direction = "demand" if bull else "supply"
        top, bottom = z.high, z.low
        proximal = top if bull else bottom          # entry edge faces the market
        distal   = bottom if bull else top          # SL edge is the far side
        mit = _is_mitigated(candles, fvg.index, direction, top, bottom)
        zones.append(Zone(direction, top, bottom, proximal, distal,
                          (top + bottom) / 2.0, zi, fvg.index, mit))
    zones.sort(key=lambda z: z.origin_index)
    return zones


def unmitigated(zones: list[Zone], direction: str | None = None) -> list[Zone]:
    """Fresh zones only (optionally filtered to 'demand' / 'supply'), most-recent last."""
    return [z for z in zones if not z.mitigated and (direction is None or z.direction == direction)]
