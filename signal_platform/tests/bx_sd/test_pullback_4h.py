"""BX-S/D — the 4H PULLBACK, and the retap-OR-pullback entry gate.

The user's rule, 2026-08-01, in his own words:

  *"A tap and a retap of the zone is different from a pullback. A pullback means the price has left
  that zone and on its way it just pulls back abit — not back to the zone, but just a pullback then
  continuation. A pullback can take the price back to the zone but in some cases it might not."*

  *"Keep the retap and add a pullback."*  *"The pullback I was talking about is in 4HR TF."*
  *"The stop is 15 pips just behind the pullback, whether the pullback happens on the zone or far
  from it."*

===========================================================================================
WHY THIS FILE WAS REWRITTEN ON 2026-08-03 — READ BEFORE CHANGING A FIXTURE

The previous version of this file contained a test literally named
    "buy: an unbroken run with no retracement is NOT a pullback"
and it PASSED — against a detector that returned True for a pure one-way collapse, fired on 85% of
random walks, and shipped a live GBP/USD SELL built on a +174 pip RALLY mislabelled as a pullback.

It passed because the fixture put the run's extreme on the LAST bar of the window, which is the one
shape the broken code rejected. The fixture tested the guard, not the claim.

THE LESSON, and the standard every fixture below is held to: BUILD THE FIXTURE TO BREAK THE CODE,
NOT TO PASS IT. A one-way move whose extreme is at the START of the window is the case that matters,
because that is what a trend looks like. If a test here starts passing for a reason you cannot state
in one sentence, distrust the test before you trust the code.
===========================================================================================
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from core.types import Candle
from strategies.bx_sd_setup import (pullback_4h, _PB_LOOKBACK_H4, _PB_MIN_MOVE,
                                    _PB_MIN_RETRACE, _PB_MAX_RETRACE)

PASS = FAIL = 0


def check(label: str, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bar(o, h, l, c, t):
    return Candle(time=t * 14400, open=o, high=h, low=l, close=c, volume=100, timeframe="H4")


# A supply zone 1.3500-1.3530 (30 pips), respected at t=0. Price should move DOWN away from 1.3500.
SUP_EDGE, SUP_H, RESPECTED = 1.3500, 0.0030, 0
# A demand zone 1.3000-1.3030 (30 pips). Price should move UP away from 1.3030.
DEM_EDGE, DEM_H = 1.3030, 0.0030

sell = lambda bars: pullback_4h(bars, SUP_EDGE, SUP_H, RESPECTED, buy=False)
buy = lambda bars: pullback_4h(bars, DEM_EDGE, DEM_H, RESPECTED, buy=True)


# ------------------------------------------------- THE TEST THAT WOULD HAVE CAUGHT THE BUG
print("\nA PURE ONE-WAY MOVE IS NOT A PULLBACK  (extreme at the START — the shape that broke it)")

# (a) STILL EXTENDING — price falls away from supply and keeps falling, nothing retraces.
collapse = [bar(1.3500 - i * .0020, 1.3505 - i * .0020, 1.3495 - i * .0020, 1.3496 - i * .0020, i + 1)
            for i in range(12)]
check("pure collapse away from supply: still extending, no pullback", sell(collapse)[0], False)

rally_up = [bar(1.3030 + i * .0020, 1.3035 + i * .0020, 1.3025 + i * .0020, 1.3034 + i * .0020, i + 1)
            for i in range(12)]
check("pure rally away from demand: still extending, no pullback", buy(rally_up)[0], False)

# (b) THE EXACT SHAPE THAT SHIPPED THE BAD SIGNAL — a sustained rally with NO move away first.
# On 2026-08-03 the old code took the lowest low of a bare window, called the +174 pip rally after
# it "the pullback", and sold into it. Here price simply rallies off a SUPPLY zone: there is no
# fall, so there is no move to pull back within, and `travelled` never reaches one zone height.
rally_off_supply = [bar(1.3495 + i * .0020, 1.3500 + i * .0020, 1.3493 + i * .0020,
                        1.3499 + i * .0020, i + 1) for i in range(12)]
check("A RALLY OFF SUPPLY IS NOT A SELL PULLBACK  <-- the 03 Aug regression",
      sell(rally_off_supply)[0], False)
fall_off_demand = [bar(1.3035 - i * .0020, 1.3037 - i * .0020, 1.3030 - i * .0020,
                       1.3031 - i * .0020, i + 1) for i in range(12)]
check("a fall off demand is not a BUY pullback (mirror)", buy(fall_off_demand)[0], False)

# (c) A FULL REVERSAL IS NOT A PULLBACK — price left the zone, then came all the way back through
# it. That is a retap or a break; the retap branch owns it.
reversal = [bar(1.3500 - i * .0020, 1.3502 - i * .0020, 1.3480 - i * .0020, 1.3482 - i * .0020, i + 1)
            for i in range(5)] + \
           [bar(1.3402 + i * .0030, 1.3405 + i * .0030, 1.3400 + i * .0030, 1.3404 + i * .0030, 6 + i)
            for i in range(6)]
check("a full reversal back through the zone is not a pullback", sell(reversal)[0], False)


# ------------------------------------------------------------------- the real thing
print("\nA REAL PULLBACK — move away, then a retracement of it")

# SELL: fall 1.3500 -> 1.3400 (100 pips = 3.3 zone heights), then retrace up to 1.3440 (40% of it).
fall = [bar(1.3500 - i * .0020, 1.3502 - i * .0020, 1.3480 - i * .0020, 1.3482 - i * .0020, i + 1)
        for i in range(5)]                                   # low reaches 1.3400
back = [bar(1.3402, 1.3425, 1.3400, 1.3423, 6), bar(1.3423, 1.3440, 1.3420, 1.3437, 7)]
ok, ext = sell(fall + back)
check("SELL: 100-pip fall then a 40% retrace IS a pullback", ok, True)
check("SELL: extreme is the pullback's own HIGH (1.3440)", round(ext, 4), 1.3440)

# BUY mirror: rise 1.3030 -> 1.3130, retrace down to 1.3090.
rise = [bar(1.3030 + i * .0020, 1.3050 + i * .0020, 1.3028 + i * .0020, 1.3048 + i * .0020, i + 1)
        for i in range(5)]                                   # high reaches 1.3130
dip = [bar(1.3128, 1.3130, 1.3105, 1.3107, 6), bar(1.3107, 1.3109, 1.3090, 1.3092, 7)]
okb, extb = buy(rise + dip)
check("BUY: 100-pip rise then a retrace IS a pullback", okb, True)
check("BUY: extreme is the pullback's own LOW (1.3090)", round(extb, 4), 1.3090)


# ------------------------------------------------------------------- the boundaries
print("\nBOUNDARIES — each constant must actually bite")

# Retrace too shallow: fall to 1.3400, tick up only 10 pips = 10% < 23.6%.
shallow = fall + [bar(1.3402, 1.3410, 1.3400, 1.3408, 6)]
check("a 10% tick-up is a PAUSE, not a pullback", sell(shallow)[0], False)

# Retrace beyond the zone: back above 1.3500 is a retap/break, not a pullback.
through = fall + [bar(1.3402, 1.3560, 1.3400, 1.3555, 6)]
check("retracing past the zone edge is NOT a pullback (that is a retap)", sell(through)[0], False)

# Move away too small: only 20 pips = 0.67 zone heights, under _PB_MIN_MOVE = 1.0.
tiny = [bar(1.3500, 1.3502, 1.3480, 1.3482, 1), bar(1.3482, 1.3484, 1.3480, 1.3483, 2),
        bar(1.3483, 1.3495, 1.3482, 1.3493, 3)]
check("a 20-pip move (0.67 zone heights) is too small to have a pullback", sell(tiny)[0], False)

# Stale: the move's extreme is older than the recency window.
stale = fall + [bar(1.3400 + i * .00001, 1.3402, 1.3399, 1.3401, 6 + i) for i in range(_PB_LOOKBACK_H4 + 3)]
check("an extreme older than the lookback is stale, not a pullback", sell(stale)[0], False)

# Never respected -> there is no move to pull back within.
check("a zone never respected has no pullback",
      pullback_4h(fall + back, SUP_EDGE, SUP_H, None, buy=False), (False, 0.0))
check("zero-height zone is rejected rather than dividing by zero",
      pullback_4h(fall + back, SUP_EDGE, 0.0, RESPECTED, buy=False), (False, 0.0))

# Bars at or before respected_at are not part of the move away from it.
before = [bar(1.3500, 1.3600, 1.3400, 1.3450, -5)]
check("bars before respected_at are ignored", sell(before + fall + back)[1] > 0, True)

check("_PB_MIN_MOVE is 1.0 zone heights (same as REACT_MULT)", _PB_MIN_MOVE, 1.0)
check("_PB_MIN_RETRACE is the shallowest fib the codebase speaks", _PB_MIN_RETRACE, 0.236)
check("_PB_MAX_RETRACE is 1.0 — the zone's own edge", _PB_MAX_RETRACE, 1.0)


# ------------------------------------------------------------------- random-walk sanity
print("\nRANDOM WALKS — the old detector fired on 85.2% of these")
random.seed(7)
hits = N = 0
for _ in range(2000):
    p = 1.3500
    bars = []
    for i in range(14):
        o = p
        p += random.uniform(-0.002, 0.002)
        bars.append(bar(o, max(o, p) + .0002, min(o, p) - .0002, p, i + 1))
    N += 1
    if sell(bars)[0]:
        hits += 1
rate = 100 * hits / N
print(f"  fires on {hits}/{N} = {rate:.1f}%  (was 85.2%)")
check("random-walk fire rate is far below the old 85.2%", rate < 40.0, True)


# ------------------------------------------------- the OR, stated as a truth table
print("\nthe entry gate — retap OR pullback, on a RESPECTED zone")


def gate(respected: bool, retap: bool, pulled: bool, away: bool) -> bool:
    if not respected:
        return False
    return retap or (pulled and away)


check("respected + retap only            -> enter", gate(True, True, False, False), True)
check("respected + 4H pullback outside   -> enter", gate(True, False, True, True), True)
check("respected + both                  -> enter", gate(True, True, True, True), True)
check("respected, price ran away, no pb  -> WAIT", gate(True, False, False, True), False)
check("respected, pullback but inside    -> retap decides", gate(True, False, True, False), False)
check("NOT respected + retap             -> WAIT for the 4H pullback",
      gate(False, True, False, False), False)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
