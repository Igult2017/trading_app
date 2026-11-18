"""PIX — HIS SKELETON, top to bottom (18 Nov 2026). Pure functions on candles; `pix.py` only feeds them.

  4H  is the market trending? (`pix_setup.regime`). Trending → zones in the trend's direction only.
  4H + 1H  the BIG zones near the money that line up with that trend (`pix_bigzones`).
  5M  price taps one of them and is RESPECTED: a 5M candle closes back out of the zone the trade's way.
      ⚠ INTERIM. His respect test is order flow (footprint delta, absorption / initiation, CVD divergence) —
      that is the next build and replaces `respected_5m`. Until then the close back out is the test.
  1M  a STOP ORDER at the last closed 1M candle's high (buy) / low (sell); stop beyond the zone's far edge
      (plus the spread on a sell); target 3R — *"Let's target 3R"*.
  RANGING 4H → 5M support / resistance: *"wait for it being respected once then when it respects it again, we take
      trade but we use stop order"*, and only *"when they can give use 2R and above"*.

Nothing here reads the still-forming candle as a level. `price` is the CURRENT MID price (the live quote, else the
last 1M close) and is used only as a trigger: near-the-money distance, and a buy stop must sit above the ask (mid +
half the spread), a sell stop below the bid.
"""
from __future__ import annotations

from dataclasses import dataclass

from core.types import Candle
from strategies.pix_candles import closed_only
from strategies.pix_swings import find_swings
from strategies.pix_bigzones import BigZone, big_zones, daily_atr, NEAR_ATR_MULT
from strategies.pix_trend import regime

TAP_WINDOW_M5 = 12     # the tap must be within the last hour of 5M candles
TARGET_R      = 3.0
RANGE_MIN_R   = 2.0    # a support / resistance trade needs at least 2R of room to the opposite level
SR_PIVOT      = 3      # a 5M swing high/low = the highest/lowest of 3 candles each side (its first respect)
SR_LOOKBACK   = 200    # 5M candles searched for those levels (~16 hours)
SR_TOL_ATR    = 0.25   # a level is a band ± a quarter of the 5M average range


@dataclass
class Plan:
    direction: str       # "buy" | "sell"
    path:      str       # "zone" | "range"
    tf:        str       # where the level came from: "4H" / "1H" / "5M"
    top:       float
    bottom:    float
    entry:     float
    sl:        float
    tp:        float
    rr:        float
    level_at:  int       # time of the zone's gap candle / the S/R pivot
    tap_at:    int       # time of the 5M candle that tapped it
    why:       list[str]


def respected_5m(m5: list[Candle], top: float, bottom: float, bull: bool) -> int | None:
    """Time of the tap if the LAST closed 5M candle is the FIRST close back out of the band the trade's way.

    The tap is the most recent candle within `TAP_WINDOW_M5` that reached into the band; from it on nothing may
    close beyond the far edge, and nothing before the last candle may already have closed back out (that respect
    was earlier — this one is stale)."""
    c = closed_only(m5)[-TAP_WINDOW_M5:]
    if not c:
        return None
    taps = [k for k, x in enumerate(c) if (x.low <= top if bull else x.high >= bottom)]
    if not taps:
        return None
    # THE VISIT starts at the FIRST of the run of candles that reached into the band. Starting at the latest touch
    # let a candle that closed THROUGH the zone be forgotten the moment the next candle dipped in and closed back out.
    t = taps[-1]
    while t - 1 >= 0 and (t - 1) in taps:
        t -= 1
    seg = c[t:]
    if any((x.close < bottom if bull else x.close > top) for x in seg):
        return None
    if any((x.close > top if bull else x.close < bottom) for x in seg[:-1]):
        return None
    last = seg[-1]
    return c[t].time if (last.close > top if bull else last.close < bottom) else None


def entry_1m(m1: list[Candle], bull: bool, sl: float, price: float) -> float | None:
    """Stop-order price off the last CLOSED 1M candle, or None if it would not be a valid stop order now."""
    c = closed_only(m1)
    if not c:
        return None
    e = c[-1].high if bull else c[-1].low
    if (bull and (e <= sl or price >= e)) or (not bull and (e >= sl or price <= e)):
        return None                    # stop on the wrong side, or the market is already through the entry
    return e


def _atr(c: list[Candle], n: int = 14) -> float:
    c = c[-(n + 1):]
    if len(c) < 2:
        return 0.0
    return sum(max(c[k].high - c[k].low, abs(c[k].high - c[k - 1].close), abs(c[k].low - c[k - 1].close))
               for k in range(1, len(c))) / (len(c) - 1)


def _levels(m5c: list[Candle], bull: bool):
    """5M swing lows (support) or highs (resistance), as (price, time)."""
    pts = find_swings(m5c, n=SR_PIVOT)
    return [(p.price, m5c[p.index].time) for p in pts if p.is_high != bull]


def zone_plan(h4, h1, m5, m1, price: float, spread: float, d1) -> tuple[Plan | None, str]:
    """The trending path. Returns (plan, why-not)."""
    trend = regime(h4)
    if trend == 0:
        return None, "4H ranging — zone path off, support/resistance path instead"
    bull = trend > 0
    atr = daily_atr(d1)
    if atr is None:
        return None, "not enough daily candles to measure 'near the money'"
    want = "demand" if bull else "supply"
    zones: list[BigZone] = (big_zones(h4, "4H", want, price, atr * NEAR_ATR_MULT)
                            + big_zones(h1, "1H", want, price, atr * NEAR_ATR_MULT))
    if not zones:
        return None, f"4H {'up' if bull else 'down'}trend — no big {want} zone within a day's range"
    for bz in sorted(zones, key=lambda b: b.dist):
        z = bz.zone
        tap = respected_5m(m5, z.top, z.bottom, bull)
        if tap is None:
            continue
        sl = z.bottom if bull else z.top + spread
        e = entry_1m(m1, bull, sl, price + (spread / 2 if bull else -spread / 2))   # a buy fills on the ask
        if e is None:
            continue
        risk = abs(e - sl)
        tp = e + TARGET_R * risk if bull else e - TARGET_R * risk
        why = [f"4H {'UP' if bull else 'DOWN'}TREND — trading with it only",
               f"REAL {bz.tf} {want} zone {round(z.bottom, 5)}–{round(z.top, 5)}: price left it and travelled to the "
               f"{bz.reached.direction} zone {round(bz.reached.bottom, 5)}–{round(bz.reached.top, 5)} before coming back",
               "5M: tapped and closed back out of the zone (order-flow check comes next)",
               f"1M stop order at the last closed candle's {'high' if bull else 'low'}; stop beyond the zone; 3R"]
        return Plan("buy" if bull else "sell", "zone", bz.tf, z.top, z.bottom, e, sl, tp, TARGET_R,
                    bz.time, tap, why), ""
    return None, f"{len(zones)} big {want} zone(s) near price — none tapped and respected on 5M yet"


def range_plan(h4, m5, m1, price: float, spread: float) -> tuple[Plan | None, str]:
    """Support / resistance on 5M: the 2nd respect, stop order, ≥2R room. In a trend, the trend's side only."""
    trend = regime(h4)
    sides = [True, False] if trend == 0 else [trend > 0]
    m5c = closed_only(m5)[-SR_LOOKBACK:]
    tol = _atr(m5c) * SR_TOL_ATR
    if len(m5c) < 4 * SR_PIVOT or tol <= 0:
        return None, "not enough 5M candles for support/resistance"
    # the level must have been CONFIRMED (its 3 candles after) before the tap window opened
    recent = m5c[-TAP_WINDOW_M5 - SR_PIVOT].time
    for bull in sides:
        lv = [(p, t) for p, t in _levels(m5c, bull) if t < recent]          # respected once, BEFORE this tap
        opp = [p for p, _ in _levels(m5c, not bull)]
        for p, t in sorted(lv, key=lambda x: abs(price - x[0])):
            top, bot = p + tol, p - tol
            tap = respected_5m(m5c, top, bot, bull)
            if tap is None:
                continue
            sl = bot if bull else top + spread
            e = entry_1m(m1, bull, sl, price + (spread / 2 if bull else -spread / 2))   # a buy fills on the ask
            if e is None:
                continue
            risk = abs(e - sl)
            room = [q - e for q in opp if q > e] if bull else [e - q for q in opp if q < e]
            if not room or min(room) < RANGE_MIN_R * risk:
                continue
            rr = min(TARGET_R, min(room) / risk)
            tp = e + rr * risk if bull else e - rr * risk
            why = [f"4H {'RANGING' if trend == 0 else ('UPTREND' if trend > 0 else 'DOWNTREND')} — 5M "
                   f"{'support' if bull else 'resistance'} {round(p, 5)} respected before, respected again now",
                   f"Room to the opposite level {min(room) / risk:.1f}R (needs {RANGE_MIN_R:.0f}R)",
                   f"1M stop order at the last closed candle's {'high' if bull else 'low'}; target {rr:.1f}R"]
            return Plan("buy" if bull else "sell", "range", "5M", top, bot, e, sl, tp, round(rr, 2),
                        t, tap, why), ""
    return None, "no 5M support/resistance on its 2nd respect with 2R of room"
