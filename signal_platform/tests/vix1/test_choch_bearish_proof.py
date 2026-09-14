"""VIX.1 — a change of character must PROVE itself before it trades. Both ways since 2026-09-14.

HIS RULE FOR A TURN DOWN, 2026-08-25, confirmed word for word before anything was written:

    "price breaks down through the old higher low -> it runs down -> it pulls back up -> when that
     pullback turns back down, that's the proof -> then a momentum candle down is the trade."

HIS EXTENSION TO A TURN UP, 2026-09-14:

    "enable pullback to uptrend the same way we have a pullback after first trend run in the
     downtrend."

That reverses his scope of 2026-08-25 ("we do this only for CHOCH when trend is changing from uptrend
to downtrend but not for downtrend to uptrend") — deliberately, and it is his. The upward exemption is
SWITCHED OFF (`vix1_choch._EXEMPT_UP_TURNS`), not deleted. So this file proves:

  1. by default a turn up gets no shortcut, exactly like a turn down
  2. with the switch on, the old upward exemption still works — restoring it is one line
  3. the switch can never open a turn DOWN
  4. his sequence is enforced STAGE BY STAGE through the real `detect_bias`, in BOTH directions: no
     trade while it only breaks and runs, none during the pullback, a trade once it turns back

WHY THE RULE IS A REFUSAL RATHER THAN A FIFTH CONDITION INSIDE THE ROUTE. His proof lands AFTER
`choch_entry` has already returned — the window shuts at the first confirmed counter-swing after the
break, which is the moment the pullback BEGINS, while his proof needs that pullback to turn back one
swing later. A fifth condition would sit below code that has already exited: dead, and it would have
LOOKED enforced. So the turn is handed to the normal route (`detect_bias`), which needs the new trend
confirmed — and the swing that confirms it cannot exist until the pullback has turned back. That
equivalence is not assumed here, it is ASSERTED below, stage by stage, both ways.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from _harness import Suite

from core.types import Candle
from strategies import vix1_choch, vix1_regime, vix1_swings, vix1_trend
from strategies.vix1_bias import detect_bias
from shared.candle_math import atr

s = Suite("VIX.1 — a change of character must prove itself, both ways")


# ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────────
# Built rather than loaded because the point is the SHAPE he drew, and a real extract would carry a
# hundred other facts. The candles are ordinary-sized except the ones marked `big`, which are the
# momentum candles — `momentum_run` needs a body well over the 100-bar median or it refuses first and
# this file would pass for the wrong reason. (It did, on the first attempt.)
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


def bull_proof(stage=99):
    """THE MIRROR OF `bear` — a DOWNTREND, then his sequence the other way up, one stage at a time.

    Every price is `bear`'s reflected through 1.1065, so the two shapes are the same size and a
    difference in the answer can only come from the direction.
    """
    b = []
    leg(b, 1.1130, 1.1080, 14); leg(b, 1.1080, 1.1105, 8)
    leg(b, 1.1105, 1.1030, 16); leg(b, 1.1030, 1.1060, 8)
    leg(b, 1.1060, 1.1000, 14); leg(b, 1.1000, 1.1035, 8)      # last lower high ~1.1060
    if stage < 1:
        return b
    big(b, 1.1035, 1.1095); leg(b, 1.1095, 1.1120, 6)          # BREAK up through it, then the run up
    if stage < 2:
        return b
    leg(b, 1.1120, 1.1075, 6)                                  # the pullback DOWN
    if stage < 3:
        return b
    leg(b, 1.1075, 1.1110, 6); big(b, 1.1110, 1.1155)          # turns back up + a momentum candle
    return b


def bull(trailing=0):
    """A downtrend, then a big candle up through the last lower high — the break and nothing after.

    THE MOMENTUM CANDLE IS THE LAST BAR, and that is load-bearing: since 31 Aug the momentum candle
    must be the NEWEST closed bar (his rule). `trailing` builds the same shape with bars after the
    candle, to prove that rule reaches this route too.
    """
    b = []
    leg(b, 1.1130, 1.1080, 14); leg(b, 1.1080, 1.1105, 8)
    leg(b, 1.1105, 1.1030, 16); leg(b, 1.1030, 1.1060, 8)
    leg(b, 1.1060, 1.1000, 14); leg(b, 1.1000, 1.1035, 8)
    big(b, 1.1035, 1.1095)
    if trailing:
        leg(b, 1.1095, 1.1095 + 0.0004 * trailing, trailing)
    return b


def route(bars):
    """`choch_entry` through the REAL trend and swing readers — nothing re-implemented here."""
    turns = vix1_swings.structure_turns(bars)
    st = vix1_trend.trend_state(bars, turns=turns)
    return vix1_choch.choch_entry(bars, bars, st, turns, 3, "EUR/USD")


# ── 1. BY DEFAULT A TURN UP GETS NO SHORTCUT — his instruction of 2026-09-14 ─────────────────────
print()
print("A TURN UP NOW PROVES ITSELF TOO — 'enable pullback to uptrend the same way'")
s.check("the upward exemption is switched OFF by default", vix1_choch._EXEMPT_UP_TURNS, False)
_up_off, _up_off_why = route(bull())
s.check("a bullish change of character is refused the shortcut", _up_off is None, True)
s.check("  ...and the refusal says WHY, in his terms",
        "must run, pull back, and turn back up" in _up_off_why, True)

# ── 2. SWITCHED OFF, NOT DELETED ─────────────────────────────────────────────────────────────────
print()
print("THE UPWARD EXEMPTION STILL WORKS WHEN SWITCHED ON — restoring it is one line")
vix1_choch._EXEMPT_UP_TURNS = True
try:
    _bull_bias, _bull_why = route(bull())
    _old_bias, _old_why = route(bull(trailing=6))
    _bear_on, _ = route(bear(1))
finally:
    vix1_choch._EXEMPT_UP_TURNS = False
s.check("with the switch on, a bullish change of character gets an entry", _bull_bias is not None, True)
s.check("  ...and it is a BUY", bool(_bull_bias and _bull_bias.bullish), True)
s.check("  ...granted for the ORIGINAL reason",
        "traded without waiting for a pullback" in _bull_why, True)
# THE NEWEST-BAR RULE REACHES THIS ROUTE TOO. `momentum_run` is called from BOTH routes, so the 31 Aug
# rule had to hold in both — one left unchanged would go on firing stale candles through this path.
s.check("the SAME shape with 6 bars printed after the candle is still refused", _old_bias is None, True)
s.check("  ...because the current bar is not a momentum candle",
        "no momentum candle that way yet" in _old_why, True)
s.check("the switch never opens a turn DOWN", _bear_on, None)
s.teeth("the switch is what decides a turn up — same bars, opposite answers",
        _up_off is None and _bull_bias is not None)

# ── 3. A TURN DOWN — unchanged since 2026-08-25 ──────────────────────────────────────────────────
print()
print("A TURN DOWN — it must run, pull back, and turn back down first")
_bear_bias, _bear_why = route(bear(1))
s.check("a bearish change of character is refused the shortcut", _bear_bias is None, True)
s.check("  ...and the refusal says WHY, in his terms", "must run, pull back" in _bear_why, True)

# ── 4. HIS SEQUENCE, STAGE BY STAGE, THROUGH THE REAL `detect_bias` — BOTH WAYS ──────────────────
print()
print("THE NORMAL ROUTE OPENS AT EXACTLY HIS PROOF, NOT BEFORE — a turn DOWN")
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
s.check("  ...and it is a SELL, not a buy", bool(_bias_at[3]) and not _bias_at[3].bullish, True)
s.teeth("the sequence is ordered — the entry is not available at every stage",
        _bias_at[1] is None and _bias_at[2] is None and _bias_at[3] is not None)

print()
print("...AND THE SAME WAY FOR A TURN UP")
_ustages = [("breaks up and runs", 1), ("pulls back down", 2), ("turns back up + momentum", 3)]
_ubias_at = {}
for _label, _st in _ustages:
    _b = bull_proof(_st)
    _ubias_at[_st] = detect_bias(_b, _b, "EUR/USD")
    _reg = vix1_regime.classify(vix1_swings.structure_turns(_b), atr(_b, 14))
    print(f"      [{_label}] regime={_reg.kind.upper()}")

s.check("no buy while it has only broken up and run", _ubias_at[1] is None, True)
s.check("no buy while the pullback is still going down", _ubias_at[2] is None, True)
s.check("a BUY once it turns back up and momentum prints", _ubias_at[3] is not None, True)
s.check("  ...and it is a BUY, not a sell", bool(_ubias_at[3]) and _ubias_at[3].bullish, True)
s.teeth("the upward sequence is ordered too",
        _ubias_at[1] is None and _ubias_at[2] is None and _ubias_at[3] is not None)

# THE SHORTCUT STAYS SHUT THROUGHOUT, BOTH WAYS. If it re-opened at a later stage the rule would leak.
s.check("the shortcut is refused at EVERY stage, both directions",
        [route(bear(st))[0] for _, st in _stages] + [route(bull_proof(st))[0] for _, st in _ustages],
        [None] * 6)

s.done()
