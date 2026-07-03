"""
BX-S/D — Report ②: respected 4H zone → retest → 1M/5M-aligned CONFIRMED entry (priority).

The book's highest-quality entry: price REACTS from a 4H zone (respects it), moves away, then
PULLS BACK to retest it. At the retest we watch the 4H zone and the entry TF simultaneously and
only fire once the entry TF (1M or 5M — whichever is clearer) confirms an aligned entry.

  is_respected_retest — zone mitigated, price body-moved away >= the zone's own height (a genuine
                        reaction, not a wick), then returned to retest within the recent window.
  confirm_retest      — runs the confluence + entry trigger on 5M AND 1M against the retested zone
                        and returns the CLEARER confirmed entry (better RR), or None.

Reuses BX's own primitives (zones, structure, liquidity, confluence, entry trigger).
"""
from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_structure import map_structure
from strategies.bx_sd_setup import _first_tap, SetupResult
from strategies.bx_sd_confluence import premium_discount, fib_target
from strategies.bx_sd_ltf import ltf_confluence
from strategies.bx_sd_entry import entry_trigger


def is_respected_retest(h4: list[Candle], zone: Zone, pip: float = 0.0001,
                        recent: int = 6, react_mult: float = 1.0) -> bool:
    """True when `zone` was respected (a real reaction away) and price is now retesting it."""
    t1 = _first_tap(h4, zone)
    if t1 is None:
        return False
    demand = zone.direction == "demand"
    react  = react_mult * (zone.top - zone.bottom)          # a genuine reaction = >= 1 zone height
    away   = None
    for j in range(t1 + 1, len(h4)):                        # body move away = respected (not a wick)
        if demand and h4[j].close >= zone.top + react:
            away = j; break
        if not demand and h4[j].close <= zone.bottom - react:
            away = j; break
    if away is None:
        return False
    for j in range(away + 1, len(h4)):                      # returned to retest, recently
        tapped = (h4[j].low <= zone.top) if demand else (h4[j].high >= zone.bottom)
        if tapped and j >= len(h4) - recent:
            return True
    return False


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
    """A SHALLOW continuation pullback: price recently tapped the FVG but stayed ABOVE the zone origin
    (a demand never fully retested), and the latest bar is back on the trend side of the FVG."""
    demand = zone.direction == "demand"
    lo = max(fvg.ifc_index + 1, len(h4) - recent)
    tapped = any((h4[j].low <= fvg.top and h4[j].low > zone.top) if demand
                 else (h4[j].high >= fvg.bottom and h4[j].high < zone.bottom)
                 for j in range(lo, len(h4)))
    cont = (h4[-1].close > fvg.bottom) if demand else (h4[-1].close < fvg.top)
    return tapped and cont


def _setup_for_zone(h4: list[Candle], zone: Zone, pip: float) -> SetupResult:
    """A minimal SetupResult so the retested zone can reuse ltf_confluence + entry_trigger."""
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


def confirm_retest(zone: Zone, h4: list[Candle], m5: list[Candle], m1: list[Candle],
                   pip: float = 0.0001, min_rr: float = 2.0):
    """Watch the entry TFs at the retest: run confluence + trigger on 5M AND 1M and return the
    CLEARER confirmed entry (higher RR) as (trigger, confluence, tf_label), else None. Pro-trend +
    confirmed still required (the zone direction must match the confirmed 4H trend)."""
    want = "up" if zone.direction == "demand" else "down"
    if map_structure(h4).pro_trend() != want:
        return None
    setup = _setup_for_zone(h4, zone, pip)
    best = None
    for entry_tf, label in ((m5, "5M"), (m1, "1M")):
        if len(entry_tf) < 20:
            continue
        conf = ltf_confluence(setup, entry_tf, pip)
        if not conf.passed:
            continue
        trig = entry_trigger(conf, setup, entry_tf, h4, pip, min_rr)
        if trig.triggered and (best is None or trig.rr > best[0].rr):
            best = (trig, conf, label, setup)
    return best
