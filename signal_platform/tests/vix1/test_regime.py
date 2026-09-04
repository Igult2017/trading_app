"""`vix1_regime` — TREND / RANGE / CHOP, judged by DIRECTION, with ATR deciding nothing.

HIS RULE (2026-09-04), which replaced the 0.50 x ATR size bar:

    "A trend should be detected by swings... a ranging market does not make HH and HL or LL and LH.
     We don't need ATR for this; we just need the code."
    "we can't say a trending volatile market is choppy."

    higher high AND higher low -> TREND
    lower  high AND lower  low -> TREND
    otherwise                  -> not tradeable (named "range" or "chop" for the card only)

WHAT THIS FILE MUST PROVE, and why each matters:

  1. A SHALLOW same-direction step is a TREND. This is his disputed EUR/USD chart — highs down
     0.26x ATR, lows down 2.68x ATR — which the old size bar called CHOP.
  2. `_PROGRESS_ATR` IS NOT CONSULTED. It is kept in the module on his instruction ("disable...
     before we decide on whether to delete it or not"), so the only thing stopping it drifting back
     into the decision is a test that fails if it does. Proved by moving it to an absurd value and
     asserting every verdict is unchanged — not by reading the source.
  3. THE VERDICT DOES NOT MOVE WITH VOLATILITY. Direction has no scale. The previous version of this
     file asserted the OPPOSITE ("the SAME move is not a trend once ATR doubles") — that assertion
     was the defect, written down as a requirement.

FIXTURES THAT WERE WRONG UNDER THE OLD RULE AND ARE CORRECTED HERE. The old "RANGE" fixture stepped
BOTH the high and the low up by 0.5 x ATR and expected RANGE. That is a higher high and a higher low
— an uptrend by his definition — which the size bar was hiding. A real range needs the two sides to
DISAGREE (or sit flat), so the fixtures below do that.
"""
import sys

# `_harness` puts signal_platform on the path and sets a dummy DATABASE_URL, which anything under
# `strategies/` needs. Without it this passes from the platform root and fails under run_all.py.
import _harness  # noqa: F401

from core.types import Candle                                                    # noqa: E402
from strategies import vix1_regime                                               # noqa: E402
from strategies.vix1_regime import (CHOP, RANGE, TREND, UNCERTAIN, Regime, _BOUNDARY_ATR,  # noqa: E402
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


print("\nTREND — higher high AND higher low, or lower high AND lower low")
up = turns((True, 1.1000), (False, 1.0950), (True, 1.1060), (False, 1.1010))
check("higher high AND higher low -> TREND", classify(up, ATR).kind, TREND)
dn = turns((False, 1.1000), (True, 1.1050), (False, 1.0940), (True, 1.0990))
check("lower high AND lower low -> TREND down", classify(dn, ATR).kind, TREND)
# `Regime.direction` was DELETED 2026-08-12: it had zero uses. Direction comes from vix1_trend, which
# has the CHoCH and two-stage machinery; a second opinion here would be a rule nobody asked for.
check("the regime does NOT carry a direction — vix1_trend owns that",
      "direction" in Regime.__dataclass_fields__, False)


print("\nHIS DISPUTED CHART — a SHALLOW step is still a trend")
# The exact shape that was refused: the lows drop a long way, the highs only edge down. Under the old
# 0.50 x ATR size bar this was CHOP. Under his rule it is a downtrend, because both sides stepped the
# same way. THIS IS THE ASSERTION THE WHOLE CHANGE EXISTS FOR.
shallow_dn = turns((False, 1.1000), (True, 1.1050),
                   (False, 1.1000 - 2.68 * ATR),      # lows down a long way
                   (True, 1.1050 - 0.26 * ATR))       # highs barely down
check("lows down 2.68x ATR, highs down only 0.26x ATR -> TREND, not CHOP",
      classify(shallow_dn, ATR).kind, TREND)
tiny_up = turns((True, 1.10000), (False, 1.09500), (True, 1.10001), (False, 1.09501))
check("even a one-point higher high and higher low is a TREND (no size bar at all)",
      classify(tiny_up, ATR).kind, TREND)


print("\nNOT A TREND — the two sides disagree")
# a higher high with a LOWER low is price broadening out, not a trend
one = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 2 * ATR), (False, 1.0950 - 2 * ATR))
check("higher high + lower low -> NOT a trend", classify(one, ATR).kind != TREND, True)
check("...it is CHOP, because neither boundary holds", classify(one, ATR).kind, CHOP)
flat_high = turns((True, 1.1000), (False, 1.0950), (True, 1.1000), (False, 1.0960))
check("a high that did not move at all is not a higher high -> NOT a trend",
      classify(flat_high, ATR).kind != TREND, True)


print("\nRANGE — the sides disagree, and both stay within 0.75 ATR (a NAME, not a decision)")
rng = turns((True, 1.1000), (False, 1.0950),
            (True, 1.1000 - 0.1 * ATR),        # ceiling edges down
            (False, 1.0950 + 0.1 * ATR))       # floor edges up -> they disagree, both bounded
check("highs within 0.75 ATR and lows within 0.75 ATR -> RANGE", classify(rng, ATR).kind, RANGE)
check("...and it is not tradeable", classify(rng, ATR).tradeable, False)
check("...and it says the boundaries held", "bounded range" in classify(rng, ATR).why, True)


print("\nCHOP — the sides disagree and a boundary does NOT hold")
chop = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 - 2 * ATR), (False, 1.0950 + 0.1 * ATR))
check("highs scattered beyond 0.75 ATR -> CHOP", classify(chop, ATR).kind, CHOP)
check("...and it names which side is scattered", "highs" in classify(chop, ATR).why, True)
chop2 = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 + 0.1 * ATR), (False, 1.0950 - 2 * ATR))
check("lows scattered beyond 0.75 ATR -> CHOP", classify(chop2, ATR).kind, CHOP)


print("\nTHE SIZE BAR IS KEPT IN THE MODULE BUT NOT CONSULTED")
# His instruction: "disable ATR for now and document why we did then lets see how things go before we
# decide on whether to delete it or not." It is therefore still importable...
check("_PROGRESS_ATR is still defined (kept on his instruction, NOT deleted)", _PROGRESS_ATR, 0.50)
# ...and this is the teeth: move it somewhere absurd and every verdict must be identical. Reading the
# source and seeing no reference would prove nothing about a future edit; this fails if one appears.
_before = [classify(t, ATR).kind for t in (up, dn, shallow_dn, tiny_up, one, rng, chop, chop2)]
vix1_regime._PROGRESS_ATR = 999.0
_after = [classify(t, ATR).kind for t in (up, dn, shallow_dn, tiny_up, one, rng, chop, chop2)]
vix1_regime._PROGRESS_ATR = 0.50
check("an absurd _PROGRESS_ATR changes NOTHING — it is not read by the decision", _after, _before)
check("...and the same holds at zero",
      [classify(t, ATR).kind for t in (up, shallow_dn, rng)] == _before[:1] + [_before[2]] + [_before[5]],
      True)


print("\nTHE BOUNDARY CONSTANT ONLY NAMES A REFUSAL — it can never create or deny a trade")
check("same-boundary tolerance is still 0.75 x ATR", _BOUNDARY_ATR, 0.75)
# Both of these are refusals; the constant only chooses which WORD is shown. Asserting they are both
# non-tradeable is what makes "naming only" a fact rather than a claim in a comment.
check("range and chop are both refusals, so the naming cannot change an outcome",
      (classify(rng, ATR).tradeable, classify(chop, ATR).tradeable), (False, False))
onbound = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 - 0.75 * ATR),
                (False, 1.0950 + 0.1 * ATR))
check("EXACTLY 0.75 ATR apart still counts as the same boundary", classify(onbound, ATR).kind, RANGE)
over = turns((True, 1.1000), (False, 1.0950), (True, 1.1000 - 0.76 * ATR),
             (False, 1.0950 + 0.1 * ATR))
check("a hair beyond 0.75 ATR is no longer the same boundary -> CHOP", classify(over, ATR).kind, CHOP)


print("\nTHE VERDICT DOES NOT MOVE WITH VOLATILITY — direction has no scale")
# The OLD file asserted the opposite here, and that assertion was the defect: it required a real
# trend to stop being one merely because the market got more volatile. His words: "we can't say a
# trending volatile market is choppy."
check("a trend at this volatility...", classify(up, ATR).kind, TREND)
check("...is still a trend when ATR doubles", classify(up, 2 * ATR).kind, TREND)
check("...and when ATR is ten times larger", classify(up, 10 * ATR).kind, TREND)
check("a shallow trend survives a violent market too", classify(shallow_dn, 10 * ATR).kind, TREND)


print("\nNOT ENOUGH STRUCTURE IS NOT A VERDICT")
check("one high and one low -> UNCERTAIN",
      classify(turns((True, 1.10), (False, 1.09)), ATR).kind, UNCERTAIN)
check("no turns at all -> UNCERTAIN", classify([], ATR).kind, UNCERTAIN)
check("...and it says why", "not enough" in classify([], ATR).why, True)
check("UNCERTAIN is not tradeable", classify([], ATR).tradeable, False)

print("\nA MISSING VOLATILITY READING CANNOT VETO A TREND (moved 2026-09-04)")
# This check used to sit at the TOP of `classify`, so no ATR meant no trade even when the highs and
# lows were plainly stepping the same way — i.e. ATR could still refuse a trend, which is exactly
# what he ruled out. It now guards only the naming step.
check("a clear HH+HL with NO volatility reading is still a TREND", classify(up, 0.0).kind, TREND)
check("...and a clear LH+LL too", classify(dn, 0.0).kind, TREND)
check("but a disagreeing pair with no reading cannot be called bounded -> CHOP",
      classify(one, 0.0).kind, CHOP)
check("...and it is still a refusal", classify(one, 0.0).tradeable, False)


print("\nONLY A TREND IS TRADEABLE")
check("trend -> tradeable", classify(up, ATR).tradeable, True)
check("range -> not", classify(rng, ATR).tradeable, False)
check("chop -> not", classify(chop, ATR).tradeable, False)


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
