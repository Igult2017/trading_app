"""`vix1_regime` — TREND / RANGE / CHOP, and the efficiency number that no longer decides anything.

HIS LOCKED NUMBERS (2026-08-12): progress 0.50 x ATR, same-boundary 0.75 x ATR, no minimum swing
size, efficiency removed from the decision.

THE PROPERTY MOST WORTH PINNING is the ORDER of the two tests. The thresholds overlap on purpose — a
high clearing the previous one by 0.6 ATR is both "meaningful progress" (>0.50) and "the same
boundary" (<=0.75). Progression must be asked FIRST or a shallow uptrend reads as a range.
"""
import sys

# `_harness` puts signal_platform on the path and sets a dummy DATABASE_URL, which anything under
# `strategies/` needs. Without it this passes from the platform root and fails under run_all.py.
import _harness  # noqa: F401

from core.types import Candle                                                    # noqa: E402
from strategies.vix1_regime import (CHOP, RANGE, TREND, UNCERTAIN, _BOUNDARY_ATR,  # noqa: E402
                                    _PROGRESS_ATR, _WINDOW, classify, describe,
                                    efficiency)
from strategies.vix1_swings import Turn                                          # noqa: E402

PASS = FAIL = 0
ATR = 0.0010          # 10 pips, close to a real H1 ATR on these pairs


def check(label, got, want):
    global PASS, FAIL
    ok = (abs(got - want) < 1e-9) if isinstance(want, float) and isinstance(got, float) else got == want
    if ok:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def turns(*prices):
    """(is_high, price) pairs -> Turn objects, oldest first."""
    return [Turn(h, p, i, i + 1) for i, (h, p) in enumerate(prices)]


def series(closes):
    return [Candle(time=i, open=c, high=c + 0.0002, low=c - 0.0002, close=c, volume=0,
                   timeframe="H1") for i, c in enumerate(closes)]


print("\nHIS NUMBERS, AS LOCKED")
check("material progress is 0.50 x ATR", _PROGRESS_ATR, 0.50)
check("same-boundary tolerance is 0.75 x ATR", _BOUNDARY_ATR, 0.75)

print("\nTREND — both sides must progress by more than 0.50 ATR")
up = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.6 * ATR + 0.0001),
           (False, 1.0950 + 0.6 * ATR + 0.0001))
check("higher high AND higher low, both clearing 0.5 ATR -> TREND", classify(up, ATR).kind, TREND)
check("...and it says which way", classify(up, ATR).direction, 1)
dn = turns((False, 1.1000), (True, 1.1050), (False, 1.1000 - 0.6 * ATR - 0.0001),
           (True, 1.1050 - 0.6 * ATR - 0.0001))
check("lower high AND lower low -> TREND down", (classify(dn, ATR).kind, classify(dn, ATR).direction),
      (TREND, -1))

print("\n...but ONE side progressing is not a trend")
# a higher high with a LOWER low is price broadening out, not a trend
one = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 2 * ATR), (False, 1.0950 - 2 * ATR))
check("higher high + lower low -> NOT a trend", classify(one, ATR).kind != TREND, True)
check("...it is CHOP, because neither boundary holds", classify(one, ATR).kind, CHOP)

print("\nRANGE — no progress, and both boundaries hold within 0.75 ATR")
rng = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.5 * ATR),
            (False, 1.0950 + 0.5 * ATR))
check("highs within 0.75 ATR and lows within 0.75 ATR -> RANGE", classify(rng, ATR).kind, RANGE)
check("...and it is not tradeable", classify(rng, ATR).tradeable, False)
check("...and it says the boundaries held", "bounded range" in classify(rng, ATR).why, True)

print("\nCHOP — no progress, and a boundary does NOT hold")
chop = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 - 2 * ATR), (False, 1.0950 + 0.1 * ATR))
check("highs scattered beyond 0.75 ATR -> CHOP", classify(chop, ATR).kind, CHOP)
check("...and it names which side is scattered", "highs" in classify(chop, ATR).why, True)
chop2 = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.1 * ATR), (False, 1.0950 - 2 * ATR))
check("lows scattered beyond 0.75 ATR -> CHOP", classify(chop2, ATR).kind, CHOP)

print("\nTHE ORDER OF THE TESTS IS LOAD-BEARING")
# 0.6 ATR is BOTH "meaningful progress" (>0.50) AND "the same boundary" (<=0.75). Progression must be
# asked first, or this shallow uptrend reads as a range.
edge = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.6 * ATR), (False, 1.0950 + 0.6 * ATR))
check("a 0.6 ATR advance is a TREND, not a range", classify(edge, ATR).kind, TREND)

print("\nTHE BOUNDARIES OF THE THRESHOLDS THEMSELVES")
exact = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.5 * ATR),
              (False, 1.0950 + 0.5 * ATR))
check("EXACTLY 0.50 ATR is NOT progress (strictly greater required)",
      classify(exact, ATR).kind != TREND, True)
# THE BOUNDARY TEST IS ONLY REACHABLE WHEN THE TWO SIDES DISAGREE. If both moved 0.75 ATR the same
# way, progression fires first and it is a TREND however you feel about 0.75 — which is the overlap
# working as intended. (The first version of this check moved both sides 0.75 and expected RANGE; the
# fixture was wrong, not the code.) So the edge is tested with one side ON the line and the other flat.
onbound = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.75 * ATR),
                (False, 1.0950 + 0.1 * ATR))
check("EXACTLY 0.75 ATR apart still counts as the same boundary", classify(onbound, ATR).kind, RANGE)
over = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.76 * ATR),
             (False, 1.0950 + 0.1 * ATR))
check("a hair beyond 0.75 ATR is no longer the same boundary -> CHOP", classify(over, ATR).kind, CHOP)

print("\nNOT ENOUGH STRUCTURE IS NOT A VERDICT")
check("one high and one low -> UNCERTAIN",
      classify(turns((True, 1.10), (False, 1.09)), ATR).kind, UNCERTAIN)
check("no turns at all -> UNCERTAIN", classify([], ATR).kind, UNCERTAIN)
check("...and it says why", "not enough" in classify([], ATR).why, True)
check("no volatility reading -> UNCERTAIN, never a guess", classify(up, 0.0).kind, UNCERTAIN)
check("UNCERTAIN is not tradeable", classify([], ATR).tradeable, False)

print("\nONLY A TREND IS TRADEABLE")
check("trend -> tradeable", classify(up, ATR).tradeable, True)
check("range -> not", classify(rng, ATR).tradeable, False)
check("chop -> not", classify(chop, ATR).tradeable, False)

print("\nIT SCALES WITH VOLATILITY, NOT WITH PIPS")
# the same structure in a market twice as volatile must read differently
half = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.6 * ATR),
             (False, 1.0950 + 0.6 * ATR))
check("a 0.6 ATR move is a trend at this volatility", classify(half, ATR).kind, TREND)
check("...and the SAME move is not, once ATR doubles", classify(half, 2 * ATR).kind != TREND, True)

print("\nEFFICIENCY — still measured, no longer consulted")
straight = series([1.3000 + i * 0.0010 for i in range(_WINDOW + 1)])
check("a straight line -> 1.0", efficiency(straight), 1.0)
zig = series([1.3000 + (0.0010 if i % 2 else 0.0) for i in range(_WINDOW + 1)])
check("a perfect zigzag -> 0.0", efficiency(zig), 0.0)
check("too little history -> None, not 0.0", efficiency(straight[:_WINDOW]), None)
check("a dead-still market -> 0.0, no divide-by-zero",
      efficiency(series([1.3000] * (_WINDOW + 1))), 0.0)
check("it reports two decimals for the log throttle",
      describe(0.3141) == f"efficiency 0.31 over the last {_WINDOW} bars", True)
check("no threshold constant survives in this module",
      any(n.startswith("_RANGE_EFF") for n in dir(__import__(
          "strategies.vix1_regime", fromlist=["x"]))), False)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
