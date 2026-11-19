"""
PIX — THE 4H TREND READ (`strategies/pix_trend.regime`): up, down, or ranging, from the 4H alone.

His skeleton, 18 Nov 2026: *"In 4 hours, we want to confirm if we are trending or not."* Which zone side a trend
allows is proved through the real strategy in tests/pix/test_skeleton.py, not re-implemented here.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                    # noqa: E402
from strategies.pix_trend import regime                        # noqa: E402

F, N = [], 0


def chk(name, got, want):
    global N
    N += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        F.append(name)


def teeth(name, broke):
    global N
    N += 1
    print(f"   {'PASS' if broke else 'FAIL'}  TEETH — {name}: {bool(broke)}")
    if not broke:
        F.append("TEETH:" + name)


def series(start, step, n=60, tf="H4"):
    """A ZIGZAG trend — net rise/fall carried by legs with pullbacks between them.

    NOT a monotonic staircase. `detect` reads structure through `find_swing_points`, and a straight
    line has no local extremes, so it has no swing points and correctly reads RANGING. The first
    version of this fixture was a clean staircase and failed for exactly that reason — the fixture
    was wrong, not the detector. A real uptrend is higher highs AND higher lows; the fixture has to
    contain both or it is not testing a trend.
    """
    out, price, leg = [], start, 0
    for i in range(n):
        # 4 bars with the trend, then 2 against — net progress plus a genuine pullback.
        d = step if leg < 4 else -step * 0.5
        leg = (leg + 1) % 6
        o, c = price, price + d
        price = c
        hi, lo = max(o, c) + abs(step) * 0.25, min(o, c) - abs(step) * 0.25
        out.append(Candle(time=1700000000 + i * 14400, open=o, high=hi, low=lo, close=c,
                          volume=0, timeframe=tf))
    return out


def choppy(base, n=60, tf="H4"):
    """A genuine RANGE — swings up and down between two bounds, no net direction.

    Alternating single bars are not a range, they are noise: the first version flipped every candle
    and `detect` read it as a DOWNTREND. A range still needs swing points; it just needs the highs
    to stop rising and the lows to stop falling.

    THE AMPLITUDE JITTER IS LOAD-BEARING. A perfect sawtooth makes every high EXACTLY equal and
    every low EXACTLY equal, and `detect` classifies that as DOWNTREND rather than RANGING — a
    degenerate case worth knowing about, since the regime gate depends on this detector. Real
    ranges are never exactly equal, so the fixture varies each leg slightly and tests the case that
    actually occurs.
    """
    out, price = [], base
    for i in range(n):
        leg = i // 6
        amp = 0.004 + (0.0006 if leg % 4 == 1 else -0.0004 if leg % 4 == 3 else 0.0)
        d = amp if leg % 2 == 0 else -amp
        o, c = price, price + d
        price = c
        out.append(Candle(time=1700000000 + i * 14400, open=o, high=max(o, c) + 0.001,
                          low=min(o, c) - 0.001, close=c, volume=0, timeframe=tf))
    return out


UP4, DN4, FLAT4 = series(1.10, 0.004), series(1.30, -0.004), choppy(1.20)
UP1, DN1, FLAT1 = series(1.10, 0.004, tf="D1"), series(1.30, -0.004, tf="D1"), choppy(1.20, tf="D1")

print("REGIME — read from the 4H alone")
chk("4H up -> uptrend",   regime(UP4), 1)
chk("4H down -> downtrend", regime(DN4), -1)
teeth("up and down really differ", regime(UP4) != regime(DN4))
FORMING = UP4[:-1] + [Candle(time=2_000_000_000_0, open=UP4[-1].open, high=9, low=0.5, close=0.5, volume=0, timeframe="H4")]
def zig(points, per=3):
    """A genuinely FLAT range: highs alternate 1.2105/1.2125, lows 1.1995/1.1975 — no net direction."""
    out, k = [], 0
    for a, b in zip(points, points[1:]):
        for s_ in range(per):
            o, c = a + (b - a) * s_ / per, a + (b - a) * (s_ + 1) / per
            up = c > o
            out.append(Candle(time=1700000000 + k * 14400, open=o, high=max(o, c) + (0.0005 if up else 0.0002),
                              low=min(o, c) - (0.0002 if up else 0.0005), close=c, volume=0, timeframe="H4"))
            k += 1
    return out


pts = []
for i in range(12):
    pts += [1.200 - (0.002 if i % 2 else 0), 1.210 + (0.002 if i % 2 else 0)]
FLAT = zig(pts)
reads = [regime(FLAT[:len(FLAT) - cut]) for cut in range(12)]
chk("a flat range reads RANGING wherever the window ends (was 4 down / 4 ranging / 4 up)", reads, [0] * 12)
import strategies.pix_trend as PT  # noqa: E402
PT.MIN_LEAD = 1
teeth("with a lead of 1 (the old rule) the flat range flickers again", [regime(FLAT[:len(FLAT) - c]) for c in range(12)] != [0] * 12)
PT.MIN_LEAD = 2
SAW = zig([1.200, 1.210] * 12)
chk("a perfect sawtooth (every high and low EXACTLY equal) reads RANGING, not down", regime(SAW), 0)
chk("a still-forming last candle is ignored (closed candles only)", regime(FORMING), regime(UP4[:-1]))

import time as _t  # noqa: E402
import strategies.pix_candles as PC  # noqa: E402
old_rule = lambda cs, now: [c for c in cs if c.time + PC.bar_seconds(c.timeframe) <= now]  # noqa: E731 — the old way
now = _t.time()
mixed = UP4[:-3] + [Candle(time=int(now) - 3600 * k, open=1, high=1, low=1, close=1, volume=0, timeframe="H4")
                    for k in (5, 2, 1)]                      # the last three: closed, forming, forming
chk("FAST closed-candle check = the old one-by-one check on a series with forming candles at the end",
    [c.time for c in PC.closed_only(mixed, now)], [c.time for c in old_rule(mixed, now)])
chk("...and on a fully closed series", len(PC.closed_only(UP4, now)), len(old_rule(UP4, now)))
chk("...it returns a COPY (changing the result never changes the caller's candles)",
    PC.closed_only(UP4, now) is UP4, False)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
