"""VIX.1 — the momentum-candle gates and grading (`vix1_momentum`).

Every gate is checked BOTH ways: it accepts what it should and rejects what it should. A gate only
ever tested with passing input cannot catch a regression that removes it.

These thresholds were calibrated against the user's own candles. A failure here is a FINDING to
report — never a licence to re-tune the number until the test goes green.
"""
from _harness import Suite, body, flat_series

from strategies.vix1_momentum import (
    _MIN_BASELINE, _MIN_BODY_FRAC, _MIN_BODY_MULT, _MAX_CWICK_FRAC, _MIN_RUN,
    _A_BODY_FRAC, _A_CWICK_FRAC, _A_CONF, _LONG_BARS, _LONG_BODY_MULT, _LONG_MIN_BARS,
    baseline_body, counter_wick, is_momentum_candle, momentum_grade, momentum_run,
    long_baseline, long_requirement,
)

# The long-window test converts pips to a price, so it needs the pair. GBP/USD and EUR/USD are both
# 5-digit, 1 pip = 0.0001 — the same pip these fixtures are built in.
SYM = "GBP/USD"

s = Suite("VIX.1 — momentum candle: gates, grades, runs")

# A baseline of 100 small candles: median body 2 pips. Anything below index 100 is the baseline.
BASE = 0.0002
series = flat_series(120, size=BASE, tf="H1")

s.check("baseline_body reads the median body", round(baseline_body(series, 110), 5), round(BASE, 5))
s.check(f"baseline refuses with fewer than {_MIN_BASELINE} bars", baseline_body(series[:5], 4), 0.0)

# ---------------------------------------------------------------- the four gates
def probe(body_px, rng_px, cwick_px, prev_px=BASE, bullish=True):
    """Build a candle with an exact body / range / counter-wick and test it at the end of a baseline."""
    win = flat_series(110, size=prev_px, tf="H1")
    o = 1.1000
    c = o + body_px if bullish else o - body_px
    with_wick = max(0.0, rng_px - body_px - cwick_px)
    # counter_wick is the REJECTION wick: UPPER on a bull candle, LOWER on a bear (vix1_momentum).
    up, dn = (cwick_px, with_wick) if bullish else (with_wick, cwick_px)
    win.append(body(o, c, tf="H1", t=111, wick_up=up, wick_dn=dn))
    return is_momentum_candle(win, len(win) - 1, bullish, SYM)

BIG = _MIN_BODY_MULT * BASE * 1.2          # comfortably over the size gate
s.check("a clean big candle qualifies", probe(BIG, BIG * 1.1, 0.0), True)

print()
print("   each gate must REJECT when violated:")
s.check(f"  body under {_MIN_BODY_MULT}x the median is rejected",
        probe(BASE * 1.5, BASE * 1.6, 0.0), False)
s.check(f"  body under {_MIN_BODY_FRAC:.0%} of its own range is rejected",
        probe(BIG, BIG * 3.0, 0.0), False)
s.check("  body NOT bigger than the previous candle is rejected",
        probe(BIG, BIG * 1.1, 0.0, prev_px=BIG * 1.05), False)
s.check(f"  counter-wick over {_MAX_CWICK_FRAC:.0%} of range is rejected",
        probe(BIG, BIG / 0.55, BIG * 0.55), False)   # 0.55/1.818 = 30.3% of range
s.check("  a candle in the WRONG direction is rejected",
        probe(BIG, BIG * 1.1, 0.0, bullish=False) if False else
        is_momentum_candle(flat_series(110, size=BASE, tf="H1") +
                           [body(1.1000, 1.1000 + BIG, tf="H1", t=111)], 110, False, SYM), False)

# ---------------------------------------------------------------- with-wick is NOT capped
big_with_wick = flat_series(110, size=BASE, tf="H1")
big_with_wick.append(body(1.1000, 1.1000 + BIG, tf="H1", t=111, wick_up=0.0, wick_dn=BIG * 0.9))
s.check("a LARGE with-move wick does not disqualify (48% appears in his real winners)",
        is_momentum_candle(big_with_wick, 110, True, SYM), True)

# ---------------------------------------------------------------- grading
print()
print("   grading by SHAPE:")
a_body, a_rng = 0.0008, 0.0008 / _A_BODY_FRAC          # exactly 75% body
a = body(1.1000, 1.1000 + a_body, wick_up=0.0, wick_dn=a_rng - a_body)  # bull: WITH-wick is lower
s.check("perfect shape grades A", momentum_grade(a, True)[0], "A")
s.check("A-grade confidence", momentum_grade(a, True)[1], _A_CONF)

# exact fractions: body 75%, counter-wick 15%, with-wick the remaining 10% of the SAME range
edge = body(1.1000, 1.1000 + a_rng * _A_BODY_FRAC,
            wick_up=a_rng * _A_CWICK_FRAC,
            wick_dn=a_rng * (1 - _A_BODY_FRAC - _A_CWICK_FRAC))
s.check("a counter-wick exactly ON the A boundary still grades A", momentum_grade(edge, True)[0], "A")

weak_rng = 0.0008 / 0.60
weak = body(1.1000, 1.1000 + 0.0008, wick_up=weak_rng * _MAX_CWICK_FRAC, wick_dn=0.0)
g, conf = momentum_grade(weak, True)
s.check("the weakest passing shape is not graded A", g != "A", True)
s.check("weak confidence sits in the 0.60-0.74 band", 0.60 <= conf <= 0.74, True)
s.check("a zero-range candle degrades safely", momentum_grade(body(1.1, 1.1), True), ("C", 0.60))

# ---------------------------------------------------------------- the run
print()
print("   the run:")
run_win = flat_series(110, size=BASE, tf="H1")
run_win.append(body(1.1000, 1.1000 + BIG, tf="H1", t=111))
r = momentum_run(run_win, True, SYM)
s.check(f"a single momentum candle is a run (_MIN_RUN={_MIN_RUN})", r is not None, True)
s.check("no momentum candle -> no run", momentum_run(flat_series(110, size=BASE, tf="H1"), True, SYM), None)

# ---------------------------------------------------------------- counter_wick direction
print()
print("   counter_wick = the REJECTION wick: upper on a bull, lower on a bear:")
cw = body(1.1000, 1.1010, wick_up=0.0002, wick_dn=0.0005)
s.check("bullish -> the UPPER (rejection) wick is the counter-wick", round(counter_wick(cw, True), 5), 0.0002)
s.check("bearish -> the LOWER (rejection) wick is the counter-wick", round(counter_wick(cw, False), 5), 0.0005)

# ------------------------------------------- the LONG-WINDOW size gate (added 2026-08-10)
# WHY IT EXISTS: the 100-bar yardstick is only ~4 trading days and four quiet days collapse it.
# GBP/USD 10-Aug 09:00 UTC — median body 2.9p, so 2.5x asked only 7.25p and a 7.5p nothing candle
# fired a signal the user caught. This gate ALSO asks _LONG_BODY_MULT x the median body of the last
# _LONG_BARS bars (~4 months), a window a quiet week cannot move.
#
# NOTE ON THE FIXTURES ABOVE: they are ~110 bars, so long_baseline() cannot form a verdict and the
# gate SKIPS rather than rejects. That is deliberate (a strategy that goes silent on a short window
# would be a worse bug), and it is why every test above still passes unchanged. The cases below
# build a long series precisely so the gate is actually exercised.
print()
print("   the long-window size gate:")

LONG_BASE = 0.0002                     # 2 pip typical candle over the long window
long_hist = flat_series(_LONG_BARS, size=LONG_BASE, tf="H1")
NEED = _LONG_BODY_MULT * LONG_BASE     # what the gate demands, in price

s.check("long_baseline reads the median body over the long window",
        round(long_baseline(long_hist, len(long_hist)), 5), round(LONG_BASE, 5))
s.check("long_requirement states it in PIPS",
        round(long_requirement(long_hist, len(long_hist), SYM), 2),
        round(_LONG_BODY_MULT * 2.0, 2))

def long_probe(body_px):
    """A clean, big-vs-recent candle of an exact body, at the end of a LONG quiet history.

    The 100-bar test is neutralised on purpose: the last 100 bars are shrunk so any of these bodies
    clears 2.5x locally. What is being measured is the long-window gate ALONE.
    """
    win = flat_series(_LONG_BARS, size=LONG_BASE, tf="H1")
    win += flat_series(100, price=1.1000, size=LONG_BASE / 10, tf="H1")   # a quiet recent patch
    o = 1.1000
    win.append(body(o, o - body_px, tf="H1", t=len(win)))                 # bearish, clean, no wicks
    return is_momentum_candle(win, len(win) - 1, False, SYM)

s.check("a body ABOVE the long-window floor is accepted", long_probe(NEED * 1.5), True)
s.check("a body BELOW the long-window floor is rejected", long_probe(NEED * 0.6), False)
s.check("the 10-Aug shape — clears the local test, fails the long-window one", long_probe(NEED * 0.9), False)
# The boundary matters more than it looks: his own 11.3-pip candle computes as 11.30000000000075
# and clears 11.3 by 7.5e-13. A candle EXACTLY on the floor must be admitted, or the rule built
# from his candles would reject his candles.
s.check("a body EXACTLY on the floor is accepted (float tolerance)", long_probe(NEED), True)

s.check("with too little history the gate SKIPS rather than rejects",
        long_requirement(flat_series(_LONG_MIN_BARS - 50, size=LONG_BASE, tf="H1"),
                         _LONG_MIN_BARS - 51, SYM), 0.0)

# ---------------------------------------------------------------- teeth
print()
s.teeth("the size gate", probe(BASE * 0.9, BASE, 0.0) is False)
s.teeth("the A-grade rule", momentum_grade(weak, True)[0] != "A")
s.teeth("the long-window gate", long_probe(NEED * 0.6) is False)

s.done()
