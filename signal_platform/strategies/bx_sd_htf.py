"""
BX-S/D — higher-timeframe confluence (report enrichment).

The 4H zone is the reporting unit; the Daily / Weekly / Monthly zones are CONTEXT, not separate
alerts. A 4H zone that FALLS WITHIN a same-direction D1/W1/MN supply/demand zone is a premium,
HTF-backed zone — the 4H report is tagged with that backing and its priority is raised.

Reuses only BX's own find_zones — no other strategy's logic.
"""
from core.types import Candle
from strategies.bx_sd_zones import find_zones, Zone

_MIN_BARS = 20   # a TF needs enough candles for a meaningful zone map


def _overlaps(a: Zone, b: Zone) -> bool:
    return a.bottom <= b.top and b.bottom <= a.top


def htf_zone_map(candles_by_label: dict[str, list[Candle]]) -> dict[str, list[Zone]]:
    """{'Daily': [zones], 'Weekly': [...], 'Monthly': [...]} — only TFs with enough history."""
    return {label: find_zones(cs) for label, cs in candles_by_label.items() if len(cs) >= _MIN_BARS}


def htf_backing(zone: Zone, htf_map: dict[str, list[Zone]]) -> list[str]:
    """Labels of the higher TFs whose SAME-DIRECTION zone the 4H zone falls within (overlaps)."""
    out: list[str] = []
    for label, zones in htf_map.items():
        if any(hz.direction == zone.direction and _overlaps(zone, hz) for hz in zones):
            out.append(label)
    return out
