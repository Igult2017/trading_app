"""VIX.1 — the LINE and the PAST-THE-LINE rule (`vix1_lines`, `vix1_pullback`).

The past-the-line gate is the rule the user said every one of his entries used, so it is tested both
ways: a pullback candle NOT past the line must be refused with a reason, one past (or ON) it accepted.
It was once removed on a wrong reading, so this test exists to make that irreversible.
"""
from _harness import Suite, body

from strategies.vix1_lines import draw_line
from strategies.vix1_pullback import find_pullback, is_pullback_candle, traded_past

s = Suite("VIX.1 — the line, and the pullback past it")

# ---------------------------------------------------------------- the line
print("   the line is the momentum candle's BODY CLOSE — one line, one float:")
bull_vc = body(1.1000, 1.1050, wick_up=0.0010, wick_dn=0.0005)
bear_vc = body(1.1050, 1.1000, wick_up=0.0005, wick_dn=0.0010)
s.check("bull momentum candle -> its close", draw_line(bull_vc), 1.1050)
s.check("bear momentum candle -> its close", draw_line(bear_vc), 1.1000)
s.check("returns a single float, not a pair", isinstance(draw_line(bull_vc), float), True)
s.check("the wick does NOT move the line", draw_line(bull_vc) != bull_vc.high, True)

# ---------------------------------------------------------------- past the line
print()
print("   PAST THE LINE — the whole pullback candle must sit past (or on) it:")
LINE = 1.1050

# BUY bias: past the line means ABOVE it. A pullback (bearish) candle wholly above the line qualifies.
above = [body(1.1060, 1.1055, t=i, wick_dn=0.0002) for i in range(3)]
pb, why = find_pullback(above, True, LINE)
s.check("bull: a pullback candle wholly ABOVE the line is accepted", pb is not None, True)

below = [body(1.1045, 1.1040, t=i, wick_dn=0.0002) for i in range(3)]
pb2, why2 = find_pullback(below, True, LINE)
s.check("bull: a pullback candle BELOW the line is refused", pb2, None)
s.check("  and it says why", "line" in (why2 or "").lower(), True)

# straddling the line is NOT past it — the whole candle must be past
straddle = [body(1.1055, 1.1045, t=i) for i in range(3)]
pb3, _ = find_pullback(straddle, True, LINE)
s.check("bull: a candle STRADDLING the line is refused", pb3, None)

# sitting exactly ON the line counts as past
on_line = [body(1.1060, LINE, t=i) for i in range(3)]
pb4, _ = find_pullback(on_line, True, LINE)
s.check("bull: a candle sitting exactly ON the line is accepted", pb4 is not None, True)

# SELL bias mirrors: past means BELOW the line
sell_below = [body(1.1040, 1.1045, t=i, wick_up=0.0002) for i in range(3)]
pb5, _ = find_pullback(sell_below, False, LINE)
s.check("sell: a pullback candle wholly BELOW the line is accepted", pb5 is not None, True)
sell_above = [body(1.1060, 1.1065, t=i, wick_up=0.0002) for i in range(3)]
pb6, why6 = find_pullback(sell_above, False, LINE)
s.check("sell: a pullback candle ABOVE the line is refused", pb6, None)

# ---------------------------------------------------------------- no pullback at all
print()
running = [body(1.1060, 1.1070, t=i) for i in range(3)]          # all WITH the bias
pb7, why7 = find_pullback(running, True, LINE)
s.check("no counter candle -> refused", pb7, None)
s.check("  and it says price is running", "running" in (why7 or "").lower(), True)

# ---------------------------------------------------------------- traded_past (a TRIGGER, live)
print()
print("   traded_past asks a TRIGGER question of the live window:")
s.check("bull: price traded above the line", traded_past([body(1.1040, 1.1060, t=0)], True, LINE), True)
s.check("bull: price never reached the line",
        traded_past([body(1.1000, 1.1010, t=0, wick_up=0.0005)], True, LINE), False)

# ---------------------------------------------------------------- candle shape
print()
# THE PULLBACK IS ANY CANDLE (user, 2026-08-07). The only shape rejection left is the WHIPSAW he
# named himself. The three checks below that changed on that date are marked — they changed because
# THE RULE CHANGED, not to turn a red test green. See the vix1.md fix log for the round trip.
print("   is_pullback_candle takes ANY counter candle, rejecting only a whipsaw:")
AVG = 0.0010
s.check("a candle WITH the bias is not a pullback",
        is_pullback_candle(body(1.1000, 1.1015), True, AVG), False)
s.check("a clean counter candle is a pullback",
        is_pullback_candle(body(1.1015, 1.1000), True, AVG), True)
# CHANGED 2026-08-07: was asserted False under the "significant body" rule. A tiny body is now a
# perfectly good pullback — this is the exact shape that made his 06 Aug entry arrive late.
s.check("a TINY body (far under the recent average) is ACCEPTED",
        is_pullback_candle(body(1.1000, 1.09998), True, AVG), True)
# Still refused, but for the OTHER reason: 0.0010 body in a 0.0050 range, on a 0.0010 average, is
# wide (>= 2.5x) AND settles nowhere (< 60%) — a whipsaw. It was previously labelled as failing the
# 60%-of-range "indecision" gate, which no longer exists.
s.check("a wide bar that settles nowhere is refused as a WHIPSAW",
        is_pullback_candle(body(1.1010, 1.1000, wick_up=0.0020, wick_dn=0.0020), True, AVG), False)
s.check("a WHIPSAW (wide, settles nowhere) is refused",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, AVG), False)
# A small body is only refused when it is ALSO abnormally wide. Narrow + indecisive is fine now.
s.check("a narrow doji (not wide) is ACCEPTED",
        is_pullback_candle(body(1.1010, 1.10099, wick_up=0.0002, wick_dn=0.0002), True, AVG), True)

# ---------------------------------------------------------------- teeth
print()
s.teeth("the past-the-line gate", find_pullback(below, True, LINE)[0] is None)
s.teeth("the straddle rule", find_pullback(straddle, True, LINE)[0] is None)
# TEETH RE-AIMED 2026-08-07. It used to assert that a tiny body was refused — the very gate that has
# been deleted, so left alone it would have failed and tempted the next reader to "fix" it by
# restoring the gate. The shape filter still HAS teeth; they are the whipsaw, so that is what it now
# guards. A test whose teeth are removed rather than re-aimed is worse than no test.
s.teeth("the shape filter (whipsaw)",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, AVG) is False)

# ---------------------------------------------------------------- the first pullback IS the entry
# The point of the 2026-08-07 change. `find_pullback` RETURNS NONE when the first candle of a
# retrace fails, rather than falling through to a later one — so a rejected first candle skipped the
# WHOLE retrace and the entry waited for a later one that opened bigger. That is what he saw on
# GBP/USD 06 Aug: "I got it late... the entry should be immediately at the first pullback."
print()
print("   the FIRST candle of the retrace anchors, whatever its shape:")
SELL_LINE = 1.1050


def _run_then_pullback(pb_candle):
    """A bearish run that breaks below the line, then retraces with `pb_candle` FIRST."""
    run = [body(1.1040 - i * 0.0005, 1.1036 - i * 0.0005, t=i) for i in range(4)]
    return run + [pb_candle]


for shape, c in (
    ("a doji",              body(1.1021, 1.10211, t=9, wick_up=0.0001, wick_dn=0.0001)),
    ("a tiny body",         body(1.1021, 1.10215, t=9)),
    # Wicked, but NOT abnormally wide. My first attempt here used 4-pip wicks on a 0.4-pip body
    # against a ~0.33-pip average — range 2.5x the average with the body settling nowhere, which is
    # a WHIPSAW by his own definition. The code was right to refuse it and the FIXTURE was wrong;
    # kept small so it tests "a wicked small body is fine" rather than smuggling in chop.
    ("a wicked small body", body(1.1021, 1.10214, t=9, wick_up=0.0002, wick_dn=0.0002)),
):
    win = _run_then_pullback(c)
    pb, why = find_pullback(win, False, SELL_LINE)
    s.check(f"{shape} first pullback anchors the entry", pb is win[-1], True)

# ...and the whipsaw still stops one, even as the FIRST candle of a retrace — the one rejection he
# kept. Without this the block above would only prove the gate is gone, not that it is gone SAFELY.
whip = body(1.1021, 1.10214, t=9, wick_up=0.0006, wick_dn=0.0006)
pbw, whyw = find_pullback(_run_then_pullback(whip), False, SELL_LINE)
s.check("a WHIPSAW first candle still gives no entry", pbw, None)

s.done()
