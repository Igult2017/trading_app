"""VIX.1 — THE CANDLE THAT BREAKS a change of character or a break of structure must qualify ON ITS OWN (19 Nov 2026).

HIS RULE: *"Remove that rule. And replace with the candle that breaks CHOCH or BOS to be a qualifying volume candle
that qualifies on its own not by memory or error margin."* It replaces his 29 Sep "with no pullback the trade comes
from the 3rd candle after the break".

Proved on hand-built 1H candles with known answers: 120 ordinary candles with 2-pip bodies (median 2 pips), so his
2.5x rule needs 5 pips and the 0.2 margin would let in 4.6. Every key rule has TEETH.
"""
import os
from _harness import Suite, body

import strategies.vix1_break_candle as B
from strategies.vix1_momentum import qualifies_for_trade

s = Suite("VIX.1 — the break candle must be a momentum candle on its own")
SYM = "EUR/USD"


def ordinary(n=120, t0=0):
    """n small alternating candles, 2-pip bodies, tiny wicks — a quiet market with a 2-pip median body."""
    out, p = [], 1.1000
    for k in range(n):
        o, c = (p, p + 0.0002) if k % 2 == 0 else (p + 0.0002, p)
        out.append(body(o, c, tf="H1", t=t0 + k))
    return out


def with_break(pips, bullish=True, after=()):
    """The ordinary market, then the BREAK candle (`pips` body, clean), then `after` = list of (open, close)."""
    h = ordinary()
    o = 1.1000
    c = o + pips / 10000 if bullish else o - pips / 10000
    h.append(body(o, c, tf="H1", t=120))
    for k, (oo, cc) in enumerate(after):
        h.append(body(oo, cc, tf="H1", t=121 + k))
    return h


BT = None


def ask(h, bullish=True):
    brk = h[120]
    return B.refusal(h[100:], h, brk.time, bullish, SYM)


print("NO PULLBACK SINCE THE BREAK — the break candle itself is judged")
h26 = with_break(5.2)
s.check("a break candle of 5.2 pips (2.6x the 2-pip median) → may trade, ON the break candle", ask(h26), None)
h24 = with_break(4.8)
s.check("a break candle of 4.8 pips (2.4x — inside his old 0.2 margin) → REFUSED",
        ask(h24) is not None and "on its own" in ask(h24), True)
s.check("  ...the candle the margin would have let in (control: the trade-time test accepts 4.8 pips)",
        qualifies_for_trade(h24, 120, True, SYM, ignore_open_rule=True), True)
h26b = with_break(5.2, after=[(1.10052, 1.10080), (1.10080, 1.10110)])
s.check("two more candles our way after a qualifying break (still no pullback) → still allowed", ask(h26b), None)
h24b = with_break(4.8, after=[(1.10048, 1.10140), (1.10140, 1.10230)])
s.check("a NON-qualifying break followed by big candles our way (no pullback) → still refused: the BREAK candle "
        "decides, there is no 3rd-candle route any more", ask(h24b) is not None, True)

print("\nAFTER A PULLBACK — this rule does not apply; the pullback rules decide")
hpb = with_break(4.8, after=[(1.10048, 1.10030), (1.10030, 1.10090)])
s.check("a 4.8-pip break, then a candle against, then one our way → not this rule's to refuse", ask(hpb), None)

print("\nSELLS — the mirror")
s.check("a 5.2-pip bearish break → may trade", ask(with_break(5.2, bullish=False), bullish=False), None)
s.check("a 4.8-pip bearish break → refused", ask(with_break(4.8, bullish=False), bullish=False) is not None, True)

print("\nEDGES")
s.check("no break time → nothing to judge, not a refusal", B.refusal(h24[100:], h24, None, True, SYM), None)
s.check("a break time not in the window → not a refusal (as the old count degraded)",
        B.refusal(h24[100:], h24, 999999999, True, SYM), None)

print("\nTEETH")
real = B.is_momentum_candle
B.is_momentum_candle = lambda h1, i, bullish, symbol: qualifies_for_trade(h1, i, bullish, symbol, ignore_open_rule=True)
s.teeth("ON ITS OWN — swapped for the trade-time test (margin + memory) the 4.8-pip break slips through",
        ask(h24) is None)
B.is_momentum_candle = real
real_sp = B.since_pullback
B.since_pullback = lambda c, d: (0, 0)
s.teeth("after a pullback the rule stands aside (pullback count disabled → the 4.8-pip break is refused)",
        ask(hpb) is not None)
B.since_pullback = real_sp

print("\nTHE PRE-CLOSE HEADS-UP ON THE TREND ROUTE asks the same question of the break of structure")
from core.types import Candle  # noqa: E402
from strategies import vix1_preclose as pc  # noqa: E402


def _leg(out, frm, to, n, pad=0.00015):
    step = (to - frm) / n
    for k in range(n):
        o = frm + step * k
        c = o + step
        hi, lo = ((max(o, c) + pad, min(o, c)) if step > 0 else (max(o, c), min(o, c) - pad))
        out.append(Candle(time=1_700_000_000 + len(out) * 3600, open=o, high=hi, low=lo, close=c, volume=100,
                          timeframe="H1"))
    return out


_up = []
for frm, to, n in ((1.1000, 1.1060, 14), (1.1060, 1.1035, 8), (1.1035, 1.1110, 16), (1.1110, 1.1085, 8),
                   (1.1085, 1.1160, 14), (1.1160, 1.1135, 8)):
    _leg(_up, frm, to, n)
_bar = Candle(time=_up[-1].time + 3600, open=_up[-1].close, high=_up[-1].close + 0.0060, low=_up[-1].close - 0.0002,
              close=_up[-1].close + 0.0055, volume=100, timeframe="H1")
_open = pc._could_trade(_up, True, SYM, _bar)
B.refusal, _keep = (lambda *a, **k: "forced"), B.refusal
try:
    _shut = pc._could_trade(_up, True, SYM, _bar)
finally:
    B.refusal = _keep
s.check("a BUY in an uptrend: the heads-up's route is open", _open, True)
s.teeth("the heads-up asks the break-candle rule on the trend route (forced to refuse → route shut)", _shut is False)

print("\nASKED WHERE THE 3-CANDLE WAIT WAS ASKED — the entry's two routes and the pre-close heads-up")
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "strategies")
for f in ("vix1_choch.py", "vix1_bias.py", "vix1_preclose.py"):
    src = open(os.path.join(here, f), encoding="utf-8").read()
    s.check(f"{f} CALLS vix1_break_candle.refusal(...)", "vix1_break_candle.refusal(" in src, True)

s.done()
