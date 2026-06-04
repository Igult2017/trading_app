"""
Supply and demand zone detection from candle sequences.
"""

from core.types import Candle, Zone, ZoneType
from shared.candle_math import body_size, avg_body, is_bullish, is_bearish


def find_zones(candles: list[Candle], timeframe: str,
               impulse_threshold: float = 1.8) -> list[Zone]:
    """
    Scan candles for supply and demand zones.
    timeframe is any string e.g. "M15", "H4", "D1".
    """
    if len(candles) < 5:
        return []

    avg = avg_body(candles, n=14)
    if avg == 0:
        return []

    zones: list[Zone] = []
    for i in range(2, len(candles) - 1):
        c = candles[i]
        ratio = body_size(c) / avg

        if ratio >= impulse_threshold:
            base = candles[i - 1]
            zone_type = ZoneType.DEMAND if is_bullish(c) else ZoneType.SUPPLY
            zones.append(Zone(
                type=zone_type,
                top=max(base.open, base.close),
                bottom=min(base.open, base.close),
                timeframe=timeframe,
                formed_at=i,
            ))

    _mark_mitigated(zones, candles)
    return zones


def _mark_mitigated(zones: list[Zone], candles: list[Candle]) -> None:
    for zone in zones:
        for c in candles[zone.formed_at + 1:]:
            if zone.type == ZoneType.DEMAND and c.low <= zone.top:
                zone.mitigated = True
                break
            if zone.type == ZoneType.SUPPLY and c.high >= zone.bottom:
                zone.mitigated = True
                break


def unmitigated(zones: list[Zone]) -> list[Zone]:
    return [z for z in zones if not z.mitigated]
