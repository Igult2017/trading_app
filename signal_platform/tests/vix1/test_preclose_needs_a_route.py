"""VIX.1 — the closure notification must not announce a candle that could never be traded.

HIS EVENT, 26 Aug 2026 01:58 UTC. He was sent *"XAU/USD · BUY · momentum candle closes in ~1 minute"*
and asked: **"What's the basis of this VIX notification, because I cannot figure it out in VIX
strategy?"** There was none. Replayed on the real gold bars:

    the 1HR trend was DOWN, and the card said BUY

and production's own log said so four minutes later — *"XAU/USD bias=NONE: down trend but no momentum
candle that way"*. No route existed to trade that candle at any body size. He was told to be at the
screen for something the strategy had already ruled out.

(The candle also stopped qualifying before it closed — $19.26 against the $21.12 that triggered the
card. That is the documented one-in-five and is not what this file is about.)

WHAT IS ASSERTED, AND WHY IT IS NOT SIMPLY "MATCH THE TREND". `detect_bias` runs its normal route only
when the trend AGREES with the candle (`vix1_bias`, `if t1 == want`) — but when it disagrees the
change-of-character route can still trade it. Refusing every counter-trend candle would silence
exactly the reversals that route exists to catch. So the test is whether EITHER route is open.

THE FIXTURE IS **NOT** THE REAL EVENT, AND THIS FILE ONCE CLAIMED IT WAS. Corrected 2026-08-29.
The stored gold file ends **19 Aug 2026 11:00** — 158 hours (6.6 days) BEFORE the card's hour. The
original section here appended the 26 Aug forming bar onto bars that stop on 19 Aug and read the
trend off that, so "the trend that hour was DOWN" was the trend a week earlier, and the protecting
level it compared against (4403.72) was $255 below where gold actually was. Every conclusion drawn
from it was about a market that had a six-day hole in it.

That is precisely the lookalike-instead-of-the-actual-event failure his standing rule exists to stop,
committed in the file written to enforce that rule. The section has been REMOVED rather than left
asserting a wrong answer on a broken fixture. **To restore it, pull real XAU/USD H1 bars through
26 Aug 2026 and rebuild it** — until then the rule is carried by the clean fixtures below, which are
labelled as fixtures and make no claim to be his event.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from _harness import Suite

from core.types import Candle
from strategies import vix1_preclose as pc
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_choch import choch_entry
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state
from shared.mtf_utils import seconds as tf_seconds

s = Suite("VIX.1 — a notification needs a route to trade")

SYM = "XAU/USD"
# 26 Aug 2026 01:00 UTC — the hour on the card.
HOUR = 1787706000


def state(bars):
    w = bars[-_H1_TREND_BARS:]
    return trend_state(w, n=_H1_SWING_N, turns=structure_turns(w, _H1_SWING_N))


# ── THE BUY CANDLE THAT IS ITSELF TURNING THE MARKET UP (added 2026-08-29) ───────────────────────
# WITHOUT THIS THE `pending == 1` TEST CAN NEVER FIRE ON THE BAR THAT CREATES THE PENDING TURN, and
# that is arithmetic, not tuning: the notification is decided BEFORE the candle closes, so the state
# it reads is the state BEFORE the break. The bar that proposes a turn up always reads as
# counter-trend at the moment we ask.
#
# ONE SIDE ONLY, AND THE OTHER SIDE IS THE CONTROL. Both are traced here through the real
# `trend_state` and `choch_entry`, so the asymmetry is PROVED in this file rather than asserted:
#
#     a SELL closing through an UPtrend's protection  -> pending -1 -> choch_entry REFUSES
#     a BUY  closing through a DOWNtrend's protection -> pending +1 -> choch_entry gives a BIAS
#
# That is his rule of 2026-08-25 ("a turn DOWN is not exempted from the pullback rule"), enforced in
# `vix1_choch`. The notification must give the same answer as the entry, so only the BUY is opened.
print()
print("A BUY CANDLE BREAKING A DOWNTREND'S PROTECTION — it must be announced")


def _bar(i, o, h, l, c):
    return Candle(time=1_700_000_000 + i * 3600, open=o, high=h, low=l, close=c,
                  volume=100, timeframe="H1")


def _leg(out, frm, to, n, pad=0.00015):
    step = (to - frm) / n
    for k in range(n):
        o = frm + step * k
        c = o + step
        hi, lo = ((max(o, c) + pad, min(o, c)) if step > 0 else (max(o, c), min(o, c) - pad))
        out.append(_bar(len(out), o, hi, lo, c))
    return out


def _break_up(bars, level):
    """A forming BUY whose close is already through `level`."""
    last = bars[-1]
    return Candle(time=last.time + 3600, open=last.close, low=last.close - 0.0002,
                  high=level + 0.0030, close=level + 0.0025, volume=100, timeframe="H1")


def _break_down(bars, level):
    """A forming SELL whose close is already through `level`."""
    last = bars[-1]
    return Candle(time=last.time + 3600, open=last.close, high=last.close + 0.0002,
                  low=level - 0.0030, close=level - 0.0025, volume=100, timeframe="H1")


_down = []
_leg(_down, 1.1130, 1.1080, 14); _leg(_down, 1.1080, 1.1105, 8)
_leg(_down, 1.1105, 1.1030, 16); _leg(_down, 1.1030, 1.1060, 8)
_leg(_down, 1.1060, 1.1000, 14); _leg(_down, 1.1000, 1.1035, 8)
_ds = state(_down)
s.check("the fixture is a downtrend with a protecting level", _ds.direction, -1)
s.check("...and that level is on record", _ds.protected is not None, True)

if _ds.protected is not None:
    _up_brk = _break_up(_down, _ds.protected)
    _got = pc.check(_down, _down + [_up_brk], "EUR/USD", _up_brk.time + tf_seconds("H1") - 300)
    s.check("a BUY candle breaking the downtrend's protection IS announced", _got is not None, True)
    s.check("  ...and it is a BUY", bool(_got) and _got[1] is True, True)

    # AND IT REALLY DOES HAVE A ROUTE — the entry agrees, so the notification is not promising
    # something the strategy will refuse. This is the whole point of the file.
    _h = _down + [_up_brk]
    _w = _h[-_H1_TREND_BARS:]
    _t = state(_h)
    _bias, _ = choch_entry(_w, _h, _t, structure_turns(_w, _H1_SWING_N), _H1_SWING_N, "EUR/USD")
    s.check("  ...and once it closes the entry really does produce a BUY bias",
            _bias is not None and _bias.bullish, True)

    # The control that keeps this from becoming "any big counter-trend candle": one that has NOT
    # reached the level stays silent.
    _last = _down[-1]
    _short = Candle(time=_last.time + 3600, open=_last.close, low=_last.close - 0.0002,
                    high=_ds.protected - 0.0010, close=_ds.protected - 0.0015,
                    volume=100, timeframe="H1")
    _got_short = pc.check(_down, _down + [_short], "EUR/USD", _short.time + tf_seconds("H1") - 300)
    s.check("a BUY candle that has NOT reached the level stays silent", _got_short, None)
    s.teeth("breaking the level is what opens it, not merely being a big counter-trend candle",
            _got is not None and _got_short is None)

# ── THE CONTROL: THE DOWNWARD BREAK STAYS SILENT ─────────────────────────────────────────────────
# His rule of 2026-08-25 is one-sided, so this fix must be too. If this section ever passes as
# "announced", the fix has re-opened what his 26 Aug instruction closed and must come out.
print()
print("THE MIRROR — a SELL breaking an UPTREND's protection has NO route and must stay silent")
_up = []
_leg(_up, 1.1000, 1.1050, 14); _leg(_up, 1.1050, 1.1025, 8)
_leg(_up, 1.1025, 1.1100, 16); _leg(_up, 1.1100, 1.1070, 8)
_leg(_up, 1.1070, 1.1130, 14); _leg(_up, 1.1130, 1.1095, 8)
_us = state(_up)
s.check("the mirror fixture is an uptrend with a protecting level",
        (_us.direction, _us.protected is not None), (1, True))

if _us.protected is not None:
    _dn_brk = _break_down(_up, _us.protected)
    _got_dn = pc.check(_up, _up + [_dn_brk], "EUR/USD", _dn_brk.time + tf_seconds("H1") - 300)
    s.check("a SELL breaking the uptrend's protection is NOT announced", _got_dn, None)

    # WHY it must not be: the entry refuses it. Proved here rather than asserted.
    _h2 = _up + [_dn_brk]
    _w2 = _h2[-_H1_TREND_BARS:]
    _t2 = state(_h2)
    s.check("  ...because that break proposes a turn DOWN", _t2.pending, -1)
    _bias2, _why2 = choch_entry(_w2, _h2, _t2, structure_turns(_w2, _H1_SWING_N),
                                _H1_SWING_N, "EUR/USD")
    s.check("  ...and the entry refuses a turn DOWN outright", _bias2, None)
    s.check("  ...for his stated reason", "not exempted from the pullback rule" in _why2, True)
    s.teeth("the fix is one-sided: the BUY break speaks and the SELL break does not",
            _got is not None and _got_dn is None)

s.done()
