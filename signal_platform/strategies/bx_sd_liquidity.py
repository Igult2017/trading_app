"""
BX-S/D — liquidity engine (Phase 3).

Liquidity (SMC book Ch. 5 & 10) = resting stop orders. WE (retail) are the liquidity; smart
money hunts our stops. Pools live at:
  * swing highs (buy-side, above) / swing lows (sell-side, below)
  * equal highs / equal lows (EQH / EQL) — the strongest, double/triple tops-bottoms
Two roles:
  * OFFENSE — a same-side-as-target pool must be SWEPT before the zone reacts ("fuel").
  * DEFENSE — "don't be the liquidity": never enter with an UNSWEPT opposing pool sitting between
    entry and SL (price grabs it and stops us), and never park the SL ON an obvious pool.

Reuses only the generic shared RESOURCE find_swing_points.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from core.types import Candle
from shared.swing_points import find_swing_points

# Session windows in UTC (fixed — a ±1h DST shift doesn't move a session's high/low materially).
# Aligned with the app's clock: Tokyo 00-09 UTC (server/lib/marketHours), London open ~07:00 UTC
# (server/scrapers/scheduler), NY ~12-21 UTC.
_SESSIONS = (("asia", 0, 9), ("lon", 7, 16), ("ny", 12, 21))


@dataclass
class LiquidityPool:
    side:  str    # "buy" (above, from highs) | "sell" (below, from lows)
    price: float
    kind:  str    # "swing" | "eqh" | "eql"
    index: int    # candle index where the pool level formed


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


def find_liquidity(candles: list[Candle], pip: float = 0.0001, eq_tol_pips: float = 2.0, n: int = 3,
                   session_candles: list[Candle] | None = None) -> list[LiquidityPool]:
    """All liquidity pools — every swing is a pool; near-equal swings are EQH/EQL (stronger); prior
    DAY / WEEK / MONTH highs/lows (PDH/PDL · PWH/PWL · PMH/PML); and — when a finer `session_candles`
    feed (M15/M30) is given — Asian/London/NY SESSION highs/lows. (Trend-line liquidity not auto-detected.)"""
    pts   = find_swing_points(candles, n)
    highs = [(p.index, p.price) for p in pts if p.is_high]
    lows  = [(p.index, p.price) for p in pts if not p.is_high]
    pools: list[LiquidityPool] = []
    for idx, pr in highs:
        pools.append(LiquidityPool("buy", pr, "swing", idx))
    for idx, pr in lows:
        pools.append(LiquidityPool("sell", pr, "swing", idx))
    tol = eq_tol_pips * pip
    for a, b in zip(highs, highs[1:]):
        if abs(a[1] - b[1]) <= tol:
            pools.append(LiquidityPool("buy", max(a[1], b[1]), "eqh", b[0]))
    for a, b in zip(lows, lows[1:]):
        if abs(a[1] - b[1]) <= tol:
            pools.append(LiquidityPool("sell", min(a[1], b[1]), "eql", b[0]))
    pools.extend(_period_pools(candles, 86_400,    "pdh", "pdl"))   # prior DAY  high/low
    pools.extend(_period_pools(candles, 604_800,   "pwh", "pwl"))   # prior WEEK high/low
    pools.extend(_period_pools(candles, 2_592_000, "pmh", "pml"))   # prior MONTH (~30d) high/low
    if session_candles:
        pools.extend(_session_pools(session_candles, candles))      # Asian/London/NY session H/L
    return pools


def is_swept(candles: list[Candle], pool: LiquidityPool) -> bool:
    """True once the pool level has been taken out (price traded beyond it) after it formed."""
    for j in range(pool.index + 1, len(candles)):
        if pool.side == "buy"  and candles[j].high > pool.price:
            return True
        if pool.side == "sell" and candles[j].low  < pool.price:
            return True
    return False


def sweep_grab(candle: Candle, side: str, level: float) -> bool:
    """The one-candle sweep-grab signature: wick pierces the level, body closes back inside (≠ BOS)."""
    if side == "sell":
        return candle.low < level <= candle.close
    return candle.high > level >= candle.close


def swept_before(pools: list[LiquidityPool], candles: list[Candle], side: str,
                 before_index: int, window: int = 15) -> bool:
    """OFFENSE — was a `side` pool taken out within `window` candles before `before_index` (fuel)?"""
    lo = max(0, before_index - window)
    for p in pools:
        if p.side != side or p.index >= before_index:
            continue
        for j in range(max(p.index + 1, lo), min(before_index + 1, len(candles))):
            if side == "sell" and candles[j].low  < p.price:
                return True
            if side == "buy"  and candles[j].high > p.price:
                return True
    return False


def defensive_ok(pools: list[LiquidityPool], candles: list[Candle], direction: str,
                 entry: float, sl: float, pip: float = 0.0001, sl_tol_pips: float = 1.5,
                 exclude: float | None = None, exclude_tol_pips: float = 1.5):
    """DEFENSE — 'don't be the liquidity'. Returns (ok, reason).
    Rejects if the SL sits on a pool, or an UNSWEPT opposing pool sits between entry and SL
    (price would grab it and stop us out). `exclude` is the zone's own distal edge — the low/high
    we are trading FROM (our SL is already tucked beyond it), so it is not counted as a hazard pool."""
    tol = sl_tol_pips * pip
    ex  = exclude_tol_pips * pip
    def _skip(p):
        return exclude is not None and abs(p.price - exclude) <= ex
    if any(abs(p.price - sl) <= tol for p in pools if not _skip(p)):
        return False, "SL sits on a liquidity pool (it would get hunted)"
    for p in pools:
        if is_swept(candles, p) or _skip(p):
            continue
        if direction == "demand" and p.side == "sell" and sl < p.price < entry:
            return False, f"unswept sell-side pool @ {p.price:.5f} between SL and entry — we'd be the liquidity"
        if direction == "supply" and p.side == "buy" and entry < p.price < sl:
            return False, f"unswept buy-side pool @ {p.price:.5f} between entry and SL — we'd be the liquidity"
    return True, "clear"
