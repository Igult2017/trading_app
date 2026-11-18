"""OVP — HIS BIG ZONES, near the money, in the 4H trend's direction (his skeleton, 18 Nov 2026).

His rules, in his words (docs/strategies/ovp.md has them in full):
  * *"Only focus on big zones not small ones. Big zones means ones with bigger FVG IFc."*
  * *"The gap is just generally big not some miniature gaps that can never be respected … the gaps that the price had
    left behind and travelled many candles not 1 or three candles gap. One or 2 or three candles gap are only for
    re-tap."*
  * *"If we are trending, we look for zones in the direction of the trend not against and the zones near the money."*
  * *"It is day trading strategy; it can't wait for 3 days for a zone to be tapped."*
  * *"We are looking for zones that have been respected and the once that have not been respected."* — so a touched
    zone stays; only a zone price has CLOSED THROUGH is dead.

The numbers below are MY reading where he gave none. Each is one named constant he can change in one line.

A zone is the candle before a three-candle gap (the "IFC"), marked by OVP's own `ovp_zones.find_zones`. Everything here
reads CLOSED candles only: a level must never move while its candle is still forming.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median

from core.types import Candle
from shared.mtf_utils import closed_only
from strategies.ovp_zones import Zone, break_index, find_fvgs, find_zones

MIN_RUN        = 4      # the move that left the gap ran at least 4 closes one way ("not 1 or 3 candles")
GAP_LOOKBACK   = 100    # "big" = taller than the MEDIAN gap of the last 100 gaps on the same timeframe
MIN_PRIOR_GAPS = 20     # fewer earlier gaps than this = too little history to judge "big" → not used
ATR_LEN        = 14     # "near the money" = within one average DAILY range (14 days) of price
NEAR_ATR_MULT  = 1.0


@dataclass
class BigZone:
    tf:     str          # "4H" | "1H"
    zone:   Zone
    time:   int          # open time of the gap's middle candle — names the zone uniquely
    run:    int          # closes the move travelled one way from the gap
    gap:    float        # gap height in price
    median: float        # the median gap it beat
    dist:   float        # price distance from the zone's near edge (0 when price is inside)


def run_length(closed: list[Candle], i: int, bull: bool) -> int:
    """How many CONSECUTIVE closes, starting at the gap's middle candle, each moved further the gap's way."""
    n, j = 0, i
    while j < len(closed) and j >= 1:
        moved = closed[j].close > closed[j - 1].close if bull else closed[j].close < closed[j - 1].close
        if not moved:
            break
        n, j = n + 1, j + 1
    return n


def is_big(heights_before: list[float], height: float, run: int) -> tuple[bool, float]:
    """His two tests together: the move travelled (`MIN_RUN`) AND the gap beats the recent median."""
    prior = heights_before[-GAP_LOOKBACK:]
    if len(prior) < MIN_PRIOR_GAPS:
        return False, 0.0
    med = median(prior)
    return (run >= MIN_RUN and height > med), med


def daily_atr(d1: list[Candle], n: int = ATR_LEN) -> float | None:
    """Average true range of the last `n` CLOSED days; None if there are not enough."""
    c = closed_only(d1 or [])
    if len(c) < n + 1:
        return None
    trs = [max(c[k].high - c[k].low, abs(c[k].high - c[k - 1].close), abs(c[k].low - c[k - 1].close))
           for k in range(len(c) - n, len(c))]
    return sum(trs) / n


def big_zones(candles: list[Candle], tf: str, want: str, price: float, reach: float) -> list[BigZone]:
    """Every BIG, UNBROKEN `want` zone ("demand"/"supply") on this timeframe within `reach` of price, nearest first.

    Demand must sit at or below price (price inside counts as distance 0); supply at or above.
    """
    closed = closed_only(candles)
    fvgs = find_fvgs(closed)
    heights = {f.index: f.top - f.bottom for f in fvgs}
    order = [f.index for f in fvgs]
    out: list[BigZone] = []
    for z in find_zones(candles):
        if z.direction != want:
            continue
        bull = want == "demand"
        before = [heights[k] for k in order if k < z.ifc_index]
        run = run_length(closed, z.ifc_index, bull)
        ok, med = is_big(before, heights.get(z.ifc_index, 0.0), run)
        if not ok or break_index(candles, z) is not None:
            continue
        if bull:
            if z.bottom > price:
                continue                       # a demand zone above price is not support for a buy
            dist = max(0.0, price - z.top)
        else:
            if z.top < price:
                continue
            dist = max(0.0, z.bottom - price)
        if dist > reach:
            continue
        out.append(BigZone(tf, z, closed[z.ifc_index].time, run, heights[z.ifc_index], med, dist))
    return sorted(out, key=lambda b: b.dist)
