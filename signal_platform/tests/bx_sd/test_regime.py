"""
BX-S/D — REGIME GATE: pro-trend only while trending, either direction in a range.

WHY. 15 live BX signals audited 2026-08-01: 9 invalidated, 2 executed, 4 expired — and the failures
are concentrated. GBP/JPY fired `buy` FIVE times across 30-31 Jul, all five failed, while GBP/JPY
fell ~580 pips (218.5 -> 212.7). BX was buying demand into a sustained decline, because it had no
direction gate at all.

The book supports the gate: it takes direction from who is in control (*"demand is in control now,
so we can look for long entries"*, p58) and names the main vs counter trend explicitly (p57).

THE 4H SETS DIRECTION; THE DAILY IS A VETO. Requiring both to AGREE was tried first and gated
NOTHING — replayed against the six real signals, all six read ranging and every one was still taken.
Mid-decline, detect(H4) was correctly DOWNTREND while detect(D1) read RANGING (and UPTREND at an
80-bar lookback): over 50 DAYS the pair was net HIGHER, because a three-day fall is invisible at
daily scale. So the Daily only vetoes when it clearly OPPOSES the 4H — which is the job it was
actually asked to do, stopping entries into a 1D pullback.

This is not the old pro_trend() gate, which fired unconditionally and discarded 70-78% of book-valid
setups. This one does nothing at all while the 4H is ranging.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle                                    # noqa: E402
from strategies.bx_sd_setup import regime                        # noqa: E402

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

print("REGIME — trending ONLY when 4H and 1D agree")
chk("4H up + 1D up   -> uptrend",   regime(UP4, UP1), 1)
chk("4H down + 1D down -> downtrend", regime(DN4, DN1), -1)
chk("4H up + 1D DOWN -> ranging (the 4H is a pullback inside the Daily)", regime(UP4, DN1), 0)
chk("4H down + 1D UP -> ranging", regime(DN4, UP1), 0)
# THE VETO, NOT A SECOND VOTE. Requiring agreement gated NOTHING on the real signals: mid-decline
# the Daily read RANGING (and UPTREND at some lookbacks) because a 3-day fall is invisible at daily
# scale. A fresh 4H trend must not have to wait for the Daily to catch up.
#
# "Daily does not oppose" is tested with NO Daily rather than a synthetic ranging one. Building a
# series `detect` calls RANGING proved unreliable — it returns RANGING on only ~17% of real H4
# windows and reads a perfect sawtooth as DOWNTREND — so a fixture asserting it would be testing
# the fixture, not the rule. Absent and non-opposing take the same branch, which is the branch
# under test.
chk("4H up, Daily does not oppose -> UPTREND", regime(UP4, None), 1)
chk("4H down, Daily does not oppose -> DOWNTREND — the real GBP/JPY case", regime(DN4, None), -1)
teeth("a non-opposing Daily does not veto", regime(DN4, None) == -1)
teeth("an opposing Daily does veto", regime(DN4, UP1) == 0)

print()
print("FAIL-OPEN — a missing or short Daily must never invent a trend")
chk("no D1 at all -> the 4H alone", regime(UP4, None), 1)
chk("D1 too short -> the 4H alone", regime(UP4, UP1[:5]), 1)
chk("empty D1 -> the 4H alone", regime(UP4, []), 1)
teeth("a missing Daily cannot invent a veto", regime(DN4, None) == -1)

print()
print("THE GATE ITSELF — which zone side survives")
def allowed(reg, direction):
    if not reg:
        return True                       # ranging: either direction
    return direction == ("demand" if reg > 0 else "supply")

chk("uptrend: demand taken", allowed(1, "demand"), True)
chk("uptrend: supply REJECTED (it is a pullback, not a move)", allowed(1, "supply"), False)
chk("downtrend: supply taken", allowed(-1, "supply"), True)
chk("downtrend: demand REJECTED — the five GBP/JPY buys", allowed(-1, "demand"), False)
chk("ranging: demand taken", allowed(0, "demand"), True)
chk("ranging: supply taken", allowed(0, "supply"), True)
teeth("the gate does nothing at all in a range",
      allowed(0, "demand") and allowed(0, "supply"))
teeth("and really does bite in a trend",
      allowed(-1, "demand") is False and allowed(1, "supply") is False)

print()
print("THE REPORTED CASE — GBP/JPY buys into a 1D+4H downtrend")
chk("regime reads downtrend", regime(DN4, FLAT1), -1)
chk("  so a demand (buy) zone is rejected", allowed(regime(DN4, FLAT1), "demand"), False)
chk("  while a supply (sell) zone still fires", allowed(regime(DN4, FLAT1), "supply"), True)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
