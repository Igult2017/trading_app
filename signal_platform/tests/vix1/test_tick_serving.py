"""SERVING tick-built candles — the three locks, and the hole that must never be served.

WHY THIS FILE EXISTS SEPARATELY FROM `test_tick_bars`. That one proves the bars we BUILD are right.
This one proves the bars we HAND OUT are right, which is a different question with different ways to
be wrong: serving a symbol that has not earned it, serving while the switch is off, overwriting the
broker's own values, or — the dangerous one — joining our bars onto the broker's across a GAP.

THE GAP IS THE ONE THAT MATTERS. A candle series with a minute missing is invisible to everything
downstream: swing detection, the momentum test and the line all treat the list as consecutive bars
and will compute confidently on a shape that never happened. The builder guarantees each bar it kept
is whole; it does NOT guarantee the tail starts exactly where the broker's copy stopped. A stream
that dropped for ninety seconds leaves perfectly good bars on both sides of a hole.

WHAT THE LIVE EVIDENCE WAS, on 30 Aug 2026: EUR/USD, GBP/USD, USD/JPY and XAU/USD each matched the
broker 200/200 bars exactly; GBP/JPY was wrong on every single bar by a constant 0.005. So the
per-symbol lock is not theoretical — there is a real instrument it has to keep out, today.
"""
from _harness import Suite
from config.settings import settings
from core.types import Candle
from data.tick_serving import extend_with_ticks
import data.tick_serving as ts
import data.tick_bars as tb
import data.tick_bar_audit as tba

s = Suite("SERVING TICK CANDLES — switch, trust, and an unbroken join")

M = 60
BASE = 1_788_000_000 // M * M


def bar(t, c, tf="M1", step=M):
    return Candle(time=t, open=c, high=c + 0.001, low=c - 0.001, close=c, volume=1, timeframe=tf)


BROKER = [bar(BASE + i * M, 1.1000 + i / 10000) for i in range(3)]   # ...ends at BASE+120
NEWEST = BROKER[-1].time


class FakeBuilder:
    def __init__(self, bars):
        self._bars = bars

    def bars(self, symbol, count=240):
        return list(self._bars)


class FakeAudit:
    def __init__(self, trusted):
        self._t = trusted

    def trusted(self, symbol):
        return self._t


def setup(*, on: bool, trusted: bool, ours):
    object.__setattr__(settings, "tick_bars_serve_enabled", on)
    tb.builder = FakeBuilder(ours)
    tba.audit = FakeAudit(trusted)


# The two minutes the broker has not published yet.
TAIL = [bar(NEWEST + M, 1.1004), bar(NEWEST + 2 * M, 1.1005)]


# ── LOCK 1: THE SWITCH ──────────────────────────────────────────────────────
setup(on=False, trusted=True, ours=TAIL)
s.check("switch OFF serves the broker's bars unchanged",
        extend_with_ticks("EUR/USD", "M1", BROKER), BROKER)

# ── LOCK 2: PER-SYMBOL TRUST ────────────────────────────────────────────────
setup(on=True, trusted=False, ours=TAIL)
s.check("a symbol that has not earned trust gets nothing (this is GBP/JPY today)",
        extend_with_ticks("GBP/JPY", "M1", BROKER), BROKER)

# ── BOTH ON: the tail is served ─────────────────────────────────────────────
setup(on=True, trusted=True, ours=TAIL)
got = extend_with_ticks("EUR/USD", "M1", BROKER)
s.check("switch on + trusted -> the unpublished minutes are appended", len(got), 5)
s.check("...the broker's own bars are returned untouched", got[:3], BROKER)
s.check("...and the newest bar is the minute the broker has not sent yet",
        got[-1].time, NEWEST + 2 * M)

# ── LOCK 3: THE JOIN MUST BE UNBROKEN ───────────────────────────────────────
# One minute missing between the broker's newest and our tail.
setup(on=True, trusted=True, ours=[bar(NEWEST + 2 * M, 1.1005)])
s.check("a GAP at the join is refused outright — no hole is ever served",
        extend_with_ticks("EUR/USD", "M1", BROKER), BROKER)

# A gap PART WAY along the tail: everything up to the hole is kept, nothing after it.
setup(on=True, trusted=True,
      ours=[bar(NEWEST + M, 1.1004), bar(NEWEST + 3 * M, 1.1006)])
got = extend_with_ticks("EUR/USD", "M1", BROKER)
s.check("a gap mid-tail stops the join there rather than skipping over it", len(got), 4)
s.check("...and the bar after the hole is NOT served", got[-1].time, NEWEST + M)

# ── NOTHING IS EVER OVERWRITTEN ─────────────────────────────────────────────
# Our copy of a minute the broker has already sent must be ignored — the broker is the answer sheet.
setup(on=True, trusted=True, ours=[bar(NEWEST, 9.9999), bar(NEWEST + M, 1.1004)])
got = extend_with_ticks("EUR/USD", "M1", BROKER)
s.check("a minute the broker already sent is never replaced by ours", got[2].close, BROKER[2].close)
s.check("...while the genuinely newer minute is still appended", len(got), 4)

# ── TIMEFRAMES THAT ARE NOT SERVED ──────────────────────────────────────────
setup(on=True, trusted=True, ours=TAIL)
h4 = [bar(BASE, 1.10, tf="H4")]
s.check("H4 is not served from ticks", extend_with_ticks("EUR/USD", "H4", h4), h4)
s.check("M15 is not served from ticks", extend_with_ticks("EUR/USD", "M15", h4), h4)
s.check("an empty broker series is returned as-is, never replaced by ours",
        extend_with_ticks("EUR/USD", "M1", []), [])

# ── THE HOUR: SIXTY WHOLE MINUTES OR NOTHING ────────────────────────────────
# H1 is where the complaint began. An hour is only ever built from a complete set of minutes.
HOUR = BASE // 3600 * 3600 + 3600           # a clean hour boundary, after BASE
broker_h1 = [bar(HOUR - 3600, 1.1000, tf="H1")]
full_hour = [bar(HOUR + i * M, 1.1000 + i / 100000) for i in range(60)]
setup(on=True, trusted=True, ours=full_hour)
got = extend_with_ticks("EUR/USD", "H1", broker_h1)
s.check("a fully-watched hour is served as one closed H1 bar", len(got), 2)
s.check("...stamped at the hour's open", got[-1].time, HOUR)
s.check("...with the hour's true open", got[-1].open, full_hour[0].open)
s.check("...and the hour's true close", got[-1].close, full_hour[-1].close)

# 59 minutes is not an hour. This is the check that stops a PARTIAL hour becoming a level.
setup(on=True, trusted=True, ours=full_hour[:59])
s.check("59 minutes does NOT become an H1 bar — a partial hour is never a level",
        extend_with_ticks("EUR/USD", "H1", broker_h1), broker_h1)

# A hole inside the hour must also refuse, not silently average 59 minutes into 60.
setup(on=True, trusted=True, ours=full_hour[:30] + full_hour[31:])
s.check("an hour with a minute missing inside it is refused too",
        extend_with_ticks("EUR/USD", "H1", broker_h1), broker_h1)


# ── TEETH ───────────────────────────────────────────────────────────────────
# Prove the gap check can fail: without it, the hole above would be served.
setup(on=True, trusted=True, ours=[bar(NEWEST + 2 * M, 1.1005)])
naive = BROKER + [bar(NEWEST + 2 * M, 1.1005)]      # what "just append it" would produce
s.teeth("the join check", extend_with_ticks("EUR/USD", "M1", BROKER) != naive)

# And prove serving actually happens when everything is right — a suite where nothing is ever
# served would pass every check above while the feature did nothing.
setup(on=True, trusted=True, ours=TAIL)
s.teeth("serving itself", len(extend_with_ticks("EUR/USD", "M1", BROKER)) > len(BROKER))

object.__setattr__(settings, "tick_bars_serve_enabled", False)
s.done()
