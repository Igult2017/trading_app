"""
BX-S/D — retest & continuation CANDIDATE detectors (the confirm + grade is shared, bx_sd_confirm).

  retapped_now  — a MITIGATED but still-alive MAJOR zone being RE-TAPPED now: its first tap is OLD
                  (already mitigated, so NOT the fresh cascade's job) and price is back inside it. The
                  "respected again" proof is the 1M/5M confirmation entry (confirm_grade), which the
                  retest path requires at B/A — a mitigated zone must EARN its re-entry with MTF
                  confluence, never bare C. This REPLACES the old is_respected_retest (move a full
                  zone-height away then return), which wrongly traded already-mitigated zones as fresh.
  fvg_zone / is_fvg_tap — the book's CONTINUATION entry: price taps the FRESH imbalance the impulse
                  left and continues, instead of fully retesting the zone.
  _setup_for_zone — a minimal SetupResult so a retest/continuation zone reuses the shared cascade.

Reuses BX's own primitives only.
"""
from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_zones import Zone, zone_broken
from strategies.bx_sd_setup import _first_tap, SetupResult
from strategies.bx_sd_confluence import premium_discount, fib_target


def retapped_now(h4: list[Candle], zone: Zone, recent: int = 6) -> bool:
    """A MITIGATED but still-alive zone being RE-TAPPED now: first tap is OLD (already mitigated — not
    the fresh cascade's job), price is back inside it within the last `recent` bars, and it has NOT
    closed through. Finds the candidate only; the 'respected again' proof is the 1M/5M entry."""
    ft = _first_tap(h4, zone)
    if ft is None or ft >= len(h4) - recent:        # never tapped, or FRESH (first tap is the recent one)
        return False
    if zone_broken(h4, zone):                        # a zone price CLOSED through is dead
        return False
    demand = zone.direction == "demand"
    return any((h4[j].low <= zone.top) if demand else (h4[j].high >= zone.bottom)
               for j in range(len(h4) - recent, len(h4)))


def fvg_zone(h4: list[Candle], zone: Zone) -> Zone | None:
    """The IMBALANCE (FVG) the zone's impulse left, as a Zone — a SHALLOWER POI than the zone origin.
    Book 'continuation entry': price often just taps this FVG and continues instead of fully retesting
    the zone. Demand = bullish gap [candle[ifc-1].high, candle[ifc+1].low]; supply mirrors it."""
    i = zone.ifc_index
    if i - 1 < 0 or i + 1 >= len(h4):
        return None
    if zone.direction == "demand":
        bottom, top = h4[i - 1].high, h4[i + 1].low
        prox, dist = top, bottom
    else:
        bottom, top = h4[i + 1].high, h4[i - 1].low
        prox, dist = bottom, top
    if top <= bottom:
        return None
    return Zone(zone.direction, top, bottom, prox, dist, (top + bottom) / 2.0, zone.origin_index, i, False)


def is_fvg_tap(h4: list[Candle], zone: Zone, fvg: Zone, recent: int = 6) -> bool:
    """A SHALLOW continuation pullback on a FRESH FVG: price's FIRST tap of the FVG is recent (the book
    enters continuations "targeting the next UNMITIGATED supply", Ch.9 p48 — the imbalance must be
    unmitigated, not re-tapped), that first tap stayed ABOVE the zone origin (a demand never fully
    retested), and the latest bar is back on the trend side of the FVG."""
    demand = zone.direction == "demand"
    ft = None
    for j in range(fvg.ifc_index + 1, len(h4)):             # the FIRST tap (mitigation) of the FVG
        if (h4[j].low <= fvg.top) if demand else (h4[j].high >= fvg.bottom):
            ft = j; break
    if ft is None or ft < len(h4) - recent:                 # the FVG must be FRESH — first tap is recent
        return False
    shallow = (h4[ft].low > zone.top) if demand else (h4[ft].high < zone.bottom)  # didn't reach the zone
    cont    = (h4[-1].close > fvg.bottom) if demand else (h4[-1].close < fvg.top)
    return shallow and cont


def _setup_for_zone(h4: list[Candle], zone: Zone, pip: float) -> SetupResult:
    """A minimal SetupResult so a retest/continuation zone can reuse the shared confirm + grade."""
    buy = zone.direction == "demand"
    pts   = find_swing_points(h4)
    highs = [p.price for p in pts if p.is_high]
    lows  = [p.price for p in pts if not p.is_high]
    if highs and lows:
        leg_low, leg_high = min(lows[-1], highs[-1]), max(lows[-1], highs[-1])
    else:
        leg_low, leg_high = zone.bottom, zone.top
    d = "buy" if buy else "sell"
    r = SetupResult(active=True, direction=d, zone=zone)
    r.tp1 = fib_target(leg_low, leg_high, d, 0.272)
    r.tp2 = fib_target(leg_low, leg_high, d, 0.618)
    r.confluences = {"pricing": premium_discount(leg_low, leg_high, h4[-1].close),
                     "pro_trend": "up" if buy else "down"}
    return r
