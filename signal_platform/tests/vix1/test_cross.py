"""VIX.1 — THE CROSS and the order level. His rules, 2026-08-20.

    cross    "going past 1HR candle closing line marked in 1HR by one 1M candle or more.
              At least one 1M candle has to close past it."
    wait     "just 1 candle after price crossing 1HR line"
    level    one tick beyond the furthest price reached — measured off his own EUR/USD trade
    no pb    "A valid setup is not skipped because there is no pullback. If there is no pullback
              where we expect it, we assume it is there and enter but report that in the signal."

The last block replays HIS TRADE from real broker bars and requires the order price he actually
used, 1.11734. If that number does not come out, the rebuild is wrong.
"""
from _harness import Suite, C, body, flat_series
from core.types import Candle
from strategies import vix1_cross as X

s = Suite("VIX.1 — the cross, and the level the order rests at")

LINE = 1.1000
PIP = 0.0001


def M(t, o, h, l, c):
    return C(t, o, h, l, c, tf="M1")


# ── the cross is a CLOSE, not a touch ────────────────────────────────────────
touch_only = [M(0, 1.0990, 1.1005, 1.0989, 1.0995)]          # wick past, close below
s.check("a wick past the line is NOT a cross", X.cross_index(touch_only, True, LINE), None)
closed_past = [M(0, 1.0995, 1.1005, 1.0994, 1.1002)]
s.check("a CLOSE past the line is a cross", X.cross_index(closed_past, True, LINE), 0)
s.check("a close exactly ON the line is not past it",
        X.cross_index([M(0, 1.0995, 1.1001, 1.0994, 1.1000)], True, LINE), None)
s.check("SELL mirrors — close below the line",
        X.cross_index([M(0, 1.1005, 1.1006, 1.0994, 1.0997)], False, LINE), 0)
s.check("SELL: a wick below is not a cross",
        X.cross_index([M(0, 1.1005, 1.1006, 1.0990, 1.1003)], False, LINE), None)
s.check("the FIRST close past it wins, not the biggest",
        X.cross_index([M(0, 1.0995, 1.0999, 1.0994, 1.0998),
                       M(1, 1.0998, 1.1003, 1.0997, 1.1002),
                       M(2, 1.1002, 1.1020, 1.1001, 1.1018)], True, LINE), 1)

# ── reach — the furthest point, wicks included ───────────────────────────────
w = [M(0, 1.1000, 1.1010, 1.0999, 1.1008), M(1, 1.1008, 1.1025, 1.1007, 1.1012)]
s.check("reach on a buy is the highest HIGH", X.reach(w, 0, 1, True), 1.1025)
s.check("reach on a sell is the lowest LOW", X.reach(w, 0, 1, False), 1.0999)
s.check("reach respects the index bounds", X.reach(w, 0, 0, True), 1.1010)

# ── the tick ─────────────────────────────────────────────────────────────────
s.check("one tick is a tenth of a pip (5-digit FX)", round(X.tick(0.0001), 6), 0.00001)
s.check("...and the same tenth on gold", round(X.tick(0.01), 6), 0.001)

# ── decide — needs the cross AND one more candle ─────────────────────────────
base = flat_series(20, price=1.0990, size=0.0002, tf="M1")
cross = M(20, 1.0996, 1.1006, 1.0995, 1.1003)            # closes past
s.check("no cross yet -> nothing to decide", X.decide(base, True, LINE, PIP), None)
s.check("cross but no candle after it yet -> wait", X.decide(base + [cross], True, LINE, PIP), None)

# the candle after the cross PULLS BACK
pb = M(21, 1.1003, 1.1004, 1.0998, 1.0999)
got = X.decide(base + [cross, pb], True, LINE, PIP)
s.check("with a pullback, it decides", got is not None, True)
if got:
    s.check("...the level is one tick beyond the furthest point", round(got.entry, 5), 1.10061)
    s.check("...the furthest point was the cross candle's high", got.reach, 1.1006)
    s.check("...it reports the pullback was SEEN", got.seen, True)
    s.check("...and hands back the pullback candle", got.pullback is pb, True)

# the candle after the cross CARRIES ON — the ASSUMED case
on = M(21, 1.1003, 1.1012, 1.1002, 1.1010)
got2 = X.decide(base + [cross, on], True, LINE, PIP)
s.check("with no pullback it STILL decides — a valid setup is never skipped for want of one",
        got2 is not None, True)
if got2:
    s.check("...the level comes off the higher of the two candles", round(got2.entry, 5), 1.10121)
    s.check("...it reports NO pullback", got2.seen, False)
    s.check("...and carries no pullback candle", got2.pullback, None)

# ── a WHIPSAW is not a pullback -> assumed, not anchored on chop ─────────────
avg_bars = [body(1.1000, 1.1002, tf="M1", t=i) for i in range(14)]   # 2-pip average body
whip = M(21, 1.1003, 1.1030, 1.0975, 1.1002)      # huge range, body settles nowhere
gotw = X.decide(avg_bars + [cross, whip], True, LINE, PIP)
s.check("a whipsaw counts as NO pullback", gotw is not None and gotw.seen is False, True)

# ── SELL mirrors end to end ──────────────────────────────────────────────────
sbase = flat_series(20, price=1.1010, size=0.0002, tf="M1")
scross = M(20, 1.1004, 1.1005, 1.0994, 1.0997)           # closes below the line
spb = M(21, 1.0997, 1.1002, 1.0996, 1.1001)              # counter candle (up) = pullback
sgot = X.decide(sbase + [scross, spb], False, LINE, PIP)
s.check("SELL decides too", sgot is not None, True)
if sgot:
    s.check("...level is one tick BELOW the lowest low", round(sgot.entry, 5), 1.09939)
    s.check("...pullback seen", sgot.seen, True)

# ── TEETH ────────────────────────────────────────────────────────────────────
s.teeth("the close-not-touch rule", X.cross_index(touch_only, True, LINE) is None)
s.teeth("the one-candle wait", X.decide(base + [cross], True, LINE, PIP) is None)
s.teeth("the level really is beyond the reach",
        got2 is not None and got2.entry > got2.reach)
s.teeth("assumed and seen are genuinely different outcomes",
        (got.seen is True) and (got2.seen is False))

# ── HIS OWN TRADE, from real broker bars ─────────────────────────────────────
# EUR/USD 5 Aug 2019. The 10:00 H1 candle closed at 1.11705 = the line. His order was 1.11734.
REAL = [
    #      time   open     high     low      close
    (1564995900, 1.11672, 1.11689, 1.11672, 1.11687),   # 11:05 below
    (1564995960, 1.11686, 1.11716, 1.11686, 1.11716),   # 11:06 CROSS
    (1564996020, 1.11718, 1.11733, 1.11718, 1.11726),   # 11:07 carries on -> assumed
    (1564996080, 1.11725, 1.11725, 1.11711, 1.11716),   # 11:08 pulls back (his screenshot)
]
real = [Candle(time=t, open=o, high=h, low=l, close=c, volume=0, timeframe="M1")
        for t, o, h, l, c in REAL]
HIS_LINE = 1.11705
s.check("REAL: the cross is the 11:06 candle", X.cross_index(real, True, HIS_LINE), 1)
his = X.decide(real[:3], True, HIS_LINE, PIP)
s.check("REAL: it decides one candle after the cross", his is not None, True)
if his:
    s.check("REAL: the furthest price reached was 1.11733", round(his.reach, 5), 1.11733)
    s.check("REAL: >>> the order price is HIS 1.11734 <<<", round(his.entry, 5), 1.11734)
    s.check("REAL: and it is an ASSUMED entry — 11:07 did not pull back", his.seen, False)

s.done()
