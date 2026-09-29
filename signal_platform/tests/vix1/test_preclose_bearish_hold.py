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


def uptrend_then_break(after=6):
    """An uptrend, then a big candle DOWN through the last higher low, then `after` candles of run.

    `after` is what makes his 2026-09-29 count testable: the break candle is candle 1, so `after=0`
    is candle 1 and `after=6` is candle 7 — one side of his 3-candle rule and the other.
    """
    b = []
    leg(b, 1.1000, 1.1050, 14); leg(b, 1.1050, 1.1025, 8)
    leg(b, 1.1025, 1.1100, 16); leg(b, 1.1100, 1.1070, 8)
    leg(b, 1.1070, 1.1130, 14); leg(b, 1.1130, 1.1095, 8)
    big(b, 1.1095, 1.1035)
    if after:
        leg(b, 1.1035, 1.1010, after)
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
print("JUST BROKEN — candle 1 of his count, so nothing should be announced")


def both(closed):
    """The notification and the entry, asked about the SAME CANDLE. Returns (spoke, why_at_close).

    ⚠ THE ENTRY IS ASKED WITH THE FORMING BAR INCLUDED, and that is the only comparison that means
    anything. The notification is a warning about a bar that has NOT closed yet — so the question it
    answers is "will this candle be tradeable when it closes". Asking the entry about the closed bars
    ALONE asks about the bar before it, and the two would differ by one candle for ever: at candle 2
    the notification speaks (the forming bar will be candle 3) while a closed-bars-only entry still
    reads candle 2. That is an artefact of comparing different bars, not a disagreement.
    """
    bar, clock = forming_sell(closed)
    spoke = pc.check(closed, closed + [bar], SYM, clock) is not None
    at_close = closed + [bar]
    w = at_close[-_H1_TREND_BARS:]
    tn = vix1_swings.structure_turns(w, _H1_SWING_N)
    ts = vix1_trend.trend_state(w, n=_H1_SWING_N, turns=tn)
    _, why = vix1_choch.choch_entry(w, at_close, ts, tn, _H1_SWING_N, SYM)
    return spoke, why


# ── HIS RULE OF 2026-09-29 REPLACED THE FLAT HOLD ────────────────────────────────────────────────
# This file used to assert that a broken-but-unproved downturn is announced by NOTHING, ever —
# because the entry refused it outright. He changed that: *"the band issue has proven to us that
# sometimes price can move for a very long time without a pullback. so that 3 candle rule also
# applies in a CHOCH scenario if we have not had a pullback."*
#
# So the hold is no longer "never", it is HIS COUNT — and the old fixture (break + 6 candles of run)
# was on the trading side of it all along. What this file proves is unchanged and is the only thing
# worth proving here: the notification and the entry answer the SAME WAY about the SAME BARS.
# CANDLE 2 — the break candle is 1, the closed one is 2, so the bar now forming would be candle 3.
# Wait: with `after=0` the forming bar IS candle 2, which is still short of his three.
_fresh = uptrend_then_break(after=0)
_spoke_1, _why_1 = both(_fresh)
s.check("the fixture really is a proposed-but-unproved downturn", pending_of(_fresh), -1)
s.check("the forming bar would be candle 2 — the count refuses it at close",
        "3rd candle after the break" in _why_1, True)
s.check("...and the notification agrees: NOTHING is announced", _spoke_1, False)

print()
print("ONE CANDLE LATER — the forming bar is his 3rd, so it may trade and must be announced")
_before = uptrend_then_break(after=1)
_spoke_b, _why_b = both(_before)
s.check("it is still a proposed-but-unproved downturn", pending_of(_before), -1)
s.check("the count no longer refuses it at close",
        "3rd candle after the break" in _why_b, False)
s.check("...and the notification agrees: it speaks", _spoke_b, True)

# ── AFTER THE PROOF: it pulled back and turned back down ─────────────────────────────────────────
print()
print("PULLED BACK AND TURNED BACK DOWN — the proof is in, so it speaks again")
_after = after_the_proof(_before)
_bar_a, _clock_a = forming_sell(_after)
_got_a = pc.check(_after, _after + [_bar_a], SYM, _clock_a)

s.check("the turn is no longer merely proposed", pending_of(_after) == -1, False)
s.check("the closure notification IS sent", _got_a is not None, True)
s.check("...and it is a SELL", bool(_got_a) and _got_a[1] is False, True)

s.teeth("the count is doing real work — same candle, opposite answers either side of candle 3",
        _spoke_1 is False and _spoke_b is True)
s.teeth("...and the notification never announces a candle the count will refuse at close",
        (_spoke_1 is False and "3rd candle after the break" in _why_1)
        and (_spoke_b is True and "3rd candle after the break" not in _why_b))

# ── THE HOLD IS ABOUT THE UNPROVED TURN, NOT ABOUT SELLS ─────────────────────────────────────────
print()
print("A BULLISH CANDLE IN AN UPTREND STILL SPEAKS — the hold targets one state, not one direction")
# THIS CONTROL WAS REPLACED ON 2026-08-26, and the reason matters. It used to put a BUY candle on the
# PROPOSED-DOWNTURN fixture and assert it still notified — valid while the only rule was the bearish
# hold. It is not valid now: the notification also asks whether a candle could TRADE at all, and in
# that state a BUY has no route (the trend is not up, and the pending turn is DOWN, which his own rule
# refuses). Silencing it is correct. So one-sidedness is shown where it can still be shown — a BUY on
# an UPTREND, which the bearish hold must never touch.
def uptrend():
    b = []
    leg(b, 1.1000, 1.1060, 14); leg(b, 1.1060, 1.1035, 8)
    leg(b, 1.1035, 1.1110, 16); leg(b, 1.1110, 1.1085, 8)
    leg(b, 1.1085, 1.1160, 14); leg(b, 1.1160, 1.1135, 8)
    return b


_up = uptrend()
_up_bar = Candle(time=_up[-1].time + 3600, open=_up[-1].close,
                 high=_up[-1].close + 0.0060, low=_up[-1].close - 0.0002,
                 close=_up[-1].close + 0.0055, volume=100, timeframe="H1")
_got_up = pc.check(_up, _up + [_up_bar], SYM, _up_bar.time + tf_seconds("H1") - 300)
s.check("the control fixture really is an uptrend", pending_of(_up) == -1, False)
s.check("a BUY momentum candle in an uptrend notifies", _got_up is not None, True)
s.check("...and it is a BUY", bool(_got_up) and _got_up[1] is True, True)
s.teeth("the count does not silence bullish candles",
        _spoke_1 is False and _got_up is not None)

# ...AND THE SAME BUY CANDLE WHERE IT COULD NOT TRADE IS SILENT. Not the hold — the route test.
_bad_up = Candle(time=_before[-1].time + 3600, open=_before[-1].close,
                 high=_before[-1].close + 0.0060, low=_before[-1].close - 0.0002,
                 close=_before[-1].close + 0.0055, volume=100, timeframe="H1")
s.check("a BUY with no route to trade is silent (trend is not up, and the pending turn is down)",
        pc.check(_before, _before + [_bad_up], SYM, _bad_up.time + tf_seconds("H1") - 300), None)

s.done()
