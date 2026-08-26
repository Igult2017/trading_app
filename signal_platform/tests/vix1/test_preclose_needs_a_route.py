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

THE FIXTURE IS THE REAL EVENT, rebuilt from stored broker bars rather than drawn by hand — his
standing rule after a lookalike was once fixed instead of the actual event. It skips (does not fail)
if the file is absent, so the suite still runs on a machine without the data.

NOT A BACKTEST: nothing here scores a win, a loss or an R.
"""
from _harness import Suite, load

from core.types import Candle
from strategies import vix1_preclose as pc
from strategies.vix1_bias import _H1_SWING_N, _H1_TREND_BARS
from strategies.vix1_momentum import is_momentum_candle
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


# ── HIS EVENT, ON THE REAL BARS ──────────────────────────────────────────────────────────────────
print()
print("HIS 26 AUG GOLD CARD — a BUY candle while the 1HR trend was DOWN")
gold = load("XAUUSD_H1.csv", "H1")
if not gold:
    s.check("SKIPPED — XAUUSD_H1.csv not on this machine", True, True)
else:
    closed = [c for c in gold if c.time < HOUR]
    if len(closed) < 200:
        s.check("SKIPPED — the stored gold file does not reach 26 Aug 2026", True, True)
    else:
        st = state(closed)
        s.check("the trend that hour really was DOWN", st.direction, -1)
        s.check("...and no upward turn was pending", st.pending == 1, False)

        # The forming bar as it stood at 01:57, the minute it first qualified: body $21.12.
        forming = Candle(time=HOUR, open=4637.61, high=4660.88, low=4630.32,
                         close=4658.73, volume=0, timeframe="H1")
        s.check("the forming bar really did qualify as a BUY momentum candle",
                is_momentum_candle(closed + [forming], len(closed), True, SYM), True)

        got = pc.check(closed, closed + [forming], SYM, HOUR + tf_seconds("H1") - 120)
        s.check("NO notification is sent — a BUY had no route in a downtrend", got, None)
        s.teeth("this is the card he received; before the rule it fired",
                got is None and st.direction == -1)

        # A SELL that hour WOULD have had a route — the trend agreed with it. Proves the refusal is
        # about the route and not about gold, the hour, or the notification being switched off.
        sell = Candle(time=HOUR, open=4637.61, high=4640.00, low=4610.00,
                      close=4616.49, volume=0, timeframe="H1")
        if is_momentum_candle(closed + [sell], len(closed), False, SYM):
            got_s = pc.check(closed, closed + [sell], SYM, HOUR + tf_seconds("H1") - 120)
            s.check("...while a SELL candle that same hour WOULD have been announced",
                    got_s is not None and got_s[1] is False, True)
        else:
            s.check("(the synthetic sell bar was not large enough to test with)", True, True)

s.done()
