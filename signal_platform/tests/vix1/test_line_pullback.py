"""VIX.1 — the LINE (`vix1_lines`) and IS-THIS-A-PULLBACK (`vix1_pullback`).

REWRITTEN 2026-08-20 with the entry rebuild. This file used to test `find_pullback` and
`traded_past` as well — the backwards retrace search and the wick-based past-the-line test. Both are
DELETED: the 1M no longer searches for anything, it takes the one candle after the cross and asks
whether it is a pullback. The cross itself, the order level and the assumed case are covered by
`test_cross.py`; what is left here is the two things that survived unchanged.

THE PAST-THE-LINE GATE IS GONE FROM THIS FILE ON PURPOSE, and that is not a relaxation. The old gate
asked whether the pullback CANDLE sat past the line. The cross now asks something stronger and
earlier — a 1M candle must CLOSE past the line before an entry exists at all — and the order level is
measured from how far price reached, not from where the pullback happens to sit.
"""
from _harness import Suite, body

from strategies.vix1_lines import draw_line
from strategies.vix1_pullback import is_pullback_candle

s = Suite("VIX.1 — the line, and what counts as a pullback candle")

# ── the line ─────────────────────────────────────────────────────────────────
print("   the line is the momentum candle's BODY CLOSE — one line, one float:")
bull_vc = body(1.1000, 1.1050, wick_up=0.0010, wick_dn=0.0005)
bear_vc = body(1.1050, 1.1000, wick_up=0.0005, wick_dn=0.0010)
s.check("bull momentum candle -> its close", draw_line(bull_vc), 1.1050)
s.check("bear momentum candle -> its close", draw_line(bear_vc), 1.1000)
s.check("returns a single float, not a pair", isinstance(draw_line(bull_vc), float), True)
s.check("the wick does NOT move the line", draw_line(bull_vc) != bull_vc.high, True)
s.check("...on a sell either", draw_line(bear_vc) != bear_vc.low, True)

# ── is_pullback_candle — ANY counter candle, rejecting only a whipsaw ────────
print()
print("   is_pullback_candle takes ANY counter candle, rejecting only a whipsaw:")
AVG = 0.0004        # a 4-pip average body

s.check("a candle WITH the bias is not a pullback",
        is_pullback_candle(body(1.1000, 1.1015), True, AVG), False)
s.check("a counter candle IS a pullback",
        is_pullback_candle(body(1.1015, 1.1000), True, AVG), True)
s.check("a doji counts — size never disqualifies at the small end",
        is_pullback_candle(body(1.1000, 1.09998), True, AVG), True)
s.check("a BIG decisive counter candle counts — conviction is not chop",
        is_pullback_candle(body(1.1030, 1.1000), True, AVG), True)

print()
print("   a WHIPSAW needs BOTH halves — abnormally wide AND settling nowhere:")
s.check("wide AND indecisive -> rejected",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, AVG), False)
s.check("wide but DECISIVE -> accepted",
        is_pullback_candle(body(1.1030, 1.1000, wick_up=0.0001, wick_dn=0.0001), True, AVG), True)
s.check("narrow and indecisive -> accepted (it is just a quiet bar)",
        is_pullback_candle(body(1.1010, 1.10099, wick_up=0.0002, wick_dn=0.0002), True, AVG), True)
s.check("with no average known, nothing can be judged abnormal",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, 0.0), True)

print()
print("   SELL mirrors:")
s.check("SELL: an UP candle is the pullback",
        is_pullback_candle(body(1.1000, 1.1015), False, AVG), True)
s.check("SELL: a DOWN candle is not",
        is_pullback_candle(body(1.1015, 1.1000), False, AVG), False)
s.check("SELL: a whipsaw is still rejected",
        is_pullback_candle(body(1.1004, 1.1010, wick_up=0.0015, wick_dn=0.0015), False, AVG), False)

# ── TEETH ────────────────────────────────────────────────────────────────────
s.teeth("the whipsaw test",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, AVG) is False)
s.teeth("the with-the-bias rejection",
        is_pullback_candle(body(1.1000, 1.1015), True, AVG) is False)
s.teeth("the line ignores wicks", draw_line(bull_vc) == 1.1050 != bull_vc.high)

s.done()
