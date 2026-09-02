"""THE 1M ENTRY'S TRIGGER READS MUST BE LIVE — and the closed window must stop losing a bar.

TWO DEFECTS, both from the same wrong belief: that the feed hands back the bar currently forming as
its newest. Measured 2026-08-21, it never does — it serves CLOSED bars only.

1. `wcl = win[:-1] if win[-1].time == m1[-1].time else win` — `win` is a suffix of `m1`, so
   `win[-1] IS m1[-1]` and the condition is ALWAYS true. It was written to drop a forming bar and
   instead dropped a real closed one, every time, so the cross was seen a full minute late on every
   entry. Now `closed_only`, which asks whether the bar is actually still forming.

2. `last = win[-1].close` was used for two decisions about THIS INSTANT — which side of the line
   price is on, and whether a stop order would fill immediately. That close is up to ~2 minutes old
   (closed bars only, plus a 10-70s publication lag). Now the live (bid, ask), with the closed close
   as the fallback so a missing quote never silences an instrument.

THE ORDER TRIGGERS ON THE SIDE IT TRIGGERS ON. A BUY stop fires on the ASK, a SELL stop on the BID —
the same broker fact that made `vix1_cross.decide` add the spread to buys. `entry` already carries
that spread, so testing it against the bid compared an ask-frame trigger to a bid price.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..", "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

from core.types import Candle  # noqa: E402
from strategies.vix1_entry import m1_signals  # noqa: E402

failed, count = [], 0


def check(name, got, want):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {name}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if not ok:
        failed.append(name)


def teeth(name, broke_it):
    global count
    count += 1
    print(f"   {'PASS' if broke_it else 'FAIL'}  TEETH — {name}: {broke_it}")
    if not broke_it:
        failed.append(f"TEETH:{name}")


PIP = 0.0001
T0 = 1787200000 - (1787200000 % 3600)        # an exact hour boundary


def bar(ts, o, h, lo, c, tf="M1"):
    return Candle(time=int(ts), open=o, high=h, low=lo, close=c, volume=1.0, timeframe=tf)


# The 1HR momentum candle: closes at 1.11705, which IS the line. Same shape as his 5 Aug 2019 trade.
VC = bar(T0 - 3600, 1.11600, 1.11720, 1.11580, 1.11705, tf="H1")


def m1_run(n_after_cross: int):
    """Minutes since the line was drawn: two below the line, then a cross, then `n` more."""
    out = [bar(T0 + 60 * i, 1.11680, 1.11689, 1.11670, 1.11687) for i in range(2)]
    out.append(bar(T0 + 120, 1.11690, 1.11716, 1.11688, 1.11716))          # the CROSS
    # THE CANDLE AFTER THE CROSS IS A PULLBACK (closes below its open), because under his rule of
    # 2026-09-02 the level is only fixed once a pullback appears inside 1-3 candles. The old fixture
    # used a candle that CARRIED ON, which the code then treated as an "assumed" entry — a state that
    # no longer exists. The HIGH is unchanged at 1.11733, so the reach, and therefore the expected
    # order price of 1.11734, are exactly as before: this file is about the CLOSED WINDOW, not the
    # pullback rule, and its subject must not move.
    for i in range(n_after_cross):
        out.append(bar(T0 + 180 + 60 * i, 1.11730, 1.11733, 1.11710, 1.11716))
    return out


print()
print("VIX.1 1M ENTRY — the closed window, and the live quote")

# ── 1. THE DROPPED BAR ───────────────────────────────────────────────────────
# With the cross plus exactly ONE candle after it, the level is decidable. The old code discarded
# that last candle and had to wait another whole minute for a second one to arrive.
NOW = T0 + 240                                    # the 4th minute has closed; nothing is forming
sig = m1_signals(m1_run(1), True, VC, pip=PIP, symbol="EUR/USD", now=NOW)
check("cross + 1 pullback candle is enough — the entry fires now", len(sig), 1)
check("...and the level is one tick beyond the furthest reach", round(sig[0]["entry"], 5), 1.11734)

# PROVED THROUGH THE REAL FUNCTION, not by counting bars. `win` is every M1 since the line was drawn;
# the old expression handed `win[:-1]` to the cross logic, which then had the cross but not the candle
# after it and returned None — one more minute of waiting, on every entry.
import time as _t  # noqa: E402

from strategies import vix1_cross  # noqa: E402

LINE = 1.11705
win_now = [c for c in m1_run(1) if c.time >= VC.time + 3600]
teeth("the old window returned no level at all",
      vix1_cross.decide(win_now[:-1], True, LINE, PIP) is None)
teeth("...and the full closed window returns one",
      vix1_cross.decide(win_now, True, LINE, PIP) is not None)
check("the minute it cost: the level was already decidable",
      round(vix1_cross.decide(win_now, True, LINE, PIP).entry, 5), 1.11734)

# ── 2. THE ALIGNMENT READ IS ON THE BID ──────────────────────────────────────
# Price sits BELOW the line on the stale closed bar, but the live bid is above it. Without a quote
# the entry refuses (wrong side of the line); with one it proceeds.
stale = m1_run(1)
stale[-1] = bar(stale[-1].time, 1.11730, 1.11733, 1.11690, 1.11690)   # a pullback that closes
#                                                                      back UNDER the line
check("stale close below the line -> refused", m1_signals(stale, True, VC, pip=PIP, now=NOW), [])
# THE QUOTE MUST CLEAR THE LINE (1.11705) BUT STAY UNDER THE ENTRY (1.11734). This test is about
# the ALIGNMENT read using the live bid rather than the stale close; a quote above the entry would
# also trip the "already through the market" refusal and the test would be measuring that instead.
live = m1_signals(stale, True, VC, pip=PIP, quote=(1.11710, 1.11712), now=NOW)
check("live BID above the line -> the setup is seen", len(live), 1)
teeth("the quote is what changed the answer, not the bars",
      m1_signals(stale, True, VC, pip=PIP, now=NOW) == [] and len(live) == 1)

# ── 3. A LEVEL ALREADY THROUGH THE MARKET IS NOT TAKEN AT ALL ────────────────
# HIS RULE, 2026-09-02: *"we wait for the candle to close and then we enter in stop order so that
# market fills us... we dont enter in live market."* This used to re-price the order to the live
# bid/ask and label it a MARKET entry — 17% of EUR/USD and 22% of GBP/USD entries were that. It also
# destroyed the reason for using stop orders at all: an order behind the market fills instantly, so
# *"if it goes the pullback direction without filling us we are safe too"* stops being true.
#
# Entry lands at 1.11734. A BUY stop triggers on the ASK, so the ask is still what decides — the
# broker fact is unchanged; only what we DO about it has.
def taken(q):
    return len(m1_signals(m1_run(1), True, VC, pip=PIP, quote=q, now=NOW))


# The bid must clear the LINE (1.11705) or alignment refuses before this is reached; the ask must
# stay under the ENTRY (1.11734) for the order to still rest above the market.
check("bid over the line, ask under the entry -> a STOP order is placed", taken((1.11710, 1.11712)), 1)
check("ask has passed the entry -> NOTHING is placed, and never a market entry",
      taken((1.11733, 1.11736)), 0)
teeth("judging that on the BID would have let a fill-at-once order through",
      taken((1.11733, 1.11736)) == 0 and 1.11733 < 1.11734)

# A SELL triggers on the BID, so the asymmetry must not be applied to it.
VC_S = bar(T0 - 3600, 1.11800, 1.11820, 1.11680, 1.11695, tf="H1")


def sell_run():
    out = [bar(T0 + 60 * i, 1.11710, 1.11720, 1.11700, 1.11710) for i in range(2)]
    out.append(bar(T0 + 120, 1.11700, 1.11705, 1.11670, 1.11670))       # the CROSS, downward
    out.append(bar(T0 + 180, 1.11670, 1.11675, 1.11650, 1.11660))
    return out


s = m1_signals(sell_run(), False, VC_S, pip=PIP, quote=(1.11600, 1.11602), now=NOW)
check("a SELL already through its level is refused too, judged on the BID", len(s), 0)

# ── 4. NO QUOTE IS THE OLD BEHAVIOUR, NEVER SILENCE ──────────────────────────
a = m1_signals(m1_run(1), True, VC, pip=PIP, symbol="EUR/USD", now=NOW)
b = m1_signals(m1_run(1), True, VC, pip=PIP, symbol="EUR/USD", quote=None, now=NOW)
check("quote=None is identical to not passing one", a, b)
check("...and it still produces an entry rather than going quiet", len(a), 1)

# ── 5. THE SPREAD IS UNTOUCHED BY ANY OF THIS ────────────────────────────────
# His 5 Aug fixture is asserted at zero spread elsewhere; here just prove the two inputs stay
# independent — a quote must not silently become a spread.
no_sp = m1_signals(m1_run(1), True, VC, pip=PIP, quote=(1.11710, 1.11712), now=NOW)
check("a quote alone does not shift the order level", round(no_sp[0]["entry"], 5), 1.11734)
with_sp = m1_signals(m1_run(1), True, VC, pip=PIP, spread=0.00012,
                     quote=(1.11710, 1.11712), now=NOW)
check("the spread still does", round(with_sp[0]["entry"], 5), 1.11746)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
