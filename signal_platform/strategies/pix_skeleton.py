"""PIX — HIS SKELETON, top to bottom (18 Nov 2026; the 1M entry rebuilt to his sequence 19 Nov). Pure functions on
candles; `pix.py` only feeds them.

  4H  is the market trending? (`pix_trend.direction`: 4H, else 1H). Trending → zones in the trend's direction only.
  5M first, then 1H / 4H  the REAL zones (price travelled from them to another zone) near the money (`pix_bigzones`).
  1M  the zone must PROVE itself (`pix_entry.reaction_entry`): price touches it without closing through, at least 2
      candles close our way, then ONE candle closes the opposite way (the pullback) → a STOP ORDER at the pullback's
      high + the spread (buy) / low (sell); stop behind the pullback; target 3R — *"Let's target 3R"*. No 5M candle may
      close through the zone during the visit either.
      ORDER FLOW (`flow` callable from `pix.py`): ABSORPTION refuses; DIVERGENCE + DELTA only CONFIRM, and the card
      says whether they agree — his rule, *"Both must agree but if they don't indicate so in the signal card"*.
  RANGING 4H + 1H → 5M support / resistance: *"wait for it being respected once then when it respects it again, we take
      trade but we use stop order"* — the second respect is the same 1M reaction — only *"when they can give use 2R and
      above"*.

Nothing here reads the still-forming candle as a level. `price` is the CURRENT MID price (the live quote, else the
last 1M close) and is used only as a trigger: near-the-money distance, and a buy stop must sit above the ask (mid +
half the spread), a sell stop below the bid.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from core.types import Candle
from strategies.pix_candles import closed_only
from strategies.pix_swings import find_swings
from strategies.pix_entry import Entry, reaction_entry
from strategies.pix_bigzones import TF_S, candidates, daily_atr, NEAR_ATR_MULT
from strategies.pix_profile import describe, from_candles, poc_role, touching
from strategies.pix_trend import direction
from strategies import pix_factors

TARGET_R      = 3.0
RANGE_MIN_R   = 2.0    # a support / resistance trade needs at least 2R of room to the opposite level
SR_PIVOT      = 3      # a 5M swing high/low = the highest/lowest of 3 candles each side (its first respect)
SR_LOOKBACK   = 200    # 5M candles searched for those levels (~16 hours)
SR_TOL_ATR    = 0.25   # a level is a band ± a quarter of the 5M average range
PROFILE_M5    = 288    # the volume profile's window: 288 5M candles = the last day (24 1H candles)
SR_FRESH_M5   = 12     # a support/resistance level must have formed before the last hour (its FIRST respect)


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
    tap_at:    int       # the visit's first 1M candle into the zone
    pullback_at: int     # the 1M pullback candle the order is placed off — one signal per pullback
    why:       list[str]
    factors:   list[str] = field(default_factory=list)   # the Assets page's three panels (pix_factors)
    ticks:     list[str] = field(default_factory=list)   # the Telegram card's checklist (his ask, 20 Nov 2026)


def _atr(c: list[Candle], n: int = 14) -> float:
    c = c[-(n + 1):]
    if len(c) < 2:
        return 0.0
    return sum(max(c[k].high - c[k].low, abs(c[k].high - c[k - 1].close), abs(c[k].low - c[k - 1].close))
               for k in range(1, len(c))) / (len(c) - 1)


def _flow(flow, m5, m1, bull: bool, e: Entry) -> tuple[str | None, str, list[str]]:
    """(absorption reason or None, the card's agree / disagree line, extra details). No check supplied → no figures."""
    if flow is None:
        return None, "Order flow not available yet — no order-flow feed", []
    return flow(m5, m1, bull, e)


def _broken_5m(m5c: list[Candle], top: float, bottom: float, bull: bool, since: int) -> bool:
    """A 5M candle overlapping the visit (from the first 1M touch on) CLOSED through the zone's far edge."""
    return any((x.close < bottom if bull else x.close > top) for x in m5c if x.time + 300 > since)


def _proved(m5, m1, top, bottom, bull, price, spread) -> tuple[Entry | None, str]:
    e, why = reaction_entry(m1, top, bottom, bull, price + (spread / 2 if bull else -spread / 2), spread)
    if e is not None and _broken_5m(closed_only(m5), top, bottom, bull, e.first_touch_at):
        return None, "5M: a candle closed THROUGH the zone during the visit — broken"
    return e, why


def _entry_why(e: Entry, bull: bool) -> str:
    return (f"1M: touched the zone, {len(e.reaction)} candles {'up' if bull else 'down'}, then a pullback candle — "
            f"the zone proved itself")


def _flow_tick(flow_line: str) -> str:
    """The order-flow item of the card's checklist. Absorption REFUSES (no plan at all); agreement only CONFIRMS, and
    his rule is that a disagreement is shown, not hidden — so it is a tick only when the flow really agrees."""
    if flow_line.startswith("Order flow CONFIRMS"):
        return "Order flow agrees"
    if "does NOT agree" in flow_line:
        return "⚠️ Order flow disagrees"
    return "⚠️ Order flow not available"


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
    waiting: list[str] = []
    for bz, outer in zones:
        z = bz.zone
        e, why_not = _proved(m5, m1, z.top, z.bottom, bull, price, spread)
        if e is None:
            waiting.append(f"{bz.tf} {round(z.bottom, 5)}–{round(z.top, 5)}: {why_not}")
            continue
        # THE TOUCH MUST COME AFTER PRICE TRAVELLED AWAY (his rule: "tapped another zone BEFORE coming back"). A 5M zone
        # can be minutes old, and its own formation candles must never count as price coming back to it.
        if e.first_touch_at < bz.reached_at + TF_S[bz.tf]:
            continue
        absorbed, flow_line, flow_more = _flow(flow, m5, m1, bull, e)
        if absorbed:
            waiting.append(f"{bz.tf}: {absorbed} — not entering")
            continue
        sl, entry = e.sl, e.entry
        risk = abs(entry - sl)
        tp = entry + TARGET_R * risk if bull else entry - TARGET_R * risk
        where = (f" — INSIDE the {outer.tf} {want} zone {round(outer.zone.bottom, 5)}–{round(outer.zone.top, 5)}"
                 if outer else "")
        why = [f"{src} {'UP' if bull else 'DOWN'}TREND — trading with it only",
               f"REAL {bz.tf} {want} zone {round(z.bottom, 5)}–{round(z.top, 5)}{where}: price left it and travelled "
               f"to the {bz.reached.direction} zone {round(bz.reached.bottom, 5)}–{round(bz.reached.top, 5)} "
               f"before coming back",
               _entry_why(e, bull),
               flow_line,
               f"1M stop order at the pullback's {'high + the spread' if bull else 'low'}; {e.note}; 3R",
               describe(prof, poc_role(day, prof.poc) if prof else "")
               + (f" — {'/'.join(touching(prof, z.bottom, z.top))} AT THIS ZONE (confluence)"
                  if touching(prof, z.bottom, z.top) else ""),
               *flow_more]
        facts = pix_factors.zone(src, bull, bz, outer, want, e, flow_line, prof,
                                 poc_role(day, prof.poc) if prof else "", TARGET_R)
        return Plan("buy" if bull else "sell", "zone", bz.tf, z.top, z.bottom, entry, sl, tp, TARGET_R,
                    bz.time, e.first_touch_at, e.pullback.time, why, facts,
                    # Each item is a check that REFUSES above (trend, a real zone, proved on 1M and not broken on
                    # 5M, came back after travelling, not absorbed), then the flow reading and the target.
                    [f"{src} trend", f"Real {bz.tf} {want} zone", "Came back after travelling",
                     "Zone proved on 1M", "Not absorbed", _flow_tick(flow_line), f"{TARGET_R:g}R"]), ""
    return None, (f"{len(zones)} real {want} zone(s) near price — "
                  + ("; ".join(waiting[:2]) or "none touched since price travelled away"))


def range_plan(h4, m5, m1, price: float, spread: float, flow=None, h1=None) -> tuple[Plan | None, str]:
    """Support / resistance on 5M: the 2nd respect, stop order, ≥2R room. In a trend, the trend's side only."""
    trend, _ = direction(h4, h1 or [])
    sides = [True, False] if trend == 0 else [trend > 0]
    m5c = closed_only(m5)[-SR_LOOKBACK:]
    tol = _atr(m5c) * SR_TOL_ATR
    if len(m5c) < 4 * SR_PIVOT or tol <= 0:
        return None, "not enough 5M candles for support/resistance"
    # the level must have been CONFIRMED (its 3 candles after) before the last hour — that was its FIRST respect
    recent = m5c[-SR_FRESH_M5 - SR_PIVOT].time
    waiting: list[str] = []
    for bull in sides:
        lv = [(p, t) for p, t in _levels(m5c, bull) if t < recent]          # respected once, BEFORE this visit
        opp = [p for p, _ in _levels(m5c, not bull)]
        for p, t in sorted(lv, key=lambda x: abs(price - x[0])):
            top, bot = p + tol, p - tol
            e, _ = _proved(m5c, m1, top, bot, bull, price, spread)
            if e is None:
                continue
            risk = abs(e.entry - e.sl)
            room = [q - e.entry for q in opp if q > e.entry] if bull else [e.entry - q for q in opp if q < e.entry]
            if not room or min(room) < RANGE_MIN_R * risk:
                continue
            absorbed, flow_line, flow_more = _flow(flow, m5c, m1, bull, e)
            if absorbed:
                waiting.append(f"{absorbed} — not entering")
                continue
            rr = min(TARGET_R, min(room) / risk)
            tp = e.entry + rr * risk if bull else e.entry - rr * risk
            why = [f"{'RANGING' if trend == 0 else ('UPTREND' if trend > 0 else 'DOWNTREND')} — 5M "
                   f"{'support' if bull else 'resistance'} {round(p, 5)} respected before, respected again now",
                   _entry_why(e, bull),
                   flow_line,
                   f"Room to the opposite level {min(room) / risk:.1f}R (needs {RANGE_MIN_R:.0f}R)",
                   f"1M stop order at the pullback's {'high + the spread' if bull else 'low'}; {e.note}; "
                   f"target {rr:.1f}R",
                   *flow_more]
            facts = pix_factors.level(trend, bull, p, min(room) / risk, e, flow_line, round(rr, 2))
            return Plan("buy" if bull else "sell", "range", "5M", top, bot, e.entry, e.sl, tp, round(rr, 2),
                        t, e.first_touch_at, e.pullback.time, why, facts,
                        [f"5M {'support' if bull else 'resistance'} respected before", "Respected again on 1M",
                         "Not absorbed", _flow_tick(flow_line), f"Room {min(room) / risk:.1f}R"]), ""
    if waiting:
        return None, waiting[0]
    return None, "no 5M support/resistance proved on 1M with 2R of room"
