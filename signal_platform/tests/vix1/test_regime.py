"""`vix1_regime` — directional efficiency, the range detector VIX.1 has never had.

The property that matters: it must separate a market that GOT somewhere from one that walked a long
way and ended up where it started, with no pivot confirmation and therefore no delay.
"""
import sys

# `_harness` is the suite's bootstrap: it puts signal_platform on the path AND sets a dummy
# DATABASE_URL, which importing anything under `strategies/` needs. Without it these files pass when
# run from the platform root and fail under `run_all.py`, which runs them from this directory.
import _harness  # noqa: F401

from core.types import Candle                                        # noqa: E402
from strategies.vix1_regime import _WINDOW, describe, efficiency     # noqa: E402

PASS = FAIL = 0


def check(label, got, want):
    global PASS, FAIL
    ok = (abs(got - want) < 1e-9) if isinstance(want, float) and isinstance(got, float) else got == want
    if ok:
        PASS += 1
        print(f"  PASS  {label}")
    else:
        FAIL += 1
        print(f"  FAIL  {label}: got {got!r}, want {want!r}")


def series(closes):
    return [Candle(time=i, open=c, high=c + 0.0002, low=c - 0.0002, close=c, volume=0,
                   timeframe="H1") for i, c in enumerate(closes)]


N = _WINDOW

print("\nTHE TWO EXTREMES")
straight = series([1.3000 + i * 0.0010 for i in range(N + 1)])
check("a straight line up -> 1.0", efficiency(straight), 1.0)
straight_dn = series([1.3000 - i * 0.0010 for i in range(N + 1)])
check("a straight line down -> 1.0 (it says nothing about direction)", efficiency(straight_dn), 1.0)

zig = series([1.3000 + (0.0010 if i % 2 else 0.0) for i in range(N + 1)])
check("a perfect zigzag ending where it started -> 0.0", efficiency(zig), 0.0)

print("\nIN BETWEEN — it must be ORDERED, not just right at the ends")
# WHAT IT ACTUALLY MEASURES IS BACKTRACKING, not smoothness. A bar-to-bar wobble SMALLER than the
# trend's step never sends price backwards, so the path length still equals the net distance and
# efficiency is genuinely still 1.0. The first version of this check used wobbles of 0.5 and 1.5 pips
# against a 10-pip step, expected them to score lower, and failed — the fixture was wrong, not the
# code. Pinned both ways now.
STEP = 0.0010


def wobbled(w):
    return efficiency(series([1.3000 + i * STEP + (w if i % 2 else 0.0) for i in range(N + 1)]))


check("a wobble SMALLER than the step does not reduce it — price never went backwards",
      wobbled(STEP * 0.5), 1.0)
# ...and once the wobble exceeds the step, price does go backwards, and it must fall every time.
paths = [wobbled(w) for w in (STEP * 1.5, STEP * 2.5, STEP * 4.0, STEP * 8.0)]
check("once price backtracks, more wandering = lower efficiency, every step",
      all(paths[i] > paths[i + 1] for i in range(len(paths) - 1)), True)
check("...and the wanderiest is still above zero (it did make progress)", paths[-1] > 0, True)

print("\nA REAL RANGE vs A REAL TREND")
# up 40, down 40, up 40, down 40 — a textbook range, ending where it began
rng = []
p = 1.3000
for block in range(4):
    for _ in range(N // 4):
        p += 0.0010 * (1 if block % 2 == 0 else -1)
        rng.append(p)
rng = series([1.3000] + rng)
check("a market that ends where it started scores ~0", efficiency(rng) < 0.05, True)
check("...and a clean trend over the same bars scores far higher",
      efficiency(straight) > 10 * max(efficiency(rng), 1e-9), True)

print("\nTOO LITTLE HISTORY IS NOT A RANGE")
# THE DEFECT THIS PINS: returning 0.0 for a short window would read a freshly-started instrument's
# first hours as a dead range. "Cannot tell yet" and "went nowhere" are opposite facts.
check("fewer than the window -> None, not 0.0", efficiency(straight[:N]), None)
check("exactly window+1 bars -> a number", isinstance(efficiency(straight[:N + 1]), float), True)
check("empty -> None", efficiency([]), None)
check("one bar -> None", efficiency(straight[:1]), None)

print("\nEDGES — nothing here may raise or divide by zero")
flat = series([1.3000] * (N + 1))
check("a dead-still market -> 0.0, no divide-by-zero", efficiency(flat), 0.0)
check("a single jump then still", efficiency(series([1.3000] * N + [1.3100])), 1.0)

print("\nIT USES ONLY THE LAST `n` BARS")
old_chop = series([1.3000 + (0.0100 if i % 2 else 0.0) for i in range(50)]
                  + [1.3000 + i * 0.0010 for i in range(N + 1)])
check("ancient chop does not drag a clean recent trend down", efficiency(old_chop), 1.0)

print("\nTHE DESCRIPTION LINE")
check("it reports two decimals, so the log throttle collapses it",
      describe(0.3141) == f"efficiency 0.31 over the last {N} bars", True)
check("unknown says so rather than printing a number", "unknown" in describe(None), True)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
