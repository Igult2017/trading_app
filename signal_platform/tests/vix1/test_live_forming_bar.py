"""D40 — THE HOUR IN PROGRESS IS NOW CURRENT TO THE SECOND, NOT ~80 SECONDS BEHIND.

HIS INSTRUCTION: *"when trade is placed and even when watching 1HR candle to close, we should rely
more on FIX data ... because it is real time data."*

WHAT WAS BLOCKING IT. `candle_aggregator.forming_bar` builds the hour in progress from CLOSED M1
bars. An M1 bar closes once a minute and is then published 10-70s late, so the bar could be ~80
seconds behind. The live price lives in a `FixQuoteStream`'s own `book`, and both streams that exist
are owned by `entry_watcher` and `trade_watcher` — the SCANNER holds neither, so it could not reach
one. `fix_quotes` now keeps a registry that a stream joins when its session comes up and leaves on
every path that ends it.

THE PROPERTY THAT MATTERS MOST IS THE FALLBACK. This is an enrichment, never a dependency: with no
stream, no quote, or a stale quote, the bar must be byte-identical to what it was before. A feature
that makes the platform depend on a second connection to build a candle would be a worse defect than
the staleness it fixes.

WHAT IS DELIBERATELY NOT ASSERTED HERE: that the live tick reaches any strategy DECISION. It must
not. `vix1.py:135` strips the forming bar with `closed_only` for every level and every momentum
read; only `vix1_preclose` — the "this candle closes in N minutes" DM — sees it, and a live price is
exactly what that question wants.
"""
import time

import _harness  # noqa: F401
from _harness import Suite                                          # noqa: E402

from core.types import Candle                                       # noqa: E402
from data import candle_aggregator, fix_quotes                      # noqa: E402
from data.fix_quotes import FixQuoteStream                          # noqa: E402

s = Suite("D40 — the forming hour follows the live price")

HOUR = 3600
OPEN_TS = 1_788_300_000 // HOUR * HOUR      # a real hour boundary


def m1(offset_min, o, h, l, c):
    return Candle(time=OPEN_TS + offset_min * 60, open=o, high=h, low=l, close=c,
                  volume=10, timeframe="M1")


# Three closed minutes inside the hour. `now` sits mid-hour so they are all closed and the hour is
# not: the exact state the pre-close notification asks about.
base = [m1(0, 1.1000, 1.1010, 1.0995, 1.1005),
        m1(1, 1.1005, 1.1020, 1.1000, 1.1015),
        m1(2, 1.1015, 1.1018, 1.1008, 1.1012)]
NOW = OPEN_TS + 3 * 60 + 30


def bar(live=None):
    return candle_aggregator.forming_bar(base, "H1", anchor=OPEN_TS - HOUR, now=NOW,
                                         live_price=live)


# ── WITHOUT A LIVE PRICE: EXACTLY WHAT IT ALWAYS WAS ───────────────────────
plain = bar()
s.check("the hour opens where the first minute opened", plain.open, 1.1000)
s.check("its high is the highest closed minute", plain.high, 1.1020)
s.check("its low is the lowest closed minute", plain.low, 1.0995)
s.check("its close is the last closed minute's close", plain.close, 1.1012)


# ── WITH A LIVE PRICE: IT ONLY EVER EXTENDS ────────────────────────────────
up = bar(live=1.1031)
s.check("a live price above the range lifts the high", up.high, 1.1031)
s.check("...and becomes the close", up.close, 1.1031)
s.check("...and does NOT touch the low", up.low, plain.low)
s.check("...nor the open", up.open, plain.open)

dn = bar(live=1.0990)
s.check("a live price below the range drops the low", dn.low, 1.0990)
s.check("...and becomes the close", dn.close, 1.0990)
s.check("...and does NOT touch the high", dn.high, plain.high)

inside = bar(live=1.1013)
s.check("a live price inside the range moves only the close", inside.close, 1.1013)
s.check("...leaving the high alone", inside.high, plain.high)
s.check("...and the low alone", inside.low, plain.low)

# TEETH — a tick must never SHRINK a range the market really traded. If it overwrote instead of
# extending, this high would come back as 1.1013 rather than 1.1020.
s.teeth("a tick cannot erase a high the market actually made", inside.high == 1.1020)

s.check("volume is untouched — a tick carries no size on this feed", up.volume, plain.volume)


# ── THE REGISTRY, AND ITS FAILURE MODES ────────────────────────────────────
print()
print("   the shared handle:")

for st in tuple(fix_quotes._STREAMS):        # a clean slate, whatever else ran first
    fix_quotes._deregister(st)

s.check("no stream registered -> no live price, so callers fall back", fix_quotes.live_price("EUR/USD"), None)
s.check("...and nothing is reported as connected", fix_quotes.live_streams(), 0)

stream = FixQuoteStream("0000", "offline")   # constructed, never logged on
s.check("merely CONSTRUCTING a stream does not offer it as a price source",
        fix_quotes.live_price("EUR/USD"), None)

# Bring it up the way `connect()` does on success, without a socket.
stream.book.connected = True
fix_quotes._register(stream)
s.check("a registered but quote-less stream still gives None",
        fix_quotes.live_price("EUR/USD"), None)

stream.book._quotes["EUR/USD"] = (1.10000, 1.10004)
stream.book._last_tick["EUR/USD"] = time.monotonic()
s.check("a fresh quote gives the MID, not the bid or the ask",
        round(fix_quotes.live_price("EUR/USD"), 5), 1.10002)
s.check("a symbol with no quote is still None", fix_quotes.live_price("GBP/USD"), None)

# A STALE QUOTE IS NOT A LIVE ONE. This is the check that stops a dead session being trusted: from
# the inside, a quiet market and a dead socket look identical, so age is the only thing separating
# them.
stream.book._last_tick["EUR/USD"] = time.monotonic() - 600
s.check("a 10-minute-old quote is refused, so the caller falls back to closed bars",
        fix_quotes.live_price("EUR/USD"), None)
stream.book._last_tick["EUR/USD"] = time.monotonic()

# THE SESSION DROPS. `_lost()` is the one place every ending path meets, which is why registration
# hangs off it — a new exit route cannot forget.
stream._lost()
s.check("a lost session deregisters itself", fix_quotes.live_price("EUR/USD"), None)
s.check("...and is not counted as connected", fix_quotes.live_streams(), 0)
s.teeth("the stream really was serving a price before it dropped",
        stream.book.quote("EUR/USD") is not None)

# TWO STREAMS, WHICH IS THE REAL DEPLOYMENT: entry_watcher and trade_watcher each own one, and either
# may be the healthy one. The freshest quote wins.
a, b = FixQuoteStream("1", "x"), FixQuoteStream("2", "x")
for st, price, age in ((a, 1.20000, 9.0), (b, 1.30000, 0.5)):
    st.book.connected = True
    st.book._quotes["GBP/USD"] = (price, price)
    st.book._last_tick["GBP/USD"] = time.monotonic() - age
    fix_quotes._register(st)
s.check("with two streams up, the FRESHEST quote wins",
        round(fix_quotes.live_price("GBP/USD"), 5), 1.30000)
s.check("...and both are counted", fix_quotes.live_streams(), 2)
b._lost()
s.check("when the fresher one drops, the other still serves",
        round(fix_quotes.live_price("GBP/USD"), 5), 1.20000)
a._lost()

s.done()
