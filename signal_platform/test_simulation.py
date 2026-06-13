"""
End-to-end simulation — EURUSDPullbackStrategy two-stage alert pipeline.
No network, no DB, no Telegram. Uses synthetic EURUSD candle data designed
to trigger Stage 1 then Stage 2, and verifies every gate in the pipeline.

Run from signal_platform/:
    python test_simulation.py
"""
import asyncio
import sys
import os

_PLATFORM = os.path.dirname(os.path.abspath(__file__))
if _PLATFORM not in sys.path:
    sys.path.insert(0, _PLATFORM)

from core.types import (
    Candle, TF, MTFCandles, NewsContext, Direction, SignalStatus,
)
from core.strategy_context import StrategyContext
from core.indicator_types import IndicatorBundle
from core.pattern_types import PatternBundle
from strategies.eurusd_pullback import EURUSDPullbackStrategy
from strategies.pullback_setup import find_volume_cluster, measure_pullback
from strategies.pullback_fractal import fractal_identified
from validation.signal_validator import validate as sv_validate, _seen

_PIP  = 0.00010
# 2024-01-15 10:00:00 UTC — Monday, London Mid session (valid phase)
EPOCH = 1_705_312_800

PASS_C = 0
FAIL_C = 0


def ok(label, cond, detail=""):
    global PASS_C, FAIL_C
    status = "\033[32mPASS\033[0m" if cond else "\033[31mFAIL\033[0m"
    print(f"  {status}  {label}" + (f"  [{detail}]" if detail else ""))
    if cond:
        PASS_C += 1
    else:
        FAIL_C += 1


# ── Candle factories ────────────────────────────────────────────────────────────

def mk_h1(i, o, h, l, c):
    return Candle(time=EPOCH + i * 3600, open=o, high=h, low=l, close=c,
                  volume=1000.0, timeframe=TF.H1)

def mk_m1(t, o, h, l, c):
    return Candle(time=t, open=o, high=h, low=l, close=c,
                  volume=500.0, timeframe=TF.M1)

def mk_d1(i, close):
    return Candle(time=EPOCH + i * 86400, open=close - 0.0002,
                  high=close + 0.0005, low=close - 0.0005,
                  close=close, volume=10000.0, timeframe=TF.D1)

def mk_h4(i, price):
    return Candle(time=EPOCH + i * 14400, open=price,
                  high=price + 0.0010, low=price - 0.0010,
                  close=price + 0.0002, volume=4000.0, timeframe=TF.H4)


# ── D1: 250 bars trending from 1.0550 → 1.0800 (EMA 200 lags well below) ──────

def make_d1():
    return [mk_d1(i, 1.0550 + i * (0.0250 / 249)) for i in range(250)]


# ── H4: 100 bars, prices 1.0700–1.0710 (no key levels near 1.0829) ────────────

def make_h4():
    return [mk_h4(i, 1.0700 + i * 0.0001) for i in range(100)]


# ── H1: 250 bars with a deliberate bullish cluster + pullback ─────────────────
# Bars 229       : preceding bar (body_ratio = 0.33 → not a cluster bar)
# Bars 230-232   : bullish cluster (body_ratio = 0.80, avg_body > preceding)
# Bars 233-234   : bearish pullback (50% retrace; closes stay above cluster_low)
# Bars 235-249   : neutral consolidation
#
# Cluster range : 1.0862 - 1.0797 = 65 pips
# Pullback depth: 1.0862 - 1.0829 = 33 pips  (50.8% → inside 25-80% band ✓)

def make_h1():
    bars = []
    for i in range(229):
        bars.append(mk_h1(i, 1.0790, 1.0800, 1.0780, 1.0793))  # ratio=0.15 ✓

    # Preceding bar — small body so avg_cluster_body > preceding passes
    bars.append(mk_h1(229, 1.0795, 1.0805, 1.0790, 1.0800))    # ratio=0.33 ✓

    # Cluster: 3 bullish bars, each body=20 pip / range=25 pip → ratio=0.80
    bars.append(mk_h1(230, 1.0800, 1.0822, 1.0797, 1.0820))
    bars.append(mk_h1(231, 1.0820, 1.0842, 1.0817, 1.0840))
    bars.append(mk_h1(232, 1.0840, 1.0862, 1.0837, 1.0860))

    # Pullback: 2 bearish bars — neither close falls below cluster_low (1.0797)
    bars.append(mk_h1(233, 1.0858, 1.0862, 1.0840, 1.0843))
    bars.append(mk_h1(234, 1.0843, 1.0847, 1.0829, 1.0832))    # pb_end_time = bar234.time + 3600

    for i in range(235, 250):
        bars.append(mk_h1(i, 1.0832, 1.0840, 1.0828, 1.0835))

    return bars


# ── M1: 250 bars starting at pb_end_time ──────────────────────────────────────
# The pullback zone is [1.0826, 1.0865] (pb_low ± 3 pip, pb_high ± 3 pip).
#
# Index 16  : extreme (low = 1.0829, deepest in zone — extreme_pos)
# Index 26  : p2 for Williams fractal (high = 1.0840)
# Index 27  : p1 for Williams fractal (high = 1.0845)
# Index 28  : FRACTAL CENTER (high = 1.0850 > all four neighbours)
# Index 29  : n1 (high = 1.0843 < fractal)
# Index 30  : n2 (high = 1.0841 < fractal)
# Index 34  : TOUCH bar — high = 1.0851 >= fractal_level 1.0850 → Stage 2 fires
#
# No M1 close ever drops below pb_low (1.0829) → no invalidation.

def make_m1(pb_end_time: int):
    t   = pb_end_time
    bars = []

    # 0-15: drifting into zone from above
    for i in range(16):
        p = max(1.0831, 1.0850 - i * 0.0001)
        bars.append(mk_m1(t + i * 60, p, p + 0.0004, p - 0.0002, p - 0.0001))

    # 16: extreme
    bars.append(mk_m1(t + 16 * 60, 1.0833, 1.0835, 1.0829, 1.0831))

    # 17-25: bounce
    for i in range(17, 26):
        p = 1.0832 + (i - 17) * 0.0001
        bars.append(mk_m1(t + i * 60, p, p + 0.0003, p - 0.0002, p + 0.0001))

    # 26-30: fractal window
    bars.append(mk_m1(t + 26 * 60, 1.0839, 1.0840, 1.0836, 1.0838))  # p2
    bars.append(mk_m1(t + 27 * 60, 1.0838, 1.0845, 1.0836, 1.0842))  # p1
    bars.append(mk_m1(t + 28 * 60, 1.0843, 1.0850, 1.0840, 1.0845))  # FRACTAL
    bars.append(mk_m1(t + 29 * 60, 1.0842, 1.0843, 1.0838, 1.0840))  # n1
    bars.append(mk_m1(t + 30 * 60, 1.0840, 1.0841, 1.0836, 1.0838))  # n2

    # 31-33: approaching
    bars.append(mk_m1(t + 31 * 60, 1.0838, 1.0843, 1.0835, 1.0841))
    bars.append(mk_m1(t + 32 * 60, 1.0841, 1.0845, 1.0838, 1.0843))
    bars.append(mk_m1(t + 33 * 60, 1.0843, 1.0847, 1.0840, 1.0845))

    # 34: TOUCH — high=1.0851 >= 1.0850
    bars.append(mk_m1(t + 34 * 60, 1.0845, 1.0851, 1.0843, 1.0848))

    # 35-249: filler
    for i in range(35, 250):
        bars.append(mk_m1(t + i * 60, 1.0848, 1.0852, 1.0844, 1.0849))

    return bars


def make_context(h1, m1, h4, d1, news=None):
    data = {TF.M1: m1, TF.H1: h1, TF.H4: h4, TF.D1: d1}
    mtf  = MTFCandles.from_cache(data, list(data.keys()))
    return StrategyContext(
        symbol     = "EUR/USD",
        candles    = mtf,
        indicators = IndicatorBundle.from_cache({}, []),
        patterns   = PatternBundle.from_cache({}, []),
        news       = news,
    )


# ── Tests ───────────────────────────────────────────────────────────────────────

async def run():
    print("\n=== Building synthetic data ===")
    h1 = make_h1()
    d1 = make_d1()
    h4 = make_h4()

    print(f"  H1: {len(h1)} bars  D1: {len(d1)} bars  H4: {len(h4)} bars")

    # Derive pb_end_time from the H1 pullback (bar 234 close + 3600 s)
    pb_end_time = h1[234].time + 3600
    m1 = make_m1(pb_end_time)
    print(f"  M1: {len(m1)} bars  pb_end_time={pb_end_time}")

    # ── Section 1: sub-function unit tests ─────────────────────────────────────
    print("\n--- 1. Sub-function checks ---")

    cluster = find_volume_cluster(h1, bullish=True)
    ok("find_volume_cluster returns a result",  cluster is not None)
    if cluster:
        vs, ve = cluster
        ok("cluster start = 230",  vs == 230, f"got {vs}")
        ok("cluster end   = 232",  ve == 232, f"got {ve}")

    pb = measure_pullback(h1, ve, bullish=True, cluster_start=vs) if cluster else None
    ok("measure_pullback returns a result", pb is not None)
    if pb:
        pb_high, pb_low, pb_count, pb_et = pb
        ok("pullback count 1-6",        1 <= pb_count <= 6, f"got {pb_count}")
        ok("pb_end_time matches derived", pb_et == pb_end_time, f"{pb_et} vs {pb_end_time}")
        ok("pb_high = 1.08620",  abs(pb_high - 1.08620) < 0.00005, f"got {pb_high:.5f}")
        ok("pb_low  = 1.08290",  abs(pb_low  - 1.08290) < 0.00005, f"got {pb_low:.5f}")

    entry_level = fractal_identified(m1, pb_high, pb_low, True, pb_end_time) if pb else None
    ok("fractal_identified fires",    entry_level is not None)
    if entry_level:
        ok("fractal level = 1.08500",  abs(entry_level - 1.08500) < 0.00005, f"got {entry_level:.5f}")

    # Run all three calls upfront so we can test each in order
    strategy = EURUSDPullbackStrategy()
    ctx      = make_context(h1, m1, h4, d1)
    result1  = await strategy.analyze(ctx)   # expect Stage 1
    result2  = await strategy.analyze(ctx)   # expect Stage 2
    result3  = await strategy.analyze(ctx)   # expect empty (both stages done)

    # ── Section 2: Stage 1 ─────────────────────────────────────────────────────
    print("\n--- 2. Stage 1 — H1 setup alert ---")
    ok("Stage 1: has signals",                result1.has_signals())
    if result1.has_signals():
        s1 = result1.signals[0]
        ok("Stage 1: alert_only = True",      s1.alert_only)
        ok("Stage 1: direction = BUY",        s1.direction == Direction.BUY)
        ok("Stage 1: strategy_id has _setup", "_setup" in s1.strategy_id, s1.strategy_id)
        ok("Stage 1: EMA-aligned (no _watch)","_watch" not in s1.strategy_id, s1.strategy_id)
        ok("Stage 1: entry_price > 0",        s1.entry_price > 0)
        ok("Stage 1: stop_loss  > 0",         s1.stop_loss  > 0)
        ok("Stage 1: take_profit > 0",        s1.take_profit > 0)

    # ── Section 3: Stage 2 ─────────────────────────────────────────────────────
    print("\n--- 3. Stage 2 — M1 fractal entry signal ---")
    ok("Stage 2: has signals",                result2.has_signals())
    if result2.has_signals():
        s2 = result2.signals[0]
        ok("Stage 2: alert_only = False",     not s2.alert_only)
        ok("Stage 2: direction = BUY",        s2.direction == Direction.BUY)
        ok("Stage 2: strategy_id correct",    s2.strategy_id == "eurusd_pullback_v2", s2.strategy_id)
        ok("Stage 2: confidence = 0.75",      abs(s2.confidence - 0.75) < 0.01, f"{s2.confidence}")
        ok("Stage 2: entry ~1.08500",         abs(s2.entry_price - 1.08500) < 0.00005,
           f"{s2.entry_price:.5f}")
        ok("Stage 2: risk_reward = 2.0",      s2.risk_reward == 2.0)

    # ── Section 4: idempotency ─────────────────────────────────────────────────
    print("\n--- 4. Idempotency — no re-fire after both stages ---")
    ok("No signal on 3rd call",               not result3.has_signals())

    # ── Section 6: signal_validator routing ────────────────────────────────────
    print("\n--- 6. signal_validator routing ---")

    # Reset dedup state for clean test
    _seen.clear()

    if result1.has_signals():
        s1_validated = sv_validate(result1, "EUR/USD")
        ok("Validator: Stage 1 passes through (alert_only)",
           len(s1_validated) == 1 and s1_validated[0].alert_only)

    if result2.has_signals():
        s2_validated = sv_validate(result2, "EUR/USD")
        ok("Validator: Stage 2 passes RR/confidence/dedup",
           len(s2_validated) == 1 and not s2_validated[0].alert_only)

        # Second Stage 2 validation should be blocked by dedup
        s2_dup = sv_validate(result2, "EUR/USD")
        ok("Validator: Stage 2 dedup blocks duplicate",  len(s2_dup) == 0)

    # ── Section 7: data guard checks ───────────────────────────────────────────
    print("\n--- 7. Data guard (insufficient bars) ---")

    strategy2 = EURUSDPullbackStrategy()
    short_h1  = h1[-50:]   # only 50 bars — fails len(h1) < 200
    ctx_short = make_context(short_h1, m1, h4, d1)
    result_short = await strategy2.analyze(ctx_short)
    ok("Guard: rejects < 200 H1 bars",  not result_short.has_signals())

    short_d1  = d1[-50:]   # only 50 D1 bars — fails len(d1) < 200
    ctx_sd    = make_context(h1, m1, h4, short_d1)
    result_sd = await strategy2.analyze(ctx_sd)
    ok("Guard: rejects < 200 D1 bars",  not result_sd.has_signals())

    # ── Section 8: candle_counts on strategy class ─────────────────────────────
    print("\n--- 8. candle_counts declaration ---")
    ok("candle_counts declared",         hasattr(EURUSDPullbackStrategy, "candle_counts"))
    cc = EURUSDPullbackStrategy.candle_counts
    ok("M1 count >= 100",  cc.get(TF.M1, 0) >= 100, f"{cc.get(TF.M1)}")
    ok("H1 count >= 200",  cc.get(TF.H1, 0) >= 200, f"{cc.get(TF.H1)}")
    ok("D1 count >= 200",  cc.get(TF.D1, 0) >= 200, f"{cc.get(TF.D1)}")

    # ── Summary ─────────────────────────────────────────────────────────────────
    total = PASS_C + FAIL_C
    print(f"\n{'='*50}")
    print(f"  PASSED: {PASS_C}/{total}   FAILED: {FAIL_C}/{total}")
    print(f"{'='*50}\n")
    return FAIL_C == 0


if __name__ == "__main__":
    success = asyncio.run(run())
    sys.exit(0 if success else 1)
