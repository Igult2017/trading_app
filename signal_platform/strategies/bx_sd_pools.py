"""
BX-S/D — liquidity POOL BUILDERS: where the resting stops actually sit.

Split out of bx_sd_liquidity (which keeps the QUERIES — is_swept / swept_before / defensive_ok) so
each file has one responsibility. The book's pool list (Ch. 5 "Examples of Liquidity Pools"):
  * swing high/low · equal highs/lows (EQH/EQL)      -> built in bx_sd_liquidity.find_liquidity
  * Daily / Weekly / Monthly high/low                -> _period_pools (here)
  * Session (Asian, London, NY) high/low             -> _session_pools (here)
Trend-line liquidity is deliberately NOT auto-detected: which line "retail would draw" is subjective,
and naive detection yields false levels — worse than none.

`LiquidityPool` lives here (not in bx_sd_liquidity) so the builders never import back into the
queries module — one direction only, no cycle.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from core.types import Candle

# Session windows in UTC (fixed — a ±1h DST shift doesn't move a session's high/low materially).
# Aligned with the app's clock: Tokyo 00-09 UTC (server/lib/marketHours), London open ~07:00 UTC
# (server/scrapers/scheduler), NY ~12-21 UTC.
_SESSIONS = (("asia", 0, 9), ("lon", 7, 16), ("ny", 12, 21))

# THE TRADING DAY ROLLS AT 22:00 UTC, not at midnight — the same anchor the app's own week
# open/close already uses (server/services/marketSessionAlerts.ts: "Sunday 22:00 UTC — the forex
# week opens"). Everything below derives from this one rule, so day, week and month can never drift
# apart from each other again.
#
# They had. The period pools used to bucket on `time // span` — arithmetic from the UNIX EPOCH,
# which was a THURSDAY. So "previous weekly high" was measured Thursday->Wednesday: half of one real
# trading week glued to half of the next, a level no trader watches and therefore a level with no
# stops resting on it. "Previous month" was a sliding 30-day block (by Aug 2026 it began on the
# 5th), and "previous day" ran to UTC midnight while the broker's day ends at 22:00.
#
# That is not a cosmetic error: these levels answer "where do the stops sit", and a phantom level
# makes `swept_before` believe stops were grabbed when none were (marking a zone that should not
# exist) while the real weekly high goes unwatched (missing one that should).
# 21, NOT 22 — and the broker's own data is why. Its H4 grid SHIFTS WITH DST: bar start hours are
# {01,05,09,13,17,21} in EEST summer and {02,06,10,14,18,22} in EET winter (counted over the saved
# cTrader history: 407 bars at each summer hour, 176 at each winter one). Both are that broker's
# midnight — UTC+3 then UTC+2.
#
# A fixed 22:00 roll is exact in winter and one bar out all summer: the 21:00 bar is the broker's
# FIRST bar of the new day, and a 22:00 boundary files it under the old one. Rolling at 21:00 lands
# both regimes on the right date, because NO H4 bar ever starts between 19:00 and 21:00 — the last
# bar before the roll is 17:00 (summer) or 18:00 (winter), and +3h keeps both inside the same date.
# So this is not a compromise between the two; it is correct for each.
_FX_DAY_ROLL_H = 21


def forex_day(ts: int) -> date:
    """The TRADING day a timestamp belongs to. 21:30 UTC Monday is already Tuesday's session."""
    u = datetime.fromtimestamp(ts, tz=timezone.utc)
    return (u + timedelta(hours=24 - _FX_DAY_ROLL_H)).date()


@dataclass
class LiquidityPool:
    side:  str    # "buy" (above, from highs) | "sell" (below, from lows)
    price: float
    kind:  str    # "swing" | "eqh"/"eql" | "pdh"/"pwh"/"pmh"… | "asia_high"/"lon_low"…
    index: int    # candle index (into the H4 stream) where the pool level formed


def _period_key(period: str, ts: int):
    """Which day / week / month a timestamp belongs to, all three derived from `forex_day`.

    WEEK uses the ISO week of the forex day. Forex days Mon–Fri share one ISO week, so a week runs
    exactly Sunday 22:00 -> Friday 22:00 UTC — the real trading week, matching the app's own clock.
    MONTH uses the forex day's calendar month, so 31 Jul 22:30 UTC (already 1 Aug's session) is
    August, where the old sliding 30-day block would have called it neither.
    """
    d = forex_day(ts)
    if period == "day":
        return d
    if period == "week":
        return d.isocalendar()[:2]        # (ISO year, ISO week)
    return (d.year, d.month)


def _period_pools(candles: list[Candle], period: str, hi_kind: str, lo_kind: str) -> list[LiquidityPool]:
    """Prior completed-period highs/lows (PDH/PDL · PWH/PWL · PMH/PML) from the candle stream — EXACT,
    since a period's high is just the max of that period's H4 highs. Major resting liquidity the book
    weights heavily (Ch. 5 & 10: "Daily/Weekly/Monthly high/low"). `period` is "day"/"week"/"month";
    the CURRENT still-forming period is skipped (its high/low is not final yet)."""
    by_p: dict = {}
    order: list = []
    for i, c in enumerate(candles):
        p = _period_key(period, c.time)
        e = by_p.get(p)
        if e is None:
            by_p[p] = {"hi": c.high, "lo": c.low, "last": i}; order.append(p)
        else:
            e["hi"] = max(e["hi"], c.high); e["lo"] = min(e["lo"], c.low); e["last"] = i
    out: list[LiquidityPool] = []
    for p in order[:-1]:                         # completed periods only (skip the current forming one)
        e = by_p[p]
        out.append(LiquidityPool("buy",  e["hi"], hi_kind, e["last"]))
        out.append(LiquidityPool("sell", e["lo"], lo_kind, e["last"]))
    return out


def _session_pools(finer: list[Candle], h4: list[Candle]) -> list[LiquidityPool]:
    """Asian / London / NY SESSION highs/lows from a FINER feed (M15/M30) — H4 is too coarse to isolate
    a session boundary. Retail stops rest beyond each session's extreme (book Ch.5 "Session high/low");
    the still-forming current session is skipped. Sessions OVERLAP, so a bar feeds every session it is
    in. Each pool is indexed into the H4 stream (the H4 bar at the session's end) so is_swept /
    swept_before operate on the same series as the other pools."""
    if not finer or not h4:
        return []
    def _utc(t): return datetime.fromtimestamp(t, tz=timezone.utc)
    buckets: dict[tuple, dict] = {}
    order: list[tuple] = []
    for c in finer:
        u = _utc(c.time); d = u.toordinal(); hr = u.hour
        for name, s, e in _SESSIONS:
            if s <= hr < e:                                  # no break — overlapping sessions both count
                k = (d, name)
                b = buckets.get(k)
                if b is None:
                    buckets[k] = {"hi": c.high, "lo": c.low, "end": c.time}; order.append(k)
                else:
                    b["hi"] = max(b["hi"], c.high); b["lo"] = min(b["lo"], c.low); b["end"] = c.time
    lu = _utc(finer[-1].time)
    forming = {(lu.toordinal(), n) for n, s, e in _SESSIONS if s <= lu.hour < e}
    def _h4_idx(t):                                          # last H4 bar at/before the session end
        idx = 0
        for i, c in enumerate(h4):
            if c.time <= t: idx = i
            else: break
        return idx
    out: list[LiquidityPool] = []
    for k in order:
        if k in forming:
            continue
        b = buckets[k]; name = k[1]; idx = _h4_idx(b["end"])
        out.append(LiquidityPool("buy",  b["hi"], f"{name}_high", idx))
        out.append(LiquidityPool("sell", b["lo"], f"{name}_low",  idx))
    return out
