"""
BX-S/D — a minimal SetupResult for a zone off the book, so the retest path reuses the shared cascade.

What used to live here is gone, and why:
  retapped_now          -> the registry's `respected` state. It re-derived the first tap, the reaction
                           and the break on every call; the zone book already tracks all three.
  fvg_zone / is_fvg_tap -> REMOVED 2026-07-27. They wrapped a raw imbalance as a Zone so the
                           continuation path could enter off it. BX trades supply and demand zones
                           only — an imbalance QUALIFIES a zone, it is never a level to trade.
"""
from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_zones import Zone
from strategies.bx_sd_registry import build as build_registry
from strategies.bx_sd_control import control, describe, phrase
from strategies.bx_sd_setup import SetupResult
from strategies.bx_sd_confluence import premium_discount, fib_target


def _setup_for_zone(h4: list[Candle], zone: Zone, pip: float, book=None) -> SetupResult:
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
    side = control(book if book is not None else build_registry(h4, pip))
    r.confluences = {"pricing": premium_discount(leg_low, leg_high, h4[-1].close),
                     "control": describe(side, zone.direction),
                     "control_phrase": phrase(side, zone.direction)}
    return r
