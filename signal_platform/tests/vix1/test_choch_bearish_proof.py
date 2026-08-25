"""VIX.1 — a turn DOWN gets no shortcut; it must prove itself first.

HIS RULE, 2026-08-25, confirmed word for word before anything was written:

    "price breaks down through the old higher low -> it runs down -> it pulls back up -> when that
     pullback turns back down, that's the proof -> then a momentum candle down is the trade."

AND THE SCOPE IS HALF THE RULE. He gave it twice, the second time as a warning after I had started
turning it into something wider:

    "we do this only for CHOCH when trend is changing from uptrend to downtrend but not for
     downtrend to uptrend."

    "I know you are about to misinterprete my words the way you have started 'delete' — you might
     end up deleting everything."

SO THE FIRST TEST IN THIS FILE IS THE ONE THAT MATTERS MOST: the BULLISH route still grants exactly
what it granted before. The bearish refusal is worth nothing if it cost him the upward exemption.

WHY THE RULE IS A REFUSAL RATHER THAN A FIFTH CONDITION INSIDE THE ROUTE. His proof lands AFTER
`choch_entry` has already returned — the window shuts at the first confirmed LOW after the break,
which is the moment the pullback BEGINS, while his proof needs the pullback's HIGH to confirm one
turn later. A fifth condition would sit below code that has already exited: dead, and it would have
LOOKED enforced. So the bearish turn is handed to the normal route (`detect_bias`), which requires a
lower high AND a lower low — and a lower high cannot exist until the pullback has turned back down.
That equivalence is not assumed here, it is ASSERTED below, stage by stage.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from _harness import Suite

from core.types import Candle
from strategies import vix1_choch, vix1_regime, vix1_swings, vix1_trend
from strategies.vix1_bias import detect_bias
from shared.candle_math import atr

s = Suite("VIX.1 — a bearish change of character must prove itself")


# ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────────
# Built rather than loaded because the point is the SHAPE he drew, and a real extract would carry a
# hundred other facts. The candles are ordinary-sized except the one marked `big`, which is the
# momentum candle — `momentum_run` needs a body well over the 100-bar median or condition 3 refuses
# first and this file would pass for the wrong reason. (It did, on the first attempt.)
def bar(i, o, h, l, c):
    return Candle(time=1_700_000_000 + i * 3600, open=o, high=h, low=l, close=c,
                  volume=100, timeframe="H1")


def leg(out, frm, to, n, pad=0.00015):
    step = (to - frm) / n
    for k in range(n):
        o = frm + step * k
        c = o + step
        hi, lo = ((max(o, c) + pad, min(o, c)) if step > 0 else (max(o, c), min(o, c) - pad))
        out.append(bar(len(out), o, hi, lo, c))
    return out


def big(out, frm, to):
    out.append(bar(len(out), frm, max(frm, to) + 0.0002, min(frm, to) - 0.0002, to))
    return out


def bear(stage=99):
    """An UPTREND (higher highs + higher lows), then his sequence, one stage at a time."""
    b = []
    leg(b, 1.1000, 1.1050, 14); leg(b, 1.1050, 1.1025, 8)
    leg(b, 1.1025, 1.1100, 16); leg(b, 1.1100, 1.1070, 8)
    leg(b, 1.1070, 1.1130, 14); leg(b, 1.1130, 1.1095, 8)      # last higher low ~1.1070
    if stage < 1:
        return b
    big(b, 1.1095, 1.1035); leg(b, 1.1035, 1.1010, 6)          # BREAK through it, then the run down
    if stage < 2:
        return b
    leg(b, 1.1010, 1.1055, 6)                                  # the pullback UP
    if stage < 3:
        return b
    leg(b, 1.1055, 1.1020, 6); big(b, 1.1020, 1.0975)          # turns back down + a momentum candle
    return b


def bull():
    """The MIRROR — a downtrend, then a big candle up through the last lower high."""
    b = []
    leg(b, 1.1130, 1.1080, 14); leg(b, 1.1080, 1.1105, 8)
    leg(b, 1.1105, 1.1030, 16); leg(b, 1.1030, 1.1060, 8)
    leg(b, 1.1060, 1.1000, 14); leg(b, 1.1000, 1.1035, 8)
    big(b, 1.1035, 1.1095); leg(b, 1.1095, 1.1120, 6)
    return b


def route(bars):
    """`choch_entry` through the REAL trend and swing readers — nothing re-implemented here."""
    turns = vix1_swings.structure_turns(bars)
    st = vix1_trend.trend_state(bars, turns=turns)
    return vix1_choch.choch_entry(bars, bars, st, turns, 3, "EUR/USD")


# ── THE ONE HE IS WORRIED ABOUT: the upward exemption is untouched ───────────────────────────────
print()
print("A TURN UP KEEPS ITS EXEMPTION — 'not for downtrend to uptrend'")
_bull_bias, _bull_why = route(bull())
s.check("a bullish change of character still gets an entry", _bull_bias is not None, True)
s.check("  ...and it is a BUY", bool(_bull_bias and _bull_bias.bullish), True)
s.check("  ...granted for the ORIGINAL reason, not a new one",
        "traded without waiting for a pullback" in _bull_why, True)
s.teeth("the bullish path would notice if it were refused",
        _bull_bias is not None and "not exempted" not in _bull_why)

# ── THE RULE ─────────────────────────────────────────────────────────────────────────────────────
print()
print("A TURN DOWN DOES NOT — it must run, pull back, and turn back down first")
_bear_bias, _bear_why = route(bear(1))
s.check("a bearish change of character is refused the shortcut", _bear_bias is None, True)
s.check("  ...and the refusal says WHY, in his terms", "must run, pull back" in _bear_why, True)
s.teeth("this same shape WAS granted before the rule — the refusal is doing real work",
        _bear_bias is None and _bull_bias is not None)

# ── HIS SEQUENCE, STAGE BY STAGE, THROUGH THE REAL `detect_bias` ─────────────────────────────────
print()
print("AND THE NORMAL ROUTE OPENS AT EXACTLY HIS PROOF, NOT BEFORE")
_stages = [("breaks down and runs", 1), ("pulls back up", 2), ("turns back down + momentum", 3)]
_bias_at = {}
for _label, _st in _stages:
    _b = bear(_st)
    _bias_at[_st] = detect_bias(_b, _b, "EUR/USD")
    _reg = vix1_regime.classify(vix1_swings.structure_turns(_b), atr(_b, 14))
    print(f"      [{_label}] regime={_reg.kind.upper()}")

s.check("no sell while it has only broken down and run", _bias_at[1] is None, True)
s.check("no sell while the pullback is still going up", _bias_at[2] is None, True)
s.check("a SELL once it turns back down and momentum prints", _bias_at[3] is not None, True)
s.check("  ...and it is a SELL, not a buy",
        bool(_bias_at[3]) and not _bias_at[3].bullish, True)
s.teeth("the sequence is ordered — the entry is not available at every stage",
        _bias_at[1] is None and _bias_at[2] is None and _bias_at[3] is not None)

# THE SHORTCUT STAYS SHUT THROUGHOUT. If it re-opened at a later stage the rule would leak.
s.check("the shortcut is refused at EVERY bearish stage",
        [route(bear(st))[0] for _, st in _stages], [None, None, None])

s.done()
