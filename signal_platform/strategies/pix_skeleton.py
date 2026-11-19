"""PIX — HIS SKELETON, top to bottom (18 Nov 2026). Pure functions on candles; `pix.py` only feeds them.

  4H  is the market trending? (`pix_trend.regime`). Trending → zones in the trend's direction only.
  4H + 1H  the REAL zones (price travelled from them to another zone) near the money, the trend's side (`pix_bigzones`).
  5M  price taps one of them and is RESPECTED: a 5M candle closes back out of the zone the trade's way — AND the
      ORDER FLOW agrees on 5M and on 1M (`pix_flow.verdict`: no absorption, initiation on the way out, CVD not
      converging), checked by the `flow` callable `pix.py` supplies. No check supplied = no plan.
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
from strategies.pix_entry import TAP_WINDOW_M5, entry_1m, respected_5m
from strategies.pix_bigzones import TF_S, candidates, daily_atr, NEAR_ATR_MULT
from strategies.pix_profile import describe, from_candles, poc_role, touching
from strategies.pix_trend import direction

TARGET_R      = 3.0
RANGE_MIN_R   = 2.0    # a support / resistance trade needs at least 2R of room to the opposite level
SR_PIVOT      = 3      # a 5M swing high/low = the highest/lowest of 3 candles each side (its first respect)
SR_LOOKBACK   = 200    # 5M candles searched for those levels (~16 hours)
SR_TOL_ATR    = 0.25   # a level is a band ± a quarter of the 5M average range
PROFILE_M5    = 288    # the volume profile's window: 288 5M candles = the last day (24 1H candles)


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


def _atr(c: list[Candle], n: int = 14) -> float:
    c = c[-(n + 1):]
    if len(c) < 2:
        return 0.0
    return sum(max(c[k].high - c[k].low, abs(c[k].high - c[k - 1].close), abs(c[k].low - c[k - 1].close))
               for k in range(1, len(c))) / (len(c) - 1)


def _flow(flow, m5, m1, bull: bool, tap: int) -> tuple[bool, list[str]]:
    """The order-flow check, or a refusal when there is none — a plan is never made without it."""
    if flow is None:
        return False, ["no order-flow check supplied"]
    return flow(m5, m1, bull, tap)


def _levels(m5c: list[Candle], bull: bool):
    """5M swing lows (support) or highs (resistance), as (price, time)."""
    pts = find_swings(m5c, n=SR_PIVOT)
    return [(p.price, m5c[p.index].time) for p in pts if p.is_high != bull]


def zone_plan(h4, h1, m5, m1, price: float, spread: float, d1, flow=None) -> tuple[Plan | None, str]:
    """The trending path. Returns (plan, why-not). `flow(m5, m1, bull, tap)` -> (ok, reasons) is the ORDER-FLOW check
    (`pix.py` builds it); without one nothing is planned — no order flow, no trade."""
    trend, src = direction(h4, h1)
    if trend == 0:
        return None, "4H and 1H both ranging — zone path off, support/resistance path instead"
    bull = trend > 0
    atr = daily_atr(d1)
    if atr is None:
        return None, "not enough daily candles to measure 'near the money'"
    want = "demand" if bull else "supply"
    day = closed_only(m5)[-PROFILE_M5:]                             # the volume profile over the last day
    prof = from_candles(day)
    zones = candidates(h4, h1, m5, want, price, atr * NEAR_ATR_MULT, profile=prof)
    if not zones:
        return None, f"{src} {'up' if bull else 'down'}trend — no real {want} zone (5M, 1H or 4H) within a day's range"
    refused: list[str] = []
    for bz, outer in zones:
        z = bz.zone
        tap = respected_5m(m5, z.top, z.bottom, bull)
        # THE TAP MUST COME AFTER PRICE TRAVELLED AWAY (his rule: "tapped another zone BEFORE coming back"). A 5M zone
        # can be minutes old, and its own formation candles must never count as price coming back to it.
        if tap is None or tap < bz.reached_at + TF_S[bz.tf]:
            continue
        sl = z.bottom if bull else z.top + spread                   # beyond the zone actually traded
        e = entry_1m(m1, bull, sl, price + (spread / 2 if bull else -spread / 2), spread)   # a buy fills on the ask
        if e is None:
            continue
        ok, flow_why = _flow(flow, m5, m1, bull, tap)
        if not ok:
            refused.append(flow_why[-1] if flow_why else "order flow refused")
            continue
        risk = abs(e - sl)
        tp = e + TARGET_R * risk if bull else e - TARGET_R * risk
        where = (f" — INSIDE the {outer.tf} {want} zone {round(outer.zone.bottom, 5)}–{round(outer.zone.top, 5)}"
                 if outer else "")
        why = [f"{src} {'UP' if bull else 'DOWN'}TREND — trading with it only",
               f"REAL {bz.tf} {want} zone {round(z.bottom, 5)}–{round(z.top, 5)}{where}: price left it and travelled "
               f"to the {bz.reached.direction} zone {round(bz.reached.bottom, 5)}–{round(bz.reached.top, 5)} "
               f"before coming back",
               "5M: tapped and closed back out of the zone",
               describe(prof, poc_role(day, prof.poc) if prof else "")
               + (f" — {'/'.join(touching(prof, z.bottom, z.top))} AT THIS ZONE (confluence)"
                  if touching(prof, z.bottom, z.top) else ""),
               *flow_why,
               f"1M stop order at the last closed candle's {'high + the spread' if bull else 'low'}; stop beyond the zone; 3R"]
        return Plan("buy" if bull else "sell", "zone", bz.tf, z.top, z.bottom, e, sl, tp, TARGET_R,
                    bz.time, tap, why), ""
    if refused:
        return None, f"order flow said no: {refused[0]}"
    return None, f"{len(zones)} real {want} zone(s) near price — none tapped and respected on 5M yet"


def range_plan(h4, m5, m1, price: float, spread: float, flow=None, h1=None) -> tuple[Plan | None, str]:
    """Support / resistance on 5M: the 2nd respect, stop order, ≥2R room. In a trend, the trend's side only."""
    trend, _ = direction(h4, h1 or [])
    sides = [True, False] if trend == 0 else [trend > 0]
    m5c = closed_only(m5)[-SR_LOOKBACK:]
    tol = _atr(m5c) * SR_TOL_ATR
    if len(m5c) < 4 * SR_PIVOT or tol <= 0:
        return None, "not enough 5M candles for support/resistance"
    # the level must have been CONFIRMED (its 3 candles after) before the tap window opened
    recent = m5c[-TAP_WINDOW_M5 - SR_PIVOT].time
    refused: list[str] = []
    for bull in sides:
        lv = [(p, t) for p, t in _levels(m5c, bull) if t < recent]          # respected once, BEFORE this tap
        opp = [p for p, _ in _levels(m5c, not bull)]
        for p, t in sorted(lv, key=lambda x: abs(price - x[0])):
            top, bot = p + tol, p - tol
            tap = respected_5m(m5c, top, bot, bull)
            if tap is None:
                continue
            sl = bot if bull else top + spread
            e = entry_1m(m1, bull, sl, price + (spread / 2 if bull else -spread / 2), spread)   # a buy fills on the ask
            if e is None:
                continue
            risk = abs(e - sl)
            room = [q - e for q in opp if q > e] if bull else [e - q for q in opp if q < e]
            if not room or min(room) < RANGE_MIN_R * risk:
                continue
            ok, flow_why = _flow(flow, m5c, m1, bull, tap)
            if not ok:
                refused.append(flow_why[-1] if flow_why else "order flow refused")
                continue
            rr = min(TARGET_R, min(room) / risk)
            tp = e + rr * risk if bull else e - rr * risk
            why = [f"{'RANGING' if trend == 0 else ('UPTREND' if trend > 0 else 'DOWNTREND')} — 5M "
                   f"{'support' if bull else 'resistance'} {round(p, 5)} respected before, respected again now",
                   f"Room to the opposite level {min(room) / risk:.1f}R (needs {RANGE_MIN_R:.0f}R)",
                   *flow_why,
                   f"1M stop order at the last closed candle's {'high + the spread' if bull else 'low'}; target {rr:.1f}R"]
            return Plan("buy" if bull else "sell", "range", "5M", top, bot, e, sl, tp, round(rr, 2),
                        t, tap, why), ""
    if refused:
        return None, f"order flow said no: {refused[0]}"
    return None, "no 5M support/resistance on its 2nd respect with 2R of room"
