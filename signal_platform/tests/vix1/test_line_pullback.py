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
print("   is_pullback_candle rejects the shapes that mark no level:")
AVG = 0.0010
s.check("a candle WITH the bias is not a pullback",
        is_pullback_candle(body(1.1000, 1.1015), True, AVG), False)
s.check("a clean counter candle is a pullback",
        is_pullback_candle(body(1.1015, 1.1000), True, AVG), True)
s.check("an insignificant body (under the recent average) is refused",
        is_pullback_candle(body(1.1000, 1.09998), True, AVG), False)
s.check("indecision (body under 60% of its own range) is refused",
        is_pullback_candle(body(1.1010, 1.1000, wick_up=0.0020, wick_dn=0.0020), True, AVG), False)
s.check("a WHIPSAW (wide, settles nowhere) is refused",
        is_pullback_candle(body(1.1010, 1.1004, wick_up=0.0015, wick_dn=0.0015), True, AVG), False)

# ---------------------------------------------------------------- teeth
print()
s.teeth("the past-the-line gate", find_pullback(below, True, LINE)[0] is None)
s.teeth("the straddle rule", find_pullback(straddle, True, LINE)[0] is None)
s.teeth("the shape filter", is_pullback_candle(body(1.1000, 1.09998), True, AVG) is False)

s.done()
