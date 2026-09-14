"""VIX.1 — the chop detector (his band idea). BUILT, NOT SWITCHED ON.

His instruction, 2026-09-14: "Build it and then dont enable it. We will have to continue working on
it." So this file pins two different kinds of fact:

  * WHAT IT READS — price bouncing across the middle of its band is choppy, a clean one-way run is
    not, and too few candles is "cannot say", which allows.
  * THAT IT IS OFF — nothing in the live strategy calls it. That one check reads source text, which
    this suite normally avoids; here it is the point. The day the detector is wired, this check must
    be changed on purpose, rather than the detector switching on quietly.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from pathlib import Path

from _harness import Suite, body

from strategies import vix1_chop

s = Suite("VIX.1 — the chop detector (band), built and NOT switched on")


def candles(closes):
    """One H1 candle per step, each opening where the one before it closed."""
    return [body(closes[i - 1], closes[i], tf="H1", t=i, wick_up=0.00005, wick_dn=0.00005)
            for i in range(1, len(closes))]


# 1. SIDEWAYS — up and down between two lines, 24 candles.
print()
print("PRICE BOUNCING BETWEEN TWO LINES")
side = candles([1.1000 + (0.0030 if k % 2 else 0.0) for k in range(25)])
r = vix1_chop.read(side)
s.check("24 candles were read", (r.judged, r.counted), (True, 24))
s.check("price bouncing between two lines reads CHOPPY", r.choppy, True)
s.check("  ...because it crossed back through the middle 6 or more times", r.came_back >= 6, True)
s.check("  ...and the refusal reason says so",
        "crossed back through the middle" in (vix1_chop.market_not_choppy(side) or ""), True)

# 2. A CLEAN RUN — one way, 24 candles.
print()
print("A CLEAN ONE-WAY RUN")
run = candles([1.1000 + 0.0005 * k for k in range(25)])
rr = vix1_chop.read(run)
s.check("a clean one-way run does NOT read choppy", rr.choppy, False)
s.check("  ...it crosses the middle once, on its way through", rr.came_back, 1)
s.check("  ...and nothing is refused", vix1_chop.market_not_choppy(run), None)
s.teeth("the count is what separates them — same length, opposite answers",
        r.choppy and not rr.choppy)

# 3. TOO FEW CANDLES — cannot say, which ALLOWS.
print()
print("TOO FEW CANDLES")
short = side[:10]
s.check("10 candles is too few to judge", vix1_chop.read(short).judged, False)
s.check("  ...and too few is never a refusal", vix1_chop.market_not_choppy(short), None)

# 4. IT IS NOT SWITCHED ON.
print()
print("NOT SWITCHED ON — his instruction")
_strategies = Path(vix1_chop.__file__).parent
_callers = sorted(f.name for f in _strategies.glob("*.py")
                  if f.name != "vix1_chop.py" and "vix1_chop" in f.read_text(encoding="utf-8"))
s.check("nothing in the strategy code calls the chop detector", _callers, [])

s.done()
