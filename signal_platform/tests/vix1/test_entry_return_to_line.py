"""VIX.1 — the entry comes from where price is NOW, never from a stale level.

HIS RULES, 2026-09-02, in three statements that turned out to be one change:

  1. *"We wait for the candle to close and then we enter in stop order so that market fills us...
     we dont enter in live market."*
  2. *"We can enter at 1-3 candles, past that we wait for price to come back to the line then we
     enter before it reverses... if it does not come back to a good level near the line we dont
     enter."*
  3. *"We enter by a fractal when we have 1HR candle ready but 1M is still not aligning with it."*

WHAT WAS WRONG, MEASURED, NOT ARGUED:

  * The code waited EXACTLY ONE candle and, failing to find a pullback, ordered wherever price had
    run to and called it "PULLBACK ASSUMED". A pullback appeared within 20 candles in **100.0%** of
    13,188 EUR/USD and 1,916 XAU/USD crosses — never once absent — but only **45.7%** had arrived by
    candle 1. So "assumed" was asking too early and then chasing, and chasing is the worst bucket in
    every measurement (entering closest to the line: 27.4% / 26.6% / 25.0% win against ~33%).
  * A level already through the market was RE-PRICED to the live bid/ask and labelled a market
    entry — **17% of EUR/USD and 22% of GBP/USD entries**. That is the thing he ruled out, and it
    destroys the reason for stop orders in his own words: *"if it goes the pullback direction
    without filling us we are safe too."*
  * On the FRACTAL route the level came from a cross a median **24 candles old**, sitting ~1R from
    the market (p90 ~3R). Nothing re-windowed it.

THE ONE PRINCIPLE: the level is derived from the CURRENT moment — the pullback inside 1-3 candles,
or the bar that came back to the line — never from a stale cross and never from the live price.

His 5 Aug 2019 trade is unaffected and still orders at 1.11734; that is asserted in `test_cross.py`
and `test_entry_real_events.py`, and this file does not repeat it.
"""
from _harness import Suite
from core.types import Candle
from strategies import vix1_cross as X
from strategies.vix1_entry import m1_signals

s = Suite("VIX.1 — pullback in 1-3, else the return to the line, else nothing")

PIP = 0.0001
T0 = 1787200000 - (1787200000 % 3600)
LINE = 1.11705


# REAL TIMESTAMPS, built directly. `_harness.C` takes a bar INDEX and computes the time itself, so
# handing it an epoch produces times in the far future and the entry sees no bars at all — which is
# exactly what happened on the first run of this file.
def m(i, o, h, lo, c):
    return Candle(time=T0 + 60 * i, open=o, high=h, low=lo, close=c, volume=1.0, timeframe="M1")


VC = Candle(time=T0 - 3600, open=1.11600, high=1.11720, low=1.11580, close=LINE,
            volume=1.0, timeframe="H1")                         # the momentum candle; its close IS the line
NOW = T0 + 60 * 40                                              # nothing is still forming

# A LIVE QUOTE ABOVE THE LINE BUT BELOW EVERY LEVEL BELOW. Without it the ALIGNMENT gate reads the
# last closed bar, and a pullback that dips under the line would refuse the setup before the entry
# logic is ever reached — the test would then be measuring alignment, not the state machine. The
# fractal block at the bottom deliberately passes NO quote, because engaging that route is its point.
Q = (LINE + 0.00005, LINE + 0.00007)


def below(i):
    return m(i, 1.11680, 1.11689, 1.11670, 1.11687)


def carries(i, base):
    """A candle that goes WITH the bias — never a pullback."""
    return m(i, base, base + 0.00030, base - 0.00005, base + 0.00025)


CROSS = m(2, 1.11690, 1.11716, 1.11688, 1.11716)                # closes past the line


# ── 1. THE PULLBACK, ANYWHERE IN 1-3 ────────────────────────────────────────
for k in (1, 2, 3):
    bars = [below(0), below(1), CROSS]
    for j in range(1, k):
        bars.append(carries(2 + j, 1.11716 + 0.0002 * j))
    top = 1.11716 + 0.0002 * (k - 1) + 0.00030 if k > 1 else 1.11716
    bars.append(m(2 + k, top, top, top - 0.00040, top - 0.00035))   # the pullback
    got = m1_signals(bars, True, VC, pip=PIP, symbol="EUR/USD", quote=Q, now=NOW)
    s.check(f"a pullback on candle {k} is taken", len(got), 1)
    if got:
        s.check(f"  ...and it is reported as a pullback, not assumed", got[0]["kind"], "pullback")

# Not enough candles yet is a WAIT, never an assumption — the old behaviour's whole failure mode.
s.check("cross with nothing after it -> waits",
        m1_signals([below(0), below(1), CROSS], True, VC, pip=PIP, quote=Q, now=NOW), [])


# ── 2. PAST 3 CANDLES: THE RETURN TO THE LINE ───────────────────────────────
run = [below(0), below(1), CROSS,
       carries(3, 1.11716), carries(4, 1.11736), carries(5, 1.11756)]
back = m(6, 1.11776, 1.11780, LINE - 0.00002, LINE + 0.00003)     # comes back and TOUCHES the line
got = m1_signals(run + [back], True, VC, pip=PIP, symbol="EUR/USD", quote=Q, now=NOW)
s.check("no pullback by candle 3, price returns -> an entry IS produced", len(got), 1)
if got:
    s.check("  ...flagged as a return, not a pullback", got[0]["kind"], "returned")
    s.check("  ...the level is one tick beyond the RETURNING bar, near the line",
            round(got[0]["entry"], 5), round(1.11780 + X.tick(PIP), 5))
    s.check("  ...NOT one tick beyond the old run-up (1.11786)",
            round(got[0]["entry"], 5) != round(1.11786 + X.tick(PIP), 5), True)
    s.check("  ...and the stop still sits behind the line", got[0]["sl"] < LINE, True)


# ── 3. NEVER COMES BACK -> NO TRADE ─────────────────────────────────────────
away = [below(0), below(1), CROSS] + [carries(3 + i, 1.11716 + 0.0002 * i) for i in range(25)]
s.check("price never returns to the line -> NOTHING is placed",
        m1_signals(away, True, VC, pip=PIP, symbol="EUR/USD", quote=Q, now=NOW), [])


# ── 4. NEVER A LIVE-MARKET ENTRY ────────────────────────────────────────────
# The level would be 1.11734 here. An ask already past it means a stop order there fills at once.
pb_bars = [below(0), below(1), CROSS, m(3, 1.11730, 1.11733, 1.11710, 1.11716)]
s.check("ask under the level -> the stop order is placed",
        len(m1_signals(pb_bars, True, VC, pip=PIP, quote=(1.11710, 1.11712), now=NOW)), 1)
s.check("ask ALREADY PAST the level -> nothing is placed",
        len(m1_signals(pb_bars, True, VC, pip=PIP, quote=(1.11733, 1.11736), now=NOW)), 0)
none_of_them = m1_signals(pb_bars, True, VC, pip=PIP, quote=(1.11710, 1.11712), now=NOW)
s.check("no signal anywhere still calls itself a MARKET entry",
        any("MARKET" in x.get("sl_note", "") for x in none_of_them), False)


# ── 5. THE FRACTAL ROUTE — the case he raised ───────────────────────────────
# 1HR is ready, the 1M ran the wrong way, its fractal breaks 20+ candles after the cross. The level
# must come from the bar that returned to the line, NOT from a cross that old. Measured staleness of
# the old behaviour: median 24 candles, the level sitting ~1R from the market (p90 ~3R).
frac = [below(0), below(1), CROSS,
        carries(3, 1.11716), carries(4, 1.11736), carries(5, 1.11756)]
for i in range(6, 24):                                    # the counter-move, back under the line
    px = 1.11776 - 0.00006 * (i - 5)
    frac.append(m(i, px, px + 0.00004, px - 0.00008, px - 0.00006))
frac.append(m(24, LINE - 0.00020, LINE + 0.00010, LINE - 0.00025, LINE + 0.00008))   # breaks back up
got = m1_signals(frac, True, VC, pip=PIP, symbol="EUR/USD", now=NOW)
if got:
    s.check("fractal route: the level comes from the CURRENT bar, near the line",
            got[0]["entry"] < 1.11740, True)
    s.check("  ...not from the 20+ candle old run-up at 1.11786",
            round(got[0]["entry"], 5) != round(1.11786 + X.tick(PIP), 5), True)
else:
    s.check("fractal route: refused rather than entering off a stale level", got, [])


# ── TEETH ───────────────────────────────────────────────────────────────────
s.teeth("the old one-candle wait would have assumed instead of waiting",
        m1_signals([below(0), below(1), CROSS], True, VC, pip=PIP, quote=Q, now=NOW) == [])
s.teeth("a runaway that never returns would have been chased before",
        m1_signals(away, True, VC, pip=PIP, quote=Q, now=NOW) == [])
s.teeth("an order that would fill at once is refused, not re-priced",
        len(m1_signals(pb_bars, True, VC, pip=PIP, quote=(1.11733, 1.11736), now=NOW)) == 0)

s.done()
