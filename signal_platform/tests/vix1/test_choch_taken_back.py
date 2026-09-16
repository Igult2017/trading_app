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

from core.types import Candle
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

    st1 = state(at(15, 7))
    s.check("Tue 15 Sep 10:00 — the lower low has confirmed it: the trend reads DOWN", st1.direction, -1)

    ib = at(15, 13)                                    # his Tue 15 Sep 16:00 — the candle it bought
    got = bias(ib)
    s.check("Tue 15 Sep 16:00 — no BUY any more",
            None if got is None else ("BUY" if got.bullish else "SELL"), None)
    old = bias(ib, armed=False)
    s.teeth("the armed level", old is not None and old.bullish)

    last = state(len(bars) - 1)
    s.check("and it still reads DOWN on the newest bar, with price under the pullback high",
            (last.direction, bars[-1].close < 1.34956), (-1, True))

# ── THE ARMED LEVEL RETIRES ONCE ORDINARY PROTECTION PASSES IT ──────────────────────────────────────
# Hand-built candles: a downtrend, a change of character up, then an uptrend that keeps making higher
# lows. Once a higher low sits ABOVE the level that was broken, that level can never end the trend first,
# so it is dropped — and a dip back to it is just an ordinary pullback, not a turn.
print()
print("   the armed level retires when protection passes it:")


def walk(points, start=1700000000):
    """One candle per step: it opens at the previous price and closes at the next."""
    out = []
    for k in range(1, len(points)):
        o, c = points[k - 1], points[k]
        out.append(Candle(time=start + k * 3600, open=o, high=max(o, c) + 0.00005,
                          low=min(o, c) - 0.00005, close=c, volume=0, timeframe="H1"))
    return out


def legs(*prices):
    """Three candles per leg, so a real-time turn has room to be confirmed."""
    pts = [prices[0]]
    for p in prices[1:]:
        a = pts[-1]
        pts += [a + (p - a) / 3, a + 2 * (p - a) / 3, p]
    return walk(pts)


down_then_up = legs(1.1100, 1.1020, 1.1060, 1.0960, 1.1000, 1.0940,   # a downtrend
                    1.1030,                                           # CHoCH up — closes through it
                    1.0995, 1.1080,                                   # its own higher low + higher high
                    1.1050, 1.1120, 1.1090, 1.1160)                   # the uptrend keeps stepping up
st_up = trend_state(down_then_up, n=3, turns=structure_turns(down_then_up, 3))
print(f"      built state: direction {st_up.direction} | protected {st_up.protected} | "
      f"armed {st_up.turn_level} | CHoCH {st_up.choch_price}")
s.check("the fixture really is an uptrend that came from a change of character",
        (st_up.direction, st_up.choch_price is not None), (1, True))
s.check("...and once protection has passed the broken level, nothing is armed any more",
        st_up.turn_level is None or st_up.protected >= st_up.turn_level, True)
s.check("...so the level that ends this trend is ordinary protection", st_up.kill_level, st_up.protected)

# A trend that was never started by a change of character has nothing to arm.
plain_up = legs(1.0900, 1.0960, 1.0930, 1.1010, 1.0980, 1.1060)
st_plain = trend_state(plain_up, n=3, turns=structure_turns(plain_up, 3))
s.check("a trend established from structure alone arms nothing",
        (st_plain.direction, st_plain.turn_level), (1, None))

s.done()
