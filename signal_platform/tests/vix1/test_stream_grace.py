"""A PRICE STREAM THAT HAS JUST OPENED IS WARMING UP, NOT BROKEN.

His report, 2026-09-02: *"The FIX data system still makes noise when I deploy... Can you find a way
that makes it not to make false alarm."*

**Measured in production, from his own log.** At boot:

    03:56:11.853  [fix] price stream open, subscribed to 5 instruments
    03:56:11.854  [entry-watcher] price stream quiet - falling back to the scheduled scan   <- 1 ms
    03:56:11.913  [dispatcher] message sent                                                  <- his DM
    03:56:12.623  [entry-watcher] price stream is flowing again                              <- 769 ms

And it was never only about deploys - the same thing fired mid-session whenever a new position
opened its own stream:

    09:54:11.305  [fix] price stream open, subscribed to ['GBP/USD']
    09:54:11.306  [watcher] stream stale for GBP/USD, falling back                           <- 1 ms
    09:54:15.184  [watcher] streamed prices are flowing again                                <- 3.9 s

THE CAUSE, and it is one line. `age()` returns None in TWO different situations, and its own
docstring says so: *"None means nothing has EVER arrived, a different problem from a stream gone
quiet."* The next function down then collapsed them:

    return a is None or a > limit_s

So a session was judged dead in the same instant it was born. The book knew THAT it was connected
but not WHEN, so there was nothing to measure the silence against.

THE FIX IS NOT A SUPPRESSION. Silence on a stream with no ticks yet is measured from the moment it
opened, judged by the same limit as any other silence. A subscription that really never delivers is
still caught - at 90 seconds instead of 1 millisecond. That is the case this file tests hardest,
because a fix that only silences alarms would pass every other test here.
"""
import time

from _harness import Suite
from data.fix_book import QuoteBook
from data.fix_wire import ID_TO_SYMBOL

s = Suite("PRICE STREAM GRACE — a stream that just opened has not failed")

LIMIT = 90.0          # _STALE_AFTER_S, the same figure both watchers use

# One real symbol id from the wire map, so the book absorbs a tick the way the stream feeds it.
SYM_ID = next(iter(ID_TO_SYMBOL))
SYM    = ID_TO_SYMBOL[SYM_ID]


def tick(book, bid="1.2345", ask="1.2347"):
    book.absorb({"55": str(SYM_ID), "px_0": bid, "px_1": ask})


def opened(age_s: float = 0.0) -> QuoteBook:
    """A connected book that opened `age_s` seconds ago, with no ticks."""
    b = QuoteBook()
    b.connected = True
    if age_s:
        b._connected_at -= age_s      # wind the clock back rather than sleep
    return b


# ── THE FALSE ALARM ITSELF ─────────────────────────────────────────────────
b = opened()
s.check("a stream that opened this instant is NOT stale", b.is_stale(LIMIT), False)
s.check("...and the old rule said it WAS", b.age() is None, True)
s.check("...nor is it stale for a named symbol", b.is_stale(LIMIT, SYM), False)

# The exact production timings, reproduced.
s.check("1 ms after opening (his boot alarm) — not stale", opened(0.001).is_stale(LIMIT), False)
s.check("769 ms after opening (when it recovered) — not stale", opened(0.769).is_stale(LIMIT), False)
s.check("3.9 s after opening (his 09:54 alarm) — not stale", opened(3.9).is_stale(LIMIT), False)
s.check("60 s in, still inside the limit", opened(60.0).is_stale(LIMIT), False)


# ── THE REAL FAULT MUST STILL BE CAUGHT ────────────────────────────────────
# A session that logs on but whose subscription never delivers. This is the case a lazy fix breaks,
# and the reason the grace is measured rather than the alarm suppressed.
s.check("a stream open past the limit with NO tick ever IS stale",
        opened(LIMIT + 1).is_stale(LIMIT), True)
s.check("...and for a named symbol too", opened(LIMIT + 1).is_stale(LIMIT, SYM), True)
s.check("exactly at the limit is not yet stale", opened(LIMIT).is_stale(LIMIT), False)

# A stream that HAD prices and stopped — the original fault this alarm exists for. Unchanged.
b = opened(300.0)
tick(b)
s.check("a stream with a fresh tick is not stale", b.is_stale(LIMIT), False)
b._last_tick[SYM] -= (LIMIT + 1)
b._last_any -= (LIMIT + 1)
s.check("a stream that went quiet after ticking IS stale", b.is_stale(LIMIT), True)
s.check("...even though it has been open for ages", b.open_for() > LIMIT, True)

# A DISCONNECTED STREAM IS ALWAYS STALE, grace or no grace — the flag beats the clock.
b = QuoteBook()
s.check("a stream that never connected is stale", b.is_stale(LIMIT), True)
b.connected = True
b.connected = False
s.check("...and so is one that dropped", b.is_stale(LIMIT), True)


# ── THE GRACE RESTARTS ON EACH OPEN ────────────────────────────────────────
# A reconnect must get its own window; carrying the first connect's clock forward would alarm
# instantly on every reconnect — which is the 09:54 case.
b = opened(LIMIT + 10)
s.check("an old silent session is stale", b.is_stale(LIMIT), True)
b.connected = False
b.connected = True
s.check("...and a reconnect starts the window again", b.is_stale(LIMIT), False)
# Re-setting True while already connected must NOT keep pushing the window out, or a stream that
# re-affirms its connection could never be reported dead.
b = opened(LIMIT + 10)
b.connected = True
s.check("re-asserting an existing connection does NOT extend the grace", b.is_stale(LIMIT), True)


# ── PER-SYMBOL: one quiet symbol does not hide behind another's ticks ──────
b = opened(LIMIT + 1)
tick(b)
s.check("the symbol that ticked is not stale", b.is_stale(LIMIT, SYM), False)
other = next((v for k, v in ID_TO_SYMBOL.items() if v != SYM), None)
if other:
    s.check("a DIFFERENT symbol with no tick, past the limit, is stale",
            b.is_stale(LIMIT, other), True)
    s.check("...and inside the limit it is not", opened(1.0).is_stale(LIMIT, other), False)


# ── open_for() reports honestly ────────────────────────────────────────────
s.check("a disconnected book has been open for 0s", QuoteBook().open_for(), 0.0)
s.check("an open one reports roughly its age", round(opened(42.0).open_for()), 42)


# ── TEETH — the assertions can fail ────────────────────────────────────────
# Without these, "nothing alarms" would pass everything here, which is exactly the wrong fix.
s.teeth("the OLD rule would have called a fresh stream stale",
        (lambda a: a is None or a > LIMIT)(opened().age()) is True)
s.teeth("a genuinely dead subscription is still reported",
        opened(LIMIT + 1).is_stale(LIMIT) is True)
s.teeth("a stream that ticked then stopped is still reported", b.is_stale(LIMIT, other) is True
        if other else True)


# ── A KNOWN CONSTANT OFFSET IS NOT NEWS ────────────────────────────────────
# The third piece of the same complaint. GBP/JPY produced 405 of the 434 mismatch warnings in 6.8
# hours (93%), every one saying the same thing: all four prices out by exactly 0.005. That is
# already recorded (B13), already acted on (untrusted, never served) and already reported by the
# 15-minute scoreboard. A warning should tell you something you do not already know.
#
# The rule is CLASSIFICATION, not suppression: a clean constant offset is said once and again if it
# CHANGES; anything else is logged every time, because that is a real candle fault.
from data.tick_bar_audit import _constant_offset          # noqa: E402


class Bar:
    def __init__(self, o, h, l, c, t=0):
        self.open, self.high, self.low, self.close, self.time = o, h, l, c, t


# His real GBP/JPY bar, from the production log at 10:41.
ours   = Bar(215.529, 215.556, 215.527, 215.545)
broker = Bar(215.534, 215.561, 215.532, 215.550)
off = _constant_offset(ours, broker)
s.check("his GBP/JPY bar is a clean constant offset", off is not None, True)
s.check("...of -0.005, the figure B13 measured", round(off, 6), -0.005)

# His real GBP/USD bar from the same log — only the OPEN differs. That is a candle fault, not a
# price-source difference, and it must keep logging every time.
s.check("a bar where only the open differs is NOT a constant offset",
        _constant_offset(Bar(1.3489, 1.34896, 1.34866, 1.3487),
                         Bar(1.34891, 1.34896, 1.34866, 1.3487)), None)
# A dropped tick shows as a wrong high only.
s.check("a wrong high alone is NOT a constant offset",
        _constant_offset(Bar(1.1, 1.5, 1.0, 1.2), Bar(1.1, 1.9, 1.0, 1.2)), None)
# An exact match is a zero offset, and is never reached (compare only calls this on a mismatch).
s.check("identical bars give a zero offset",
        _constant_offset(Bar(1.1, 1.2, 1.0, 1.15), Bar(1.1, 1.2, 1.0, 1.15)), 0.0)

# XAU/USD's real mismatch: only the open differs, by 0.25 — must stay loud.
s.check("gold's open-only difference stays a real mismatch",
        _constant_offset(Bar(4308.35, 4308.82, 4307.85, 4308.37),
                         Bar(4308.1, 4308.82, 4307.85, 4308.37)), None)

s.teeth("a real candle fault is not mistaken for an offset",
        _constant_offset(Bar(1.1, 1.5, 1.0, 1.2), Bar(1.1, 1.9, 1.0, 1.2)) is None)

s.done()
