"""PIX — THE REAL ZONES: the ones price left and travelled from all the way to ANOTHER zone (his rule, 18 Nov 2026).

His words:
  * *"We are only trading zones where price originated from and tapped another zone before coming back. That is the real
    zone. a zone that made price to travel to another zone. These are always the bigger zones. So in other words we are
    not trading zones without FVG candles."*
  * *"If we are trending, we look for zones in the direction of the trend not against and the zones near the money."*
  * *"It is day trading strategy; it can't wait for 3 days for a zone to be tapped."*
  * *"We are looking for zones that have been respected and the once that have not been respected."* — a touched zone
    stays; only a zone price has CLOSED THROUGH is dead.

HOW IT IS READ (my reading where he gave no detail — `docs/strategies/pix.md`):
  * Every zone is the candle before a three-candle gap (`pix_zones.find_zones`), so none is without a gap.
  * "Another zone" = an OPPOSITE zone on the SAME timeframe — supply above a demand origin, demand below a supply
    origin — that already EXISTED when price got there (its gap complete). "Tapped" = a candle from the origin's own
    gap onward reached into it (high to its bottom / low to its top) and the zone was STILL STANDING when that candle
    closed. A zone the move closed straight through did not stop price, so price did not travel TO it.
  * This replaced my own two tests of the same day (4 straight closes; a gap above the recent median), which he
    corrected with the rule above. They are deleted, not kept beside it.

Everything here reads CLOSED candles only: a level must never move while its candle is still forming.
"""
from __future__ import annotations

from dataclasses import dataclass

from core.types import Candle
from strategies.pix_candles import closed_only
from strategies.pix_profile import touching
from strategies.pix_zones import Zone, break_index, find_zones

ATR_LEN       = 14     # "near the money" = within one average DAILY range (14 days) of price
NEAR_ATR_MULT = 1.0


@dataclass
class BigZone:
    tf:         str      # "4H" | "1H"
    zone:       Zone
    time:       int      # open time of the zone's gap candle — names the zone uniquely
    reached:    Zone     # the opposite zone price travelled to
    reached_at: int      # time of the candle that tapped it
    dist:       float    # price distance from the zone's near edge (0 when price is inside)


def daily_atr(d1: list[Candle], n: int = ATR_LEN) -> float | None:
    """Average true range of the last `n` CLOSED days; None if there are not enough."""
    c = closed_only(d1 or [])
    if len(c) < n + 1:
        return None
    trs = [max(c[k].high - c[k].low, abs(c[k].high - c[k - 1].close), abs(c[k].low - c[k - 1].close))
           for k in range(len(c) - n, len(c))]
    return sum(trs) / n


def travelled_to(closed: list[Candle], zone: Zone, others: list[Zone]) -> tuple[Zone, int] | None:
    """The first opposite zone price TAPPED after `zone` formed, and the index of the candle that tapped it."""
    demand = zone.direction == "demand"
    targets = [o for o in others if o.direction != zone.direction
               and (o.bottom > zone.top if demand else o.top < zone.bottom)]
    for j in range(zone.ifc_index, len(closed)):                # the move starts with the gap's own candle
        c = closed[j]
        for o in targets:
            if o.ifc_index + 1 >= j:                             # it did not exist yet when this candle traded
                continue
            if (c.high >= o.bottom) if demand else (c.low <= o.top):
                # STILL STANDING after the candle that reached it closed. A zone that candle closed straight through
                # did not stop price — price went beyond it, not TO it.
                b = break_index(closed, o)
                if b is None or b > j:
                    return o, j
    return None


def big_zones(candles: list[Candle], tf: str, want: str, price: float, reach: float) -> list[BigZone]:
    """Every REAL (travelled-from), UNBROKEN `want` zone within `reach` of price on this timeframe, nearest first.

    Demand must sit at or below price (price inside counts as distance 0); supply at or above.
    """
    closed = closed_only(candles)
    zones = find_zones(candles)
    out: list[BigZone] = []
    for z in zones:
        if z.direction != want or break_index(candles, z) is not None:
            continue
        if want == "demand":
            if z.bottom > price:
                continue                       # a demand zone above price is not support for a buy
            dist = max(0.0, price - z.top)
        else:
            if z.top < price:
                continue
            dist = max(0.0, z.bottom - price)
        if dist > reach:
            continue
        hit = travelled_to(closed, z, zones)
        if hit is None:
            continue                           # price never travelled from it to another zone
        out.append(BigZone(tf, z, closed[z.ifc_index].time, hit[0], closed[hit[1]].time, dist))
    return sorted(out, key=lambda b: b.dist)


TF_S = {"5M": 300, "1H": 3600, "4H": 14400}


def _inside(z, outer) -> bool:
    """Does the 5M zone sit inside (overlap) the higher-timeframe zone's range?"""
    return z.bottom <= outer.top and z.top >= outer.bottom


def candidates(h4, h1, m5, want: str, price: float, reach: float,
               profile=None) -> list[tuple[BigZone, BigZone | None]]:
    """HIS ORDER (18 Nov 2026): *"our main interest when marking zones is 5mins and if we get a zone there that is in
    1HR zone or 4HR zone and near the money, the better"* · *"mostly we mark zones in 1HR and look for them in 5min"* ·
    *"We can also look for zones in 5m so long as they dont go against the trend"*. So:
      1. 5M zones INSIDE a 1H / 4H zone of the same side (the best), nearest first;
      2. the 1H / 4H zones themselves, nearest first;
      3. 5M zones on their own, nearest first.
    Each entry is (zone, the higher-timeframe zone it sits inside or None). Within each group a zone with the volume
    profile's POC / VAH / VAL inside it or at its edge comes first (his "good confluence"), then the nearest."""
    htf = big_zones(h1, "1H", want, price, reach) + big_zones(h4, "4H", want, price, reach)
    m5z = big_zones(m5, "5M", want, price, reach)
    inside, alone = [], []
    for z in m5z:
        outer = next((o for o in sorted(htf, key=lambda o: o.dist) if _inside(z.zone, o.zone)), None)
        (inside if outer else alone).append((z, outer))
    by = lambda pair: (0 if touching(profile, pair[0].zone.bottom, pair[0].zone.top) else 1, pair[0].dist)  # noqa: E731
    return sorted(inside, key=by) + sorted(((o, None) for o in htf), key=by) + sorted(alone, key=by)
