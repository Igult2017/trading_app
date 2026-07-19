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
from datetime import datetime, timezone

from core.types import Candle

# Session windows in UTC (fixed — a ±1h DST shift doesn't move a session's high/low materially).
# Aligned with the app's clock: Tokyo 00-09 UTC (server/lib/marketHours), London open ~07:00 UTC
# (server/scrapers/scheduler), NY ~12-21 UTC.
_SESSIONS = (("asia", 0, 9), ("lon", 7, 16), ("ny", 12, 21))


@dataclass
class LiquidityPool:
    side:  str    # "buy" (above, from highs) | "sell" (below, from lows)
    price: float
    kind:  str    # "swing" | "eqh"/"eql" | "pdh"/"pwh"/"pmh"… | "asia_high"/"lon_low"…
    index: int    # candle index (into the H4 stream) where the pool level formed


def _period_pools(candles: list[Candle], span: int, hi_kind: str, lo_kind: str) -> list[LiquidityPool]:
    """Prior completed-period highs/lows (PDH/PDL · PWH/PWL · PMH/PML) from the candle stream — EXACT,
    since a period's high is just the max of that period's H4 highs. Major resting liquidity the book
    weights heavily (Ch. 5 & 10: "Daily/Weekly/Monthly high/low"). `span` = period length in seconds;
    the CURRENT still-forming period is skipped (its high/low is not final yet)."""
    by_p: dict[int, dict] = {}
    order: list[int] = []
    for i, c in enumerate(candles):
        p = int(c.time // span)
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
