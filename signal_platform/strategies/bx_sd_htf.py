"""
BX-S/D — higher-timeframe confluence (report enrichment).

The 4H zone is the reporting unit; the Daily / Weekly / Monthly zones are CONTEXT, not separate
alerts. A 4H zone that FALLS WITHIN a same-direction D1/W1/MN supply/demand zone is a premium,
HTF-backed zone — the 4H report is tagged with that backing and its priority is raised.

Reuses only BX's own find_zones — no other strategy's logic.
"""
from core.types import Candle
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_registry import build as build_registry, to_zone
from shared.mtf_utils import closed_only

_MIN_BARS = 20   # a TF needs enough candles for a meaningful zone map


def _overlaps(a: Zone, b: Zone) -> bool:
    return a.bottom <= b.top and b.bottom <= a.top


def htf_zone_map(candles_by_label: dict[str, list[Candle]]) -> dict[str, list[Zone]]:
    """{'Daily': [zones], 'Weekly': [...], 'Monthly': [...]} — only TFs with enough history.

    A zone price has CLOSED through is DEAD — EVERYWHERE (settled BX rule), the HTF included: a
    broken Monthly demand is a flipped level, and letting it "back" a 4H zone upgraded setups to
    A-grade on confluence that no longer exists. MITIGATED HTF zones stay — a tapped-but-held
    D1/W1/MN zone is still a real POI, and demanding unmitigated HTF would kill nearly every A."""
    # ONE zone model on every timeframe: D1/W1/MN go through the same registry as the 4H book, so an
    # HTF "zone" means exactly what a 4H zone means — marked once, 3 factors, lifecycle. Previously
    # these were raw find_zones candidates with no validity test at all, which inflated A grades.
    out = {}
    for label, cs in candles_by_label.items():
        if not cs or len(cs) < _MIN_BARS:
            continue
        out[label] = [to_zone(mz, closed_only(cs)) for mz in build_registry(cs) if mz.live]
        out[label] = [z for z in out[label] if z is not None]
    return out


def htf_backing(zone: Zone, htf_map: dict[str, list[Zone]]) -> list[str]:
    """Labels of the higher TFs whose SAME-DIRECTION zone the 4H zone falls within (overlaps)."""
    out: list[str] = []
    for label, zones in htf_map.items():
        if any(hz.direction == zone.direction and _overlaps(zone, hz) for hz in zones):
            out.append(label)
    return out
