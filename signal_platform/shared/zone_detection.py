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
            # Bug 5 fix: mitigation requires a close FULLY THROUGH the zone.
            # A close into the zone (even 99% of the way) does not consume the orders —
            # the zone is only empty when price exits the other side.
            # DEMAND zone bottom = where buy orders sit; fully mitigated when close < bottom.
            # SUPPLY zone top    = where sell orders sit; fully mitigated when close > top.
            if zone.type == ZoneType.DEMAND and c.close < zone.bottom:
                zone.mitigated = True
                break
            if zone.type == ZoneType.SUPPLY and c.close > zone.top:
                zone.mitigated = True
                break


def unmitigated(zones: list[Zone]) -> list[Zone]:
    return [z for z in zones if not z.mitigated]


def find_fvg_zones(candles: list[Candle], timeframe: str = "") -> list[Zone]:
    """
    Detect Fair Value Gaps (FVGs) — 3-candle imbalances where the middle
    candle's move left a price gap between candle[i-1]'s wick and
    candle[i+1]'s wick that price has not yet returned to fill.

    Bullish FVG (demand): candle[i-1].high < candle[i+1].low
      — upward impulse left a gap below; demand zone = [c[i-1].high, c[i+1].low]
    Bearish FVG (supply): candle[i-1].low  > candle[i+1].high
      — downward impulse left a gap above; supply zone = [c[i+1].high, c[i-1].low]

    Mitigation: price closes FULLY THROUGH the gap (bottom for demand, top for supply).
    A wick entry or 50% fill does not count — the zone still has unfilled orders.
    """
    zones: list[Zone] = []
    for i in range(1, len(candles) - 1):
        p, n = candles[i - 1], candles[i + 1]

        if p.high < n.low:
            zones.append(Zone(
                type=ZoneType.DEMAND, top=n.low, bottom=p.high,
                timeframe=timeframe, formed_at=i,
            ))
        elif p.low > n.high:
            zones.append(Zone(
                type=ZoneType.SUPPLY, top=p.low, bottom=n.high,
                timeframe=timeframe, formed_at=i,
            ))

    _mark_fvg_mitigated(zones, candles)
    return zones


def _mark_fvg_mitigated(zones: list[Zone], candles: list[Candle]) -> None:
    """
    Demand FVG: mitigated when price closes below the gap's bottom (fully filled).
    Supply FVG: mitigated when price closes above the gap's top (fully filled).
    """
    for zone in zones:
        for c in candles[zone.formed_at + 2:]:
            if zone.type == ZoneType.DEMAND and c.close < zone.bottom:
                zone.mitigated = True
                break
            if zone.type == ZoneType.SUPPLY and c.close > zone.top:
                zone.mitigated = True
                break
