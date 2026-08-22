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
from shared.candle_math import atr
from shared.swing_points import find_swing_points
from strategies.bx_sd_pools import LiquidityPool, _period_pools, _session_pools


# HOW CLOSE IS "THE SAME LEVEL" — a share of what the instrument actually moves, not a pip count.
#
# His specification, 2026-08-23: *"Two swing highs/lows are considered equal when their absolute price
# difference is less than or equal to ATR x tolerance_percentage... No instrument-specific hard-coded
# pip values. No manually maintained pair table. No different algorithm for FX versus stocks. The only
# thing that changes from instrument to instrument is the measured volatility."*
#
# WHAT WAS WRONG WITH 2 PIPS FLAT. Measured on his data over 6 months, 2 pips is 2.97% of an average
# day on EUR/USD but only 1.56% on GBP/JPY — so the same setting demanded nearly TWICE the precision
# on the pair that moves furthest. Two highs a trader would call a clear double top on GBP/JPY sit 4-5
# pips apart routinely, and were being read as unrelated. A missed double top is a missed liquidity
# pool, which is a missed sweep, which refuses a valid setup.
#
# AND IT IS MEASURED AT THE MOMENT IN QUESTION, from the candles handed in — not a fixed conversion
# taken from a six-month average. His point: *"markets change... the system should calculate ATR at
# the relevant historical point."* That also keeps a replay honest, since the window only ever holds
# bars up to the bar being judged.
#
# 3% IS A STARTING VALUE, NOT A SETTLED ONE. His caution, kept here so nobody later reads it as tuned:
# *"I would not automatically declare 3% and 5% to be the final optimal values."*
_EQ_TOL_ATR = 0.03


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
    # Volatility-relative, in the instrument's own price units — works unchanged on EUR/USD, a JPY
    # pair, gold or a $500 stock. `eq_tol_pips * pip` is the fallback for a series too short to have
    # an ATR (a guard, not a second rule): without it a zero ATR would make every level "equal".
    _a = atr(candles, 14)
    tol = _a * _EQ_TOL_ATR if _a > 0 else eq_tol_pips * pip
    # EQUAL HIGHS / DOUBLE TOPS / TRIPLE TOPS, and the same for lows. These used to be a pairwise
    # scan of NEIGHBOURING swings only, which missed any double top with a smaller swing between its
    # two highs. See `_equal_level_pools`.
    pools.extend(_equal_level_pools(highs, "buy", tol))
    pools.extend(_equal_level_pools(lows, "sell", tol))
    # DYNAMIC TREND LINES — the fourth pattern his document names, previously not detected at all.
    last_i = len(candles) - 1
    pools.extend(_trendline_pools(highs, "buy", last_i, tol))
    pools.extend(_trendline_pools(lows, "sell", last_i, tol))
    # Real forex day / week / month — see bx_sd_pools.forex_day. These were `time // 86_400`,
    # `// 604_800` and `// 2_592_000`: epoch arithmetic that put the week boundary on a THURSDAY and
    # made the month a sliding 30-day block.
    pools.extend(_period_pools(candles, "day",   "pdh", "pdl"))   # prior DAY   high/low
    pools.extend(_period_pools(candles, "week",  "pwh", "pwl"))   # prior WEEK  high/low
    pools.extend(_period_pools(candles, "month", "pmh", "pml"))   # prior MONTH high/low
    if session_candles:
        pools.extend(_session_pools(session_candles, candles))      # Asian/London/NY session H/L
    return pools



def _equal_level_pools(points: list[tuple[int, float]], side: str, tol: float) -> list[LiquidityPool]:
    """EQUAL HIGHS / LOWS, DOUBLE TOPS and TRIPLE TOPS — his document's four static patterns (p17):

        "Equal highs — liquidity may accumulate above equal highs."
        "Double top  — two similar highs can create a liquidity pool."
        "Triple top  — three highs can create liquidity above the highs."
        (mirrored for lows)

    WHY THIS REPLACES THE OLD PAIRWISE CHECK. That one walked the swing list in NEIGHBOURING pairs
    (`zip(highs, highs[1:])`), so a double top with any smaller swing BETWEEN its two matching highs
    was invisible — which is most of them. Measured on EUR/USD over 4.8 months it found 5 equal highs
    and 1 equal low in the whole period, for a market that makes double tops constantly.

    Matching is by PRICE, not adjacency: every later swing within `tol` of an earlier one joins its
    cluster, however many swings sit in between.

    THE POOL'S INDEX IS WHEN IT BECAME ONE — the bar of the SECOND touch, not the first. `is_swept`
    scans forward from that index, so dating it at the first high would count a sweep that happened
    before the pattern existed. A third touch emits its own, stronger pool at its own bar.

    THE LEVEL IS THE EXTREME OF THE CLUSTER (highest of the highs / lowest of the lows). Stops rest
    just beyond the furthest one, so a shallower member would read as swept while the stops are still
    sitting there.
    """
    out: list[LiquidityPool] = []
    used: set[int] = set()
    for i, (idx_i, pr_i) in enumerate(points):
        if i in used:
            continue
        members = [(idx_i, pr_i)]
        for j in range(i + 1, len(points)):
            if j in used:
                continue
            if abs(points[j][1] - pr_i) <= tol:
                members.append(points[j])
                used.add(j)
        if len(members) < 2:
            continue
        level = max(m[1] for m in members) if side == "buy" else min(m[1] for m in members)
        # NAME: "eqh"/"eql" is kept, not renamed to "double_top". His document lists "Equal highs"
        # and "Double top" as separate entries but defines them identically — *"two similar highs
        # can create a liquidity pool"* — so they are one detection, and one detection gets one name.
        # Renaming would have broken every existing reader for no gain.
        out.append(LiquidityPool(side, level, "eqh" if side == "buy" else "eql", members[1][0]))
        if len(members) >= 3:
            out.append(LiquidityPool(side, level, "triple_top" if side == "buy" else "triple_bottom",
                                     members[2][0]))
    return out


def _trendline_pools(points: list[tuple[int, float]], side: str, last_index: int,
                     tol: float) -> list[LiquidityPool]:
    """DYNAMIC TREND LINES — *"Bullish and bearish trend lines can also contain liquidity"* (p17).

    A bullish line joins RISING swing lows; the stops rest BELOW it. A bearish line joins FALLING
    swing highs; they rest ABOVE it. Unlike the patterns above, this level MOVES — so the pool is
    priced where the line sits at the most recent bar, which is where the stops are now.

    THREE POINTS, NOT TWO. Any two swings define a line, so a two-point rule would draw a trend line
    through every pair of lows on the chart and flood the pool set with lines nobody is watching.
    Three points that actually sit on it is the weakest claim that still means something.

    Collinear within `tol`: the middle point must sit on the line drawn from the first to the last,
    inside the same tolerance the equal-highs test uses. One tolerance, not a second invented one.

    APPROXIMATE BY NATURE, and said plainly rather than hidden: a projected level is where the line
    reaches TODAY, so `is_swept` judges it against a price that was slightly different on earlier
    bars. The alternative — recomputing per bar — would make a pool that cannot be cached or compared.
    """
    out: list[LiquidityPool] = []
    n = len(points)
    if n < 3:
        return out
    for a in range(n - 2):
        for b in range(a + 2, n):
            i0, p0 = points[a]
            i1, p1 = points[b]
            if i1 == i0:
                continue
            rising = p1 > p0
            if side == "sell" and not rising:      # bullish line = rising lows
                continue
            if side == "buy" and rising:           # bearish line = falling highs
                continue
            slope = (p1 - p0) / (i1 - i0)
            mids = [(ix, pr) for ix, pr in points[a + 1:b]
                    if abs(pr - (p0 + slope * (ix - i0))) <= tol]
            if not mids:
                continue                            # no third point actually on the line
            out.append(LiquidityPool(side, p0 + slope * (last_index - i0), "trendline", i1))
            break                                   # one line per starting point is enough
    return out


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


def swept_within(pools: list[LiquidityPool], candles: list[Candle], side: str,
                 start: int, end: int) -> bool:
    """Was a pool that was STILL RESTING at `start` taken out during [start, end]?

    THE DOCUMENT'S CRITERION 2, at the moment price arrives at a zone:

        "If the price taps unmitigated HTF zone without sweeping liquidity, the zone or mitigation is
         likely to fail and act as liquidity."
        "Market requires liquidity for momentum. If the price doesn't sweep liquidity before a key
         level, it often uses that zone as liquidity to fuel its momentum."

    WHY `swept_before` CANNOT ANSWER THIS, even though it looks like it can. It asks "did any bar in
    the window trade beyond this level", which is **trivially true for any level already on the wrong
    side of price** — an equal-low from two years ago sits above today's price, so every bar in every
    window satisfies `low < pool`. Used at the tap it returned True on 100% of taps on both pairs:
    a gate that refuses nothing. It is correct where it is used at zone FORMATION, because there the
    pool sits right beside the bar being judged.
    (Found by measuring, not by reading — the first version of this shipped as `swept_before` and
    the 100% is what exposed it. Third vacuous check caught this way in one day.)

    So this asks the question the document actually poses: a pool that SURVIVED until the approach
    and was then grabbed. Still-resting is the whole point — a level already taken has no stops left
    to fuel anything.

    O(n) precompute, O(1) per pool: the running extreme from each index to `start` answers "was it
    already gone?" without rescanning per pool (there are ~2,200 pools on a 3,500-bar book).
    """
    n = len(candles)
    if start <= 0 or start >= n or end < start:
        return False
    end = min(end, n - 1)
    # extreme from index k through start-1 — how far price reached BEFORE the window
    ext = [None] * (start + 1)
    run = None
    for k in range(start - 1, -1, -1):
        v = candles[k].low if side == "sell" else candles[k].high
        run = v if run is None else (min(run, v) if side == "sell" else max(run, v))
        ext[k] = run
    win = (min(candles[j].low for j in range(start, end + 1)) if side == "sell"
           else max(candles[j].high for j in range(start, end + 1)))
    for p in pools:
        if p.side != side or p.index >= start:
            continue
        before = ext[p.index + 1] if p.index + 1 <= start - 1 else None
        if before is not None and ((before < p.price) if side == "sell" else (before > p.price)):
            continue                                   # already swept — no resting stops left
        if (win < p.price) if side == "sell" else (win > p.price):
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
