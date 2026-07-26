"""BX-S/D — is a zone's tap FRESH? (split out of bx_sd_setup, 150-line rule; behaviour unchanged.)

Two questions, one responsibility: when was this zone first touched, and had its LEVEL already been
worked before it even formed. Shared by the setup path, the mitigation heads-up and the reports.
"""
from core.types import Candle
from strategies.bx_sd_zones import Zone

_LEVEL_WINDOW = 18   # H4 bars (~3 days): how recently before a zone forms the level must have been
                     # worked to count as pre-mitigated. Beyond this, price left and came back — a
                     # genuinely new zone, not a re-worked level. Loosely tracks the ~2-day fresh window.


def _first_tap(candles: list[Candle], zone: Zone) -> int | None:
    for j in range(zone.ifc_index + 1, len(candles)):
        c = candles[j]
        if zone.direction == "demand" and c.low  <= zone.top:
            return j
        if zone.direction == "supply" and c.high >= zone.bottom:
            return j
    return None


def level_pre_mitigated(candles: list[Candle], zone: Zone, all_zones: list[Zone]) -> bool:
    """Was this zone's PRICE LEVEL already worked SHORTLY BEFORE it formed (same consolidation)?

    Freshness is otherwise keyed to a single IFC — `_first_tap` only looks AFTER `zone.ifc_index`. So a
    newer zone born at a level price has ALREADY swept reads "fresh" when its resting orders are gone.
    We prove the level was worked by an OLDER same-direction zone that (a) overlaps it — its proximal
    sits inside this zone's range — and (b) was first-tapped inside [zone.ifc − _LEVEL_WINDOW, this
    zone's own first tap): i.e. the same swing, not an ancient revisit. That earlier tap is a tap of the
    same level, before this zone's "fresh" tap. (fix 2026-07-20: EUR/USD fired a "fresh" 14-Jul demand
    [1.13838-1.14055] that an overlapping 13-Jul demand had already been tapped through 6 times — the
    wicks the user marked. An ancient overlap from weeks earlier, price having left and returned, does
    NOT suppress — that is a genuinely new zone.)
    """
    ft = _first_tap(candles, zone)
    if ft is None:
        return False
    for z in all_zones:
        if z.direction != zone.direction or z.ifc_index >= zone.ifc_index:
            continue                                       # only strictly OLDER same-direction zones
        if not (zone.bottom <= z.proximal <= zone.top):
            continue                                       # must sit at the SAME level (overlap)
        zft = _first_tap(candles, z)
        if zft is not None and zft < ft and zft >= zone.ifc_index - _LEVEL_WINDOW:
            return True                                    # overlapping level worked in the same swing
    return False
