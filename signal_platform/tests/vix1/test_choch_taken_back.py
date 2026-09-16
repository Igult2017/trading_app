"""VIX.1 — a change of character DIES if its pullback takes the broken level back (his rule, 2026-09-16).

HIS RULE, in his words:

    "After the price has broken the protected area in a change of character, when it pulls back, the
     pullback must not drop past the protected area it broke to cause a change of character. If that
     happens, it is no longer the initial change of character and we can anticipate another change of
     character if after the pullback move has gone past the protected area it broke then pulls back
     without breaking the new moves respected zone."

AND ITS SCOPE, which is the half I got wrong twice: *"My rule was about CHOCH... I cant see any CHOCH
here or complex movement here. Just a simple downward trend."* The level guards **the pullback that
follows the change of character** — nothing else. Once that new trend has pulled back and carried on, it
is an ordinary trend and its ordinary protection owns it, exactly as before.

THE EVENT HE SENT — GBP/USD, real broker candles, HIS CLOCK (UTC+3):

    Mon 14 Sep 19:00   a close at 1.35047 breaks 1.34954 -> a turn UP is proposed
    Tue 15 Sep 00:00   close 1.34942 takes 1.34954 back  -> so that turn is finished, not a new trend
    Tue 15 Sep 16:00   VIX.1 BOUGHT the pullback of the fall that followed (docs/OPEN.md B26)

Times in the code are UTC (his clock minus 3), because that is what the broker bars carry.
"""
import datetime as dt

from _harness import Suite, load

from strategies import vix1_bias, vix1_trend
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — the level a change of character broke guards its pullback")
UTC = dt.timezone.utc
SYM = "GBP/USD"

s.check("the rule is switched ON", vix1_trend._ARM_BROKEN_LEVEL, True)

bars = load("GBPUSD_H1_sep16.csv", "H1")
if not bars:
    print("   SKIP — GBPUSD_H1_sep16.csv (broker bars through 16 Sep) not present on this machine")
else:
    def at(day, hour):
        t = int(dt.datetime(2026, 9, day, hour, tzinfo=UTC).timestamp())
        return next((k for k, c in enumerate(bars) if c.time == t), None)

    def under(armed, fn):
        keep = vix1_trend._ARM_BROKEN_LEVEL
        vix1_trend._ARM_BROKEN_LEVEL = armed
        try:
            return fn()
        finally:
            vix1_trend._ARM_BROKEN_LEVEL = keep

    def state(i, armed=True):
        def go():
            w = bars[max(0, i + 1 - 3000):i + 1][-1500:]
            return trend_state(w, n=48, turns=structure_turns(w, 48))
        return under(armed, go)

    def side(i, armed=True):
        b = under(armed, lambda: vix1_bias.detect_bias(bars[max(0, i + 1 - 3000):i + 1], [], SYM))
        return None if b is None else ("BUY" if b.bullish else "SELL")

    print()
    print("   his event, GBP/USD (labels are his clock, UTC+3):")
    i_turn = at(14, 19)
    s.check("Mon 14 Sep 22:00 — the market reads DOWN, not up: the turn up never became a trend",
            state(i_turn).direction, -1)
    s.check("...and VIX.1 SELLS there", side(i_turn), "SELL")
    s.check("...where today's code has no signal at all", side(i_turn, armed=False), None)

    i_buy = at(15, 13)
    s.check("Tue 15 Sep 16:00 — the BUY he reported is gone", side(i_buy), None)
    s.teeth("the rule", side(i_buy, armed=False) == "BUY")
    s.check("...and the market still reads DOWN at that hour", state(i_buy).direction, -1)

    last = len(bars) - 1
    s.check("still DOWN on the newest bar, with price under the pullback high 1.34956",
            (state(last).direction, bars[last].close < 1.34956), (-1, True))

    # ── THE LEVEL GUARDS THE PULLBACK, THEN RETIRES ────────────────────────────────────────────────
    print()
    print("   the level is armed for the young trend and spent once it has carried on:")
    young = state(at(4, 8))                                  # his Fri 04 Sep 11:00
    s.check("Fri 04 Sep 11:00 — an uptrend one leg old still guards the level it broke",
            (young.direction, round(young.turn_level or 0, 5), round(young.choch_price or 0, 5)),
            (1, 1.35186, 1.35186))
    s.check("...so that level, not the pullback low, is what would end it",
            (round(young.kill_level, 5), round(young.protected, 5)), (1.35186, 1.34734))

    grown = state(last)
    s.check("Wed 16 Sep 05:00 — a trend that has pulled back and carried on arms nothing",
            (grown.turn_level, grown.breaks >= 2), (None, True))
    s.check("...and is judged by its ordinary protection, exactly as before",
            grown.kill_level, grown.protected)

s.done()
