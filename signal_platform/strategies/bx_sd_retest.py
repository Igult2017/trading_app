"""
BX-S/D — retest & continuation CANDIDATE detectors (the confirm + grade is shared, bx_sd_confirm).

  retapped_now  — a MITIGATED 4H zone RE-TAPPED now WITH strong evidence it was RESPECTED (first tap
                  OLD, then a real reaction away = the respect, not closed through, back inside now).
                  No reaction = not respected = not considered. Everything revolves around the
                  UNMITIGATED zone; a mitigated one is re-traded only when it clearly held, and then
                  only at B/A (confirm_grade) — a mitigated zone must EARN its re-entry with MTF
                  confluence, never bare C.
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


def retapped_now(h4: list[Candle], zone: Zone, recent: int = 6, react_mult: float = 1.0) -> bool:
    """A MITIGATED 4H zone RE-TAPPED now WITH strong evidence it was RESPECTED. Everything revolves
    around the UNMITIGATED zone; a mitigated one is re-traded ONLY when it clearly held: its first tap
    is OLD (already mitigated — not the fresh cascade's job), price then REACTED away by >= one
    zone-height (a body move, not a wick — the RESPECT), the zone has NOT closed through, and price is
    back inside it now. No reaction = not respected = NOT considered. (Final proof is the 1M/5M entry.)"""
    ft = _first_tap(h4, zone)
    if ft is None or ft >= len(h4) - recent:        # never tapped, or FRESH (the core cascade's job)
        return False
    if zone_broken(h4, zone):                        # a zone price CLOSED through is dead
        return False
    demand = zone.direction == "demand"
    react  = react_mult * (zone.top - zone.bottom)
    respected = any((h4[j].close >= zone.top + react) if demand else (h4[j].close <= zone.bottom - react)
                    for j in range(ft + 1, len(h4)))   # STRONG respect: a real reaction away after the tap
    if not respected:
        return False
    return any((h4[j].low <= zone.top) if demand else (h4[j].high >= zone.bottom)
               for j in range(len(h4) - recent, len(h4)))   # price back inside the zone now


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
