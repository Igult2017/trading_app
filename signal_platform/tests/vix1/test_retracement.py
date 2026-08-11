"""`vix1_retracement` — the retracement counted in real time.

THE THREE PROPERTIES THAT MATTER, and each is a defect in the thing this replaces:
  1. it answers on the SAME bar the retracement starts (the old read was 8 hours late)
  2. it agrees with counting candles by hand, including 1- and 2-candle retracements (the old read
     was blind to them — 99% of real retracements are under 8 candles)
  3. it never reads the still-forming bar (the platform-wide closed-candle rule)

Fixtures are hand-built so every expected answer is countable on paper.
"""
import sys

# `_harness` is the suite's bootstrap: it puts signal_platform on the path AND sets a dummy
# DATABASE_URL, which importing anything under `strategies/` needs. Without it these files pass when
# run from the platform root and fail under `run_all.py`, which runs them from this directory.
import _harness  # noqa: F401

from core.types import Candle                                    # noqa: E402
from strategies.vix1_retracement import Retracement, measure     # noqa: E402

PIP = 0.0001
PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    if got == want:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def bar(lo, hi, close=None, t=0, open_=None):
    """A candle spanning lo..hi. `close` defaults to the top (a bar that closed strong)."""
    return Candle(time=t, open=(lo if open_ is None else open_), high=hi, low=lo,
                  close=(hi if close is None else close), volume=0, timeframe="H1")


def rally(n, base=1.3000, step=0.0010):
    """n bars each 10 pips higher than the last — an unambiguous uptrend (each bar CLOSES UP)."""
    return [bar(base + i * step, base + i * step + step, t=i) for i in range(n)]


def drop(bars, n, step=0.0005):
    """Append n genuinely BEARISH bars, each closing 5 pips below the last.

    They must open at the top and close at the bottom. An earlier version opened and closed at the
    same price — a doji — which is a much weaker fixture: a doji is counted as part of a retracement
    by design, so the test would have passed without the code ever seeing a bearish candle.
    """
    out = list(bars)
    for _ in range(n):
        top = out[-1].close
        out.append(bar(top - step, top, close=top - step, open_=top, t=len(out)))
    return out


def slide(n, base=1.3000, step=0.0010):
    """n genuinely BEARISH bars — an unambiguous downtrend."""
    return [bar(base - i * step - step, base - i * step, close=base - i * step - step,
                open_=base - i * step, t=i) for i in range(n)]


# ---------------------------------------------------------------- 1. counting, by hand
print("\nCOUNTING — the answers here are countable on paper")
up = rally(20)
r = measure(up, +1, since=0)
check("price at the extreme -> no retracement", r.active, False)
check("...and the count is 0", r.bars, 0)

for n in (1, 2, 3, 7, 12):
    r = measure(drop(up, n), +1, since=0)
    check(f"a {n}-candle retracement counts {n}", r.bars, n)
    check(f"  ...and is active", r.active, True)

r = measure(drop(up, 3), +1, since=0)
check("depth is measured from the extreme", round(r.pips / PIP, 1), 15.0)
check("...and is also given as a multiple of ATR", r.atr > 0, True)

# ---------------------------------------------------------------- 2. the TWO counts are different
print("\nTWO COUNTS, TWO QUESTIONS — the live pullback vs how long the trend has stalled")
# THE DESIGN ERROR THIS PINS (found 2026-08-11 by measuring, after the plan was approved). The first
# version reported ONLY the distance from the trend's extreme and called it "the retracement". Over
# 12 months the median came out at 156 candles — true about the trend, useless as "how many candles
# is this pullback". They are separate facts and both are carried.
mixed = drop(up, 4)
top = mixed[-1].close
mixed.append(bar(top, top + 0.0002, close=top + 0.0002, t=len(mixed)))   # a bounce, going our way
mixed = drop(mixed, 3)
r = measure(mixed, +1, since=0)
check("the live pullback is the run since the last up candle: 3", r.bars, 3)
check("...while the trend has not made a new high for 8 candles", r.stall_bars, 8)
check("...so the two numbers genuinely differ", r.bars != r.stall_bars, True)

print("\nA NEW EXTREME — his exact sequence: rally, retracement, then a candle continuing the trend")
ended = list(mixed)
top = max(c.high for c in ended)
ended.append(bar(top, top + 0.0030, t=len(ended)))      # a new high, well clear
r = measure(ended, +1, since=0)
# The count is of the retracement this candle CAME AFTER — the candle itself is stepped over. That
# is the whole shape of his rule, so it must read 3 and not 0.
check("the new-high candle came after a 3-candle retracement", r.bars, 3)
check("the stall count resets — the trend just made progress", r.stall_bars, 0)
check("...and the depth is back to zero", round(r.pips / PIP, 1), 0.0)

print("\n...BUT A RALLY IS NOT A RETRACEMENT")
# TWO trend-way candles at the end means this candle followed a rally, not a retracement. Only ONE
# is stepped over, so the honest answer is 0.
rallied = ended + [bar(ended[-1].close, ended[-1].close + 0.0020, t=len(ended))]
check("two up candles in a row -> came after a rally, count 0", measure(rallied, +1, since=0).bars, 0)
check("...and so it is not active", measure(rallied, +1, since=0).active, False)

# ---------------------------------------------------------------- 3. real-time, not 8 hours late
print("\nREAL TIME — the whole point; the old read needed 8 bars AFTER the turn")
started = drop(up, 1)
r = measure(started, +1, since=0)
check("a retracement is reported on the bar it starts", (r.active, r.bars), (True, 1))
check("no 8-bar wait: the answer at bar 1 is not 0", r.bars != 0, True)

# ---------------------------------------------------------------- 4. the closed-candle rule
print("\nCLOSED CANDLES ONLY — a level from a forming bar drifts every tick")
base = drop(up, 3)
before = measure(base, +1, since=0)
for live_high in (base[-1].high + 0.0050, base[-1].high + 0.0500):
    # the caller is meant to strip this bar; if one ever leaks through, the numbers must not be
    # silently rewritten by a price that is still moving.
    after = measure(base + [bar(base[-1].close, live_high, t=99)], +1, since=0)
    check(f"a forming bar reaching {live_high:.4f} changes the answer (so callers MUST strip it)",
          after.bars != before.bars or after.extreme != before.extreme, True)
check("the module takes no live-price argument at all",
      "price" not in measure.__code__.co_varnames, True)

# ---------------------------------------------------------------- 5. downtrends
print("\nDOWNTRENDS — the same, mirrored")
down = slide(20)
r = measure(down, -1, since=0)
check("price at the low -> no retracement", r.active, False)
low = down[-1].close
rise = down + [bar(low, low + 0.0005, close=low + 0.0005, t=20),
               bar(low + 0.0005, low + 0.0010, close=low + 0.0010, t=21)]
r = measure(rise, -1, since=0)
check("a 2-candle bounce counts 2", r.bars, 2)
check("...and its depth is 10 pips", round(r.pips / PIP, 1), 10.0)
check("...and the stall count agrees here (the low IS 2 candles old)", r.stall_bars, 2)

print("\nA DOJI IS PART OF THE RETRACEMENT, NOT THE END OF IT")
# Deliberate, and the same reading the 1M side uses: a candle that carries the trend on ends a
# retracement, and a doji carries nothing on.
top = up[-1].close
doji = up + [bar(top - 0.0005, top, close=top - 0.0005, open_=top, t=90),      # bearish
             bar(top - 0.0006, top - 0.0004, close=top - 0.0005, open_=top - 0.0005, t=91)]  # doji
check("a bearish candle then a doji counts 2", measure(doji, +1, since=0).bars, 2)

# ---------------------------------------------------------------- 6. where the trend began
print("\nTHE TREND'S OWN LEG — `since` decides which extreme counts")
# A higher peak BEFORE the trend started must not be measured from: the trend's extreme is the best
# it has managed since IT began, not the best in whatever window was passed.
old_peak = [bar(1.3100, 1.3200, close=1.3100, t=0)]
seq = old_peak + drop(rally(10, base=1.3000), 2)
check("with since=0 the old peak wins (wrong leg)",
      measure(seq, +1, since=0).extreme_index, 0)
check("with since past it, the trend's own extreme is used",
      measure(seq, +1, since=1).extreme_index, 10)
check("since=None falls back to the whole window", measure(seq, +1).extreme_index, 0)

# ---------------------------------------------------------------- 7. must never raise
print("\nEDGES — nothing here may raise")
check("no candles -> inactive", measure([], +1, since=0), Retracement())
check("no direction -> inactive", measure(up, 0, since=0), Retracement())
check("one candle -> inactive", measure(up[:1], +1, since=0).active, False)
check("since beyond the end is clamped", measure(up, +1, since=999).bars, 0)
check("negative since is clamped", measure(drop(up, 2), +1, since=-5).bars, 2)
flat = [bar(1.3000, 1.3000, close=1.3000, t=i) for i in range(20)]
check("a dead-flat market -> no retracement, no divide-by-zero", measure(flat, +1, since=0).atr, 0.0)

print("\nTHE DESCRIPTION LINE")
check("nothing before it reads plainly",
      "no retracement before" in measure(up, +1, since=0).describe(PIP), True)
d = measure(drop(up, 1), +1, since=0).describe(PIP)
check("one candle is singular", "retracement of 1 candle;" in d, True)
check("depth is a DECIMAL so the log throttle collapses it", "5.0 pips" in d, True)
check("...and the stall count is named separately", "candles old" in d, True)
check("three candles is plural",
      "retracement of 3 candles;" in measure(drop(up, 3), +1, since=0).describe(PIP), True)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
