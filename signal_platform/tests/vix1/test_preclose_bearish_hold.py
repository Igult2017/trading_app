"""VIX.1 — the closure notification must not announce a candle the entry rule has already refused.

HIS INSTRUCTION, 2026-08-26:

    "disable DM notification for momentum candle closure for old downtrend without pullback that you
     added pullback for. Send notification of momentum candle closure minutes remaining only when the
     momentum candle occur after pullback to align with the new pullback logic. I hope you understand
     that we are aligning it to the change you made."

THE GAP IT CLOSES. On 2026-08-25 a turn DOWN lost the change-of-character shortcut — it must run,
pull back and turn back down first. The notification never learned that: `vix1_preclose.check` asks
only three things (a bar is forming · it is inside the lead window · it is a momentum candle), while
every trend, regime and pullback test lives in `detect_bias`, which runs much later. So he was being
told to be at the screen for a candle the strategy would refuse the moment it closed.

WHAT THIS FILE PROVES, and it is the point of it: **the notification and the entry rule agree on the
SAME BARS**. Both are asked about one fixture at the same two moments, rather than being tested apart
and assumed to line up. A pair of tests that each derive their own expectation can both be green
while the two behaviours have drifted — this codebase has paid for that once already.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from _harness import Suite

from core.types import Candle
from strategies import vix1_choch, vix1_preclose as pc, vix1_swings, vix1_trend
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from shared.mtf_utils import seconds as tf_seconds

s = Suite("VIX.1 — the closure notification follows the pullback rule")

SYM = "EUR/USD"


# ── FIXTURE — his sequence, with the forming bar left OFF the closed list ────────────────────────
# `check()` takes the CLOSED bars and the raw feed separately, so the last bar of `raw` is the one
# still forming. Ordinary candles are small; the marked ones are large enough to be momentum candles.
def leg(out, frm, to, n, pad=0.00015):
    step = (to - frm) / n
    for k in range(n):
        o = frm + step * k
        c = o + step
        hi, lo = ((max(o, c) + pad, min(o, c)) if step > 0 else (max(o, c), min(o, c) - pad))
        out.append(Candle(time=1_700_000_000 + len(out) * 3600, open=o, high=hi,
                          low=lo, close=c, volume=100, timeframe="H1"))
    return out


def big(out, frm, to):
    out.append(Candle(time=1_700_000_000 + len(out) * 3600, open=frm,
                      high=max(frm, to) + 0.0002, low=min(frm, to) - 0.0002,
                      close=to, volume=100, timeframe="H1"))
    return out


def uptrend_then_break():
    """An uptrend, then a big candle DOWN through the last higher low, then the run down."""
    b = []
    leg(b, 1.1000, 1.1050, 14); leg(b, 1.1050, 1.1025, 8)
    leg(b, 1.1025, 1.1100, 16); leg(b, 1.1100, 1.1070, 8)
    leg(b, 1.1070, 1.1130, 14); leg(b, 1.1130, 1.1095, 8)
    big(b, 1.1095, 1.1035); leg(b, 1.1035, 1.1010, 6)
    return b


def after_the_proof(b):
    """...it pulls back UP, then TURNS BACK DOWN. That is his proof."""
    b = list(b)
    leg(b, 1.1010, 1.1055, 6)
    leg(b, 1.1055, 1.1020, 6)
    return b


def forming_sell(closed):
    """A big DOWN bar appended as the bar still forming, five minutes from its close."""
    last = closed[-1]
    bar = Candle(time=last.time + 3600, open=last.close, high=last.close + 0.0002,
                 low=last.close - 0.0060, close=last.close - 0.0055, volume=100, timeframe="H1")
    return bar, bar.time + tf_seconds("H1") - 300          # a clock with 5 minutes left


def pending_of(closed):
    w = closed[-_H1_TREND_BARS:]
    return vix1_trend.trend_state(w, n=_H1_SWING_N,
                                  turns=vix1_swings.structure_turns(w, _H1_SWING_N)).pending


# ── BEFORE THE PROOF: the turn is only proposed ──────────────────────────────────────────────────
print()
print("BROKEN DOWN AND RUNNING — no pullback yet, so nothing should be announced")
_before = uptrend_then_break()
_bar_b, _clock_b = forming_sell(_before)
_got_b = pc.check(_before, _before + [_bar_b], SYM, _clock_b)

s.check("the fixture really is a proposed-but-unproved downturn", pending_of(_before), -1)
s.check("...and the forming bar really would qualify as a SELL momentum candle",
        pc.is_momentum_candle(_before + [_bar_b], len(_before), False, SYM), True)
s.check("NO closure notification is sent", _got_b, None)

# THE ENTRY RULE, ASKED ABOUT THE SAME BARS — the two must agree, not merely both be plausible.
_w = _before[-_H1_TREND_BARS:]
_tn = vix1_swings.structure_turns(_w, _H1_SWING_N)
_ts = vix1_trend.trend_state(_w, n=_H1_SWING_N, turns=_tn)
_entry_b, _why_b = vix1_choch.choch_entry(_w, _before, _ts, _tn, _H1_SWING_N, SYM)
s.check("...and the ENTRY refuses the same setup", _entry_b, None)
s.check("...for his reason", "must run, pull back" in _why_b, True)

# ── AFTER THE PROOF: it pulled back and turned back down ─────────────────────────────────────────
print()
print("PULLED BACK AND TURNED BACK DOWN — the proof is in, so it speaks again")
_after = after_the_proof(_before)
_bar_a, _clock_a = forming_sell(_after)
_got_a = pc.check(_after, _after + [_bar_a], SYM, _clock_a)

s.check("the turn is no longer merely proposed", pending_of(_after) == -1, False)
s.check("the closure notification IS sent", _got_a is not None, True)
s.check("...and it is a SELL", bool(_got_a) and _got_a[1] is False, True)

s.teeth("the hold is doing real work — same candle, opposite answers either side of the pullback",
        _got_b is None and _got_a is not None)

# ── A TURN UP IS UNTOUCHED ───────────────────────────────────────────────────────────────────────
print()
print("AND A BULLISH CANDLE IS NEVER HELD BACK — the rule is one-sided")
_up_bar = Candle(time=_before[-1].time + 3600, open=_before[-1].close,
                 high=_before[-1].close + 0.0060, low=_before[-1].close - 0.0002,
                 close=_before[-1].close + 0.0055, volume=100, timeframe="H1")
_got_up = pc.check(_before, _before + [_up_bar], SYM, _up_bar.time + tf_seconds("H1") - 300)
s.check("a BUY momentum candle notifies even in a proposed downturn", _got_up is not None, True)
s.check("...and it is a BUY", bool(_got_up) and _got_up[1] is True, True)
s.teeth("the hold applies to one direction only",
        _got_b is None and _got_up is not None and pending_of(_before) == -1)

s.done()
