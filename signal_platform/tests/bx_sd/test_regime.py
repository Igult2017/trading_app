"""
BX-S/D — REGIME GATE: pro-trend only while trending, either direction in a range.

WHY. 15 live BX signals audited 2026-08-01: 9 invalidated, 2 executed, 4 expired — and the failures
are concentrated. GBP/JPY fired `buy` FIVE times across 30-31 Jul, all five failed, while GBP/JPY
fell ~580 pips (218.5 -> 212.7). BX was buying demand into a sustained decline, because it had no
direction gate at all.

The book supports the gate: it takes direction from who is in control (*"demand is in control now,
so we can look for long entries"*, p58) and names the main vs counter trend explicitly (p57).

TREND IS A 4H QUESTION, AND ONLY A 4H QUESTION (user, 2026-08-01). D1/W1/MN do a different job:
they earn their place through ZONE CONFLUENCE — an HTF zone over the 4H zone is what makes an
A-grade setup — not by voting on direction.

Two earlier attempts are recorded so neither is rebuilt:
  * requiring 4H and 1D to AGREE gated NOTHING. Replayed against the six real signals, all six read
    ranging and every one was still taken: mid-decline detect(H4) was correctly DOWNTREND while
    detect(D1) read RANGING, and UPTREND at an 80-bar lookback, because over 50 DAYS the pair was
    net HIGHER — a three-day 580-pip fall is invisible at daily scale.
  * the Daily as a VETO passed that one case but cut DOWNTREND readings from 20.5% to 5.1% across
    293 sampled H4 points — three quarters suppressed for one confirmed catch.

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

print("REGIME — read from the 4H alone")
chk("4H up -> uptrend",   regime(UP4), 1)
chk("4H down -> downtrend", regime(DN4), -1)
# THE HIGHER TIMEFRAMES DO NOT VOTE ON TREND. Passing an opposing Daily must change NOTHING —
# D1/W1/MN earn their place through zone confluence (A grade), not by overruling the 4H.
chk("an opposing Daily does NOT change the 4H read (up)",   regime(UP4, DN1), 1)
chk("an opposing Daily does NOT change the 4H read (down)", regime(DN4, UP1), -1)
chk("the real GBP/JPY case reads DOWNTREND", regime(DN4), -1)
teeth("the Daily cannot veto in either direction",
      regime(DN4, UP1) == regime(DN4, None) == regime(DN4) == -1)

print()
print("THE DAILY ARGUMENT IS INERT — kept in the signature, ignored by design")
chk("no D1 at all -> the 4H alone", regime(UP4, None), 1)
chk("D1 passed but ignored", regime(UP4, DN1), 1)
teeth("the Daily argument is inert", regime(UP4) == regime(UP4, DN1) == regime(UP4, UP1) == 1)

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
print("THE REPORTED CASE — GBP/JPY buys into a 4H downtrend")
chk("regime reads downtrend", regime(DN4), -1)
chk("  so a demand (buy) zone is rejected", allowed(regime(DN4), "demand"), False)
chk("  while a supply (sell) zone still fires", allowed(regime(DN4), "supply"), True)

print()
print(f"{'ALL PASS' if not F else str(len(F)) + ' FAILED: ' + str(F)}  ({N} checks)")
sys.exit(1 if F else 0)
