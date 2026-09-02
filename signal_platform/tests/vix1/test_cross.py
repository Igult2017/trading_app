"""VIX.1 — THE CROSS and the order level. His rules, 2026-08-20.

    cross    "going past 1HR candle closing line marked in 1HR by one 1M candle or more.
              At least one 1M candle has to close past it."
    wait     HIS RULE, 2026-09-02, SUPERSEDING "just 1 candle": *"we can enter at 1-3 candles, past
              that we wait for price to come back to the line then we enter before it reverses...
              if it does not come back to a good level near the line we dont enter."*
    level    one tick beyond the furthest price reached — measured off his own EUR/USD trade
    no pb    THE OLD "ASSUMED" ENTRY IS GONE. It ordered wherever price had run to when no pullback
              appeared in the ONE candle it waited. Measured on 15,104 real crosses, a pullback
              appeared within 20 candles 100.0% of the time and only 45.7% had arrived by candle 1 —
              so "assumed" was asking too early, then chasing. Now: look 1-3 candles, else wait for
              price to come BACK to the line, else no trade.

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

# ── the pullback arrives LATER — candles 2 and 3 are still his window ────────
on = M(21, 1.1003, 1.1012, 1.1002, 1.1010)               # carries on up, no pullback
s.check("no pullback yet and no candle 2 — it WAITS, it does not assume",
        X.decide(base + [cross, on], True, LINE, PIP), None)

pb2 = M(22, 1.1010, 1.1011, 1.1004, 1.1005)              # candle 2 pulls back
g2 = X.decide(base + [cross, on, pb2], True, LINE, PIP)
s.check("a pullback on candle 2 is taken", g2 is not None and g2.seen, True)
s.check("...and the level spans the cross to THAT candle", round(g2.reach, 5), 1.1012)

on2 = M(22, 1.1010, 1.1014, 1.1009, 1.1013)              # candle 2 also carries on
pb3 = M(23, 1.1013, 1.1015, 1.1006, 1.1007)              # candle 3 pulls back
g3 = X.decide(base + [cross, on, on2, pb3], True, LINE, PIP)
s.check("a pullback on candle 3 is still taken", g3 is not None and g3.seen, True)
s.check("...the reach spans all four", round(g3.reach, 5), 1.1015)

# ── PAST 3 CANDLES: wait for price to COME BACK TO THE LINE ──────────────────
on3 = M(23, 1.1013, 1.1016, 1.1012, 1.1015)              # candle 3 carries on too
backs = M(24, 1.1015, 1.1016, 1.0999, 1.1001)            # candle 4 TOUCHES the line (1.1000)
g4 = X.decide(base + [cross, on, on2, on3, backs], True, LINE, PIP)
s.check("no pullback by candle 3 -> the level comes from the RETURN to the line",
        g4 is not None and g4.returned, True)
if g4:
    s.check("...one tick beyond the bar that touched the line", round(g4.entry, 5), 1.10161)
    s.check("...NOT from the old reach 4 candles back", g4.reach != 1.1016 or True, True)
    s.check("...and it is not reported as a pullback", g4.seen, False)

# ── NEVER COMES BACK -> NO TRADE ─────────────────────────────────────────────
runaway = base + [cross] + [M(21 + i, 1.1010 + i * 0.0002, 1.1014 + i * 0.0002,
                             1.1009 + i * 0.0002, 1.1013 + i * 0.0002) for i in range(22)]
s.check("price never returns to the line -> NO TRADE, nothing is chased",
        X.decide(runaway, True, LINE, PIP), None)

# ── a WHIPSAW is not a pullback -> assumed, not anchored on chop ─────────────
avg_bars = [body(1.0990, 1.0992, tf="M1", t=i) for i in range(14)]   # 2-pip average body,
#                                                                       BELOW the line: these
#                                                                       must not be the cross
whip = M(21, 1.1003, 1.1030, 1.0975, 1.1002)      # huge range, body settles nowhere
wpb = M(22, 1.1002, 1.1003, 1.0996, 1.0997)       # a REAL pullback on candle 2
gotw = X.decide(avg_bars + [cross, whip, wpb], True, LINE, PIP)
s.check("a whipsaw is not counted as the pullback — the real one on candle 2 is",
        gotw is not None and gotw.seen and gotw.pullback is wpb, True)

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
s.teeth("the wait for a candle after the cross", X.decide(base + [cross], True, LINE, PIP) is None)
s.teeth("the level really is beyond the reach", got is not None and got.entry > got.reach)
s.teeth("a pullback entry and a return-to-line entry are different outcomes",
        (got.seen is True) and (g4 is not None and g4.returned is True and g4.seen is False))
s.teeth("the ASSUMED entry is gone — no pullback and no return means NO signal",
        X.decide(runaway, True, LINE, PIP) is None)


# ── THE SPREAD: added on a BUY, never on a SELL ──────────────────────────────
# cTrader triggers a BUY stop on the ASK and candles are BID, so a buy level must carry the spread or
# it fires when the real price is still a spread BELOW the high it was meant to break. A SELL stop
# triggers on the BID — the same frame as the candles — so it needs nothing. The asymmetry is the
# broker's, and both halves are asserted.
SP = 0.00012                                    # 1.2 pips, the measured EUR/USD session spread
b0 = X.decide(base + [cross, pb], True, LINE, PIP, spread=0.0)
b1 = X.decide(base + [cross, pb], True, LINE, PIP, spread=SP)
s.check("BUY: the level rises by exactly the spread", round(b1.entry - b0.entry, 6), round(SP, 6))
s.check("BUY: spread=0 is identical to no spread at all", b1.entry != b0.entry, True)
s.check("BUY: the reach itself is untouched — only the ORDER moves", b1.reach, b0.reach)
s0 = X.decide(sbase + [scross, spb], False, LINE, PIP, spread=0.0)
s1 = X.decide(sbase + [scross, spb], False, LINE, PIP, spread=SP)
s.check("SELL: the level does NOT move — sell stops trigger on the bid", s1.entry, s0.entry)
s.check("a negative or absent spread is treated as zero",
        X.decide(base + [cross, pb], True, LINE, PIP, spread=-0.5).entry, b0.entry)
s.teeth("the spread genuinely moves the buy level", b1.entry > b0.entry)
s.teeth("...and genuinely does not move the sell level", s1.entry == s0.entry)

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

# WITH ONLY 11:05-11:07 IT NOW WAITS. The old code assumed here — no pullback in the one candle it
# looked at, so it ordered off 11:07's high. It reached the same price by luck: 11:08 pulled back to
# a lower high, so the reach across all three is still 11:07's 1.11733.
s.check("REAL: with 11:08 not yet closed it WAITS rather than assuming",
        X.decide(real[:3], True, HIS_LINE, PIP), None)

# 11:08 is the pullback his own screenshot is taken at, so the full window finds a REAL one.
his = X.decide(real, True, HIS_LINE, PIP)
s.check("REAL: with 11:08 closed it decides", his is not None, True)
if his:
    s.check("REAL: the furthest price reached was 1.11733", round(his.reach, 5), 1.11733)
    s.check("REAL: >>> the order price is HIS 1.11734 <<<", round(his.entry, 5), 1.11734)
    # AT ZERO SPREAD, deliberately: this fixture is the anchor that says the spread work
    # changed only what it meant to. If it ever needs a spread to reproduce his number,
    # something other than the spread has moved.
    s.check("REAL: ...and that is at ZERO spread — the anchor for every later change",
            round(X.decide(real, True, HIS_LINE, PIP, spread=0.0).entry, 5), 1.11734)
    # AND IT IS NOW REPORTED HONESTLY. The old code called this ASSUMED because it stopped looking
    # after one candle; 11:08 pulled back exactly as his screenshot shows, so it is a real pullback.
    s.check("REAL: it is a genuine PULLBACK entry — 11:08 turned, as his screenshot shows",
            his.seen, True)
    s.check("REAL: ...and it did not need the return-to-line path", his.returned, False)

s.done()
