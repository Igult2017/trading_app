"""
BX-S/D — liquidity engine (Phase 3): assembling the pools, and the two ways we use them.

Liquidity (SMC book Ch. 5 & 10) = resting stop orders. WE (retail) are the liquidity; smart money
hunts our stops. The POOL BUILDERS live in bx_sd_pools (period + session highs/lows); this module
assembles the full pool set and answers the two questions that matter:
  * OFFENSE — a same-side-as-target pool must be SWEPT before the zone reacts ("fuel", factor 3).
  * DEFENSE — "don't be the liquidity": never enter with an UNSWEPT opposing pool sitting between
    entry and SL (price grabs it and stops us), and never park the SL ON an obvious pool.

Reuses only the generic shared RESOURCE find_swing_points.
"""
from core.types import Candle
from shared.swing_points import find_swing_points
from strategies.bx_sd_pools import LiquidityPool, _period_pools, _session_pools


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
    # Real forex day / week / month — see bx_sd_pools.forex_day. These were `time // 86_400`,
    # `// 604_800` and `// 2_592_000`: epoch arithmetic that put the week boundary on a THURSDAY and
    # made the month a sliding 30-day block.
    pools.extend(_period_pools(candles, "day",   "pdh", "pdl"))   # prior DAY   high/low
    pools.extend(_period_pools(candles, "week",  "pwh", "pwl"))   # prior WEEK  high/low
    pools.extend(_period_pools(candles, "month", "pmh", "pml"))   # prior MONTH high/low
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
    Rejects if the SL sits on an unswept pool, or an unswept opposing pool sits between entry and SL
    (price would grab it and stop us out). `exclude` is the zone's own distal edge — the low/high we
    are trading FROM (our SL is already tucked beyond it), so it is not counted as a hazard pool.

    ONLY UNSWEPT pools count, in BOTH tests. A pool price has already taken out has no resting stops
    left — it can neither hunt our SL nor stop us on the way, so it must not block us. The SL-on-pool
    test used to skip this filter (the between-test did not), which with the full pool set (swings +
    EQH/EQL + day/week/month + session = 300+ levels) put ~98% of all prices "on a pool" and silently
    rejected valid setups. Filtering swept pools drops that to ~20%, which is the real resting liquidity.
    """
    tol = sl_tol_pips * pip
    ex  = exclude_tol_pips * pip
    live = [p for p in pools
            if not (exclude is not None and abs(p.price - exclude) <= ex)
            and not is_swept(candles, p)]
    if any(abs(p.price - sl) <= tol for p in live):
        return False, "SL sits on an unswept liquidity pool (it would get hunted)"
    for p in live:
        if direction == "demand" and p.side == "sell" and sl < p.price < entry:
            return False, f"unswept sell-side pool @ {p.price:.5f} between SL and entry — we'd be the liquidity"
        if direction == "supply" and p.side == "buy" and entry < p.price < sl:
            return False, f"unswept buy-side pool @ {p.price:.5f} between entry and SL — we'd be the liquidity"
    return True, "clear"
