"""`shared.candle_math.atr` — the yardstick every depth measurement is divided by.

It exists so a distance can be read as BIG or SMALL rather than just a number of pips. If it is
wrong, every retracement depth reported on a card is wrong with it, silently and in the same
direction — so it is pinned here rather than trusted.
"""
import sys

# `_harness` is the suite's bootstrap: it puts signal_platform on the path AND sets a dummy
# DATABASE_URL, which importing anything under `strategies/` needs. Without it these files pass when
# run from the platform root and fail under `run_all.py`, which runs them from this directory.
import _harness  # noqa: F401

from core.types import Candle                       # noqa: E402
from shared.candle_math import atr                  # noqa: E402

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    ok = (abs(got - want) < 1e-9) if isinstance(want, float) else got == want
    if ok:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bar(o, h, l, c, t=0):
    return Candle(time=t, open=o, high=h, low=l, close=c, volume=0, timeframe="H1")


print("\nTHE PLAIN CASE")
flat = [bar(1.0, 1.0010, 1.0000, 1.0005, i) for i in range(20)]
check("identical 10-pip bars -> 10 pips", round(atr(flat) / 0.0001, 6), 10.0)

print("\nTRUE RANGE — a gap counts, and this is the whole reason it is not just high-minus-low")
# Bar 2 opens far ABOVE bar 1's close. Its own high-low is 10 pips, but from the previous close it
# has covered 60. A high-minus-low average would report 10 and understate the move six-fold.
gap = [bar(1.0000, 1.0010, 1.0000, 1.0000, 0),
       bar(1.0050, 1.0060, 1.0050, 1.0055, 1)]
check("a gapping bar measures from the previous close, not its own low",
      round(atr(gap, n=1) / 0.0001, 6), 60.0)
check("...and high-minus-low alone would have said 10 (the error this avoids)",
      round((gap[1].high - gap[1].low) / 0.0001, 6), 10.0)

print("\nEDGES — nothing here may raise or divide by zero")
check("empty list -> 0.0", atr([]), 0.0)
check("one candle -> its own range", round(atr([bar(1.0, 1.0020, 1.0000, 1.0010)]) / 0.0001, 6), 20.0)
check("a zero-range candle -> 0.0", atr([bar(1.0, 1.0, 1.0, 1.0)]), 0.0)
check("fewer candles than n still answers",
      round(atr([bar(1.0, 1.0010, 1.0000, 1.0005, i) for i in range(3)], n=14) / 0.0001, 6), 10.0)

print("\nTHE WINDOW — only the last n bars count")
# 14 quiet bars after one huge one: the huge bar must fall outside the window and not inflate it.
mixed = ([bar(1.0000, 1.0500, 1.0000, 1.0005, 0)]
         + [bar(1.0000, 1.0010, 1.0000, 1.0005, i) for i in range(1, 20)])
check("an old outlier is outside the window", round(atr(mixed, n=14) / 0.0001, 6), 10.0)
# ...and the SAME outlier, when it is the most recent bar, must lift it. `mixed` has the big bar
# oldest; this one has it newest. (The first version of this check sliced `mixed[:2]`, which puts the
# outlier at the START of a 1-bar window — it was testing the old case twice and calling it the new.)
recent = ([bar(1.0000, 1.0010, 1.0000, 1.0005, i) for i in range(19)]
          + [bar(1.0000, 1.0500, 1.0000, 1.0005, 19)])
check("a recent outlier is inside it", atr(recent, n=14) > 10 * 0.0001, True)

print("\nSCALE — it must be a price, so depth/atr is a plain number")
jpy = [bar(150.00, 150.10, 150.00, 150.05, i) for i in range(20)]
check("JPY bars measure in JPY, not pips", round(atr(jpy), 6), round(0.10, 6))
check("a 20-pip move on a 10-pip ATR reads as 2.0x",
      round((0.0020) / atr(flat), 6), 2.0)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
