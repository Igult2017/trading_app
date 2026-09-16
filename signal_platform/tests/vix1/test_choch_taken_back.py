"""VIX.1 — a change of character DIES if price takes the broken level back (his rule, 2026-09-16).

HIS RULE, in his words:

    "After the price has broken the protected area in a change of character, when it pulls back, the
     pullback must not drop past the protected area it broke to cause a change of character. If that
     happens, it is no longer the initial change of character and we can anticipate another change of
     character if after the pullback move has gone past the protected area it broke then pulls back
     without breaking the new moves respected zone."

THE EVENT HE SENT, and it is what this file pins — GBP/USD, real broker candles, HIS CLOCK (UTC+3):

    Mon 14 Sep 14:00   the downtrend's protecting high forms at 1.34954
    Mon 14 Sep 19:00   close 1.35047 breaks it            -> change of character proposed (up)
    Mon 14 Sep 22:00   a higher high at 1.35135 confirms  -> trend UP, and the watched level jumped
                                                             DOWN to 1.34635, never reading 1.34954 again
    Tue 15 Sep 00:00   close 1.34942 — BACK BELOW 1.34954. By his rule the up turn is dead here.
    Tue 15 Sep 09:00   the fall reaches 1.34634
    Tue 15 Sep 16:00   VIX.1 BOUGHT — the pullback of the new down move (docs/OPEN.md B26)

Times in the code are UTC (his clock minus 3), because that is what the broker bars carry.
"""
import datetime as dt

from _harness import Suite, load

from strategies import vix1_bias, vix1_trend
from strategies.vix1_swings import structure_turns
from strategies.vix1_trend import trend_state

s = Suite("VIX.1 — the level a change of character broke stays armed")
UTC = dt.timezone.utc
SYM = "GBP/USD"
BROKEN = 1.34954          # the downtrend's protecting high, whose break turned the trend up

s.check("the armed level is switched ON", vix1_trend._ARM_BROKEN_LEVEL, True)

bars = load("GBPUSD_H1_sep16.csv", "H1")
if not bars:
    print("   SKIP — GBPUSD_H1_sep16.csv (broker bars through 16 Sep) not present on this machine")
else:
    def at(day, hour):
        t = int(dt.datetime(2026, 9, day, hour, tzinfo=UTC).timestamp())
        return next((k for k, c in enumerate(bars) if c.time == t), None)

    def state(i):
        w = bars[max(0, i + 1 - 3000):i + 1][-1500:]
        return trend_state(w, n=48, turns=structure_turns(w, 48))

    def bias(i, armed=True):
        keep = vix1_trend._ARM_BROKEN_LEVEL
        vix1_trend._ARM_BROKEN_LEVEL = armed
        try:
            return vix1_bias.detect_bias(bars[max(0, i + 1 - 3000):i + 1], [], SYM)
        finally:
            vix1_trend._ARM_BROKEN_LEVEL = keep

    print()
    print("   his event, GBP/USD (labels are his clock, UTC+3):")
    st = state(at(14, 19))
    s.check("Mon 14 Sep 22:00 — the trend turned up", st.direction, 1)
    s.check("...and the level whose break turned it is ARMED", round(st.turn_level or 0, 5), BROKEN)
    s.check("...while ordinary protection sits far below it", round(st.protected, 5), 1.34635)
    s.check("...so the level that would end this trend is the armed one", round(st.kill_level, 5), BROKEN)

    i0 = at(14, 21)                                    # his Tue 15 Sep 00:00
    s.check("Tue 15 Sep 00:00 — that candle closes back below the broken level",
            round(bars[i0].close, 5) < BROKEN, True)
    st0 = state(i0)
    s.check("...so the up trend is over", st0.direction == 1, False)
    s.check("...a turn DOWN is proposed, off the level that was taken back",
            (st0.pending, round(st0.choch_price or 0, 5)), (-1, BROKEN))
    s.check("...and the reason says so", "took back the level" in st0.reason(), True)

    # HIS TWO-STAGE TURN IS UNTOUCHED: the proposed turn still has to print its own break of structure
    # before the trend reads DOWN, so for 14 hours there is no direction either way and nothing trades.
    changing = [h for h in range(0, 11) if state(at(15, h)).direction != 0]
    s.check("Tue 15 Sep 00:00-13:00 — the trend is CHANGING, with no direction either way", changing, [])
    s.check("Tue 15 Sep 14:00 — its own lower low confirms it and the trend reads DOWN",
            state(at(15, 11)).direction, -1)
    s.check("...named by the level that was taken back and the low that confirmed it",
            state(at(15, 11)).reason(), "trend turned down by CHoCH at 1.34954, confirmed by BOS at 1.34634")

    ib = at(15, 13)                                    # his Tue 15 Sep 16:00 — the candle it bought
    got = bias(ib)
    s.check("Tue 15 Sep 16:00 — no BUY any more",
            None if got is None else ("BUY" if got.bullish else "SELL"), None)
    old = bias(ib, armed=False)
    s.teeth("the armed level", old is not None and old.bullish)

    last = state(len(bars) - 1)
    s.check("and it still reads DOWN on the newest bar, with price under the pullback high",
            (last.direction, bars[-1].close < 1.34956), (-1, True))

    # ── THE ARMED LEVEL RETIRES ONCE ORDINARY PROTECTION PASSES IT ──────────────────────────────────
    # A real case from the same instrument: a downtrend that began with a change of character at 1.36199
    # and has since protected itself at 1.35186, far below it. From there the broken level could never
    # end the trend first, so it is dropped and the trend is judged the ordinary way.
    ret = state(at(3, 14))                             # his Thu 03 Sep 17:00
    s.check("Thu 03 Sep 17:00 — a downtrend that came from a change of character",
            (ret.direction, round(ret.choch_price or 0, 5)), (-1, 1.36199))
    s.check("...protection has passed the broken level, so nothing is armed",
            (round(ret.protected, 5), ret.turn_level), (1.35186, None))
    s.check("...and the level that ends it is ordinary protection", ret.kill_level, ret.protected)

s.done()
