"""`vix1_swings` — highs and lows found in REAL TIME.

THE PROPERTY THAT MATTERS, and the whole reason this module exists: a turning point is announced as
soon as the market proves the leg ended, never after a fixed wait. The detector it replaces could not
do that by construction — it defines a peak as "nothing higher for 48 bars EITHER SIDE", which needs
the future and lands a median 2.2 days late.

Fixtures are hand-built so every expected answer is countable on paper.
"""
import sys

# `_harness` puts signal_platform on the path and sets a dummy DATABASE_URL, which anything under
# `strategies/` needs. Without it these pass from the platform root and fail under run_all.py.
import _harness  # noqa: F401

from core.types import Candle                                        # noqa: E402
from strategies.vix1_swings import Turn, as_sequence, turning_points  # noqa: E402
from strategies.vix1_trend import _establish                          # noqa: E402

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bar(lo, hi, close=None, open_=None):
    return Candle(time=0, open=(lo if open_ is None else open_), high=hi, low=lo,
                  close=(hi if close is None else close), volume=0, timeframe="H1")


def series(spec):
    """spec = list of (low, high, close) — built by hand so each turn is countable."""
    return [bar(lo, hi, close=cl) for lo, hi, cl in spec]


# ---------------------------------------------------------------- 1. the basic shape
print("\nA HIGH IS SET WHEN PRICE CLOSES BELOW THE CANDLE THAT MADE IT")
#            low     high    close
up = series([(1.0000, 1.0010, 1.0008),
             (1.0005, 1.0020, 1.0018),
             (1.0015, 1.0030, 1.0028),   # bar 2 — the high, 1.0030, its low is 1.0015
             (1.0012, 1.0025, 1.0020),   # dips but closes ABOVE 1.0015 -> not yet
             (1.0008, 1.0022, 1.0010)])  # bar 4 closes 1.0010, BELOW 1.0015 -> the high is set
t = turning_points(up)
check("exactly one turning point", len(t), 1)
check("...and it is a HIGH", t[0].is_high, True)
check("...at the right price", round(t[0].price, 5), 1.0030)
check("...on the right bar", t[0].index, 2)
check("...confirmed on the bar that closed through it", t[0].confirmed, 4)
check("a candle that dips but does NOT close through it confirms nothing",
      len(turning_points(up[:4])), 0)

print("\nAND THE MIRROR — a low is set when price closes above the candle that made it")
dn = series([(1.0030, 1.0040, 1.0032),
             (1.0020, 1.0030, 1.0022),
             (1.0010, 1.0020, 1.0012),   # bar 2 — the low, 1.0010, its high is 1.0020
             (1.0014, 1.0024, 1.0018),   # closes BELOW 1.0020 -> not yet
             (1.0018, 1.0030, 1.0026)])  # closes 1.0026, ABOVE 1.0020 -> the low is set
t = turning_points(dn)
check("one turning point, a LOW", (len(t), t[0].is_high), (1, False))
check("...at the right price", round(t[0].price, 5), 1.0010)
check("...on the right bar", t[0].index, 2)

# ---------------------------------------------------------------- 2. REAL TIME — the whole point
print("\nREAL TIME — announced when the market says so, never after a fixed wait")
check("the delay here is 2 bars, not 48", turning_points(up)[0].confirmed - turning_points(up)[0].index, 2)
# A sharp reversal is known on the very next bar.
sharp = series([(1.0000, 1.0010, 1.0008),
                (1.0010, 1.0030, 1.0028),   # the high, its low is 1.0010
                (1.0000, 1.0012, 1.0002)])  # next bar closes below 1.0010 -> confirmed immediately
t = turning_points(sharp)
check("a sharp reversal is confirmed on the VERY NEXT bar", t[0].confirmed - t[0].index, 1)
check("...and 3 candles are enough to find a turning point", len(t), 1)

# ---------------------------------------------------------------- 3. no lookahead, ever
print("\nNO LOOKAHEAD — what is known at bar i never changes when later bars arrive")
long_up = up + series([(1.0000, 1.0015, 1.0005), (0.9990, 1.0005, 0.9995),
                       (0.9985, 1.0000, 0.9998), (0.9995, 1.0030, 1.0028)])
prefix = turning_points(long_up[:5])
whole = turning_points(long_up)
check("the first turning point is identical with and without the future",
      (prefix[0].index, prefix[0].price, prefix[0].confirmed),
      (whole[0].index, whole[0].price, whole[0].confirmed), )
check("later bars only ADD turning points, never rewrite them",
      [(t.index, t.is_high) for t in whole][:len(prefix)],
      [(t.index, t.is_high) for t in prefix])

# ---------------------------------------------------------------- 4. they alternate
print("\nTURNING POINTS ALTERNATE — a high is always followed by a low")
zig = series(sum([[(1.0000 + k * 0.0010, 1.0020 + k * 0.0010, 1.0018 + k * 0.0010),
                   (0.9990 + k * 0.0010, 1.0010 + k * 0.0010, 0.9995 + k * 0.0010)]
                  for k in range(6)], []))
t = turning_points(zig)
check("more than one turning point found", len(t) >= 2, True)
check("no two in a row are the same kind",
      all(t[i].is_high != t[i + 1].is_high for i in range(len(t) - 1)), True)
check("each is confirmed AFTER the bar that made it",
      all(x.confirmed > x.index for x in t), True)

# ---------------------------------------------------------------- 5. it feeds HIS trend rule
print("\nIT FEEDS HIS TREND RULE UNCHANGED — high, low, HIGHER high")
seq = as_sequence([Turn(True, 1.1000, 0, 1), Turn(False, 1.0950, 2, 3), Turn(True, 1.1100, 4, 5)])
check("high -> low -> higher high establishes an UPTREND", _establish(seq)[0], 1)
check("...protected by the low between them", round(_establish(seq)[1], 4), 1.0950)
seq_dn = as_sequence([Turn(False, 1.0900, 0, 1), Turn(True, 1.0950, 2, 3), Turn(False, 1.0800, 4, 5)])
check("low -> high -> lower low establishes a DOWNTREND", _establish(seq_dn)[0], -1)

# ---------------------------------------------------------------- 6. must never raise
print("\nEDGES — nothing here may raise")
check("empty -> none", turning_points([]), [])
check("one candle -> none", turning_points(up[:1]), [])
check("two candles -> none", turning_points(up[:2]), [])
flat = series([(1.0, 1.0, 1.0)] * 20)
check("a dead-flat market -> no turning points", turning_points(flat), [])
check("every index is inside the series",
      all(0 <= x.index < len(zig) and 0 <= x.confirmed < len(zig) for x in turning_points(zig)), True)
check("no live-price argument exists", "price" not in turning_points.__code__.co_varnames, True)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
