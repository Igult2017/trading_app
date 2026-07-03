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

from core.types import Candle
from shared.swing_points import find_swing_points


@dataclass
class LiquidityPool:
    side:  str    # "buy" (above, from highs) | "sell" (below, from lows)
    price: float
    kind:  str    # "swing" | "eqh" | "eql"
    index: int    # candle index where the pool level formed


def _daily_pools(candles: list[Candle]) -> list[LiquidityPool]:
    """Prior-day highs/lows (PDH/PDL). Derived from the H4 stream — EXACT, since a day's high is just
    the max of that day's H4 highs. Major resting liquidity the book weights heavily (Ch. 5 & 10)."""
    by_day: dict[int, dict] = {}
    order: list[int] = []
    for i, c in enumerate(candles):
        d = int(c.time // 86400)
        e = by_day.get(d)
        if e is None:
            by_day[d] = {"hi": c.high, "lo": c.low, "last": i}; order.append(d)
        else:
            e["hi"] = max(e["hi"], c.high); e["lo"] = min(e["lo"], c.low); e["last"] = i
    out: list[LiquidityPool] = []
    for d in order[:-1]:                        # completed days only (skip the current forming day)
        e = by_day[d]
        out.append(LiquidityPool("buy",  e["hi"], "pdh", e["last"]))
        out.append(LiquidityPool("sell", e["lo"], "pdl", e["last"]))
    return out


def find_liquidity(candles: list[Candle], pip: float = 0.0001,
                   eq_tol_pips: float = 2.0, n: int = 3) -> list[LiquidityPool]:
    """All liquidity pools — every swing is a pool; near-equal swings are EQH/EQL (stronger); plus
    prior-day highs/lows (PDH/PDL — major pools). (Session H/L needs a finer feed — deferred.)"""
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
    pools.extend(_daily_pools(candles))
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
