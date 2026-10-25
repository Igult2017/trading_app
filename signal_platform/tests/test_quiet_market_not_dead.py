"""A QUIET MARKET IS NOT A DEAD FEED.

HIS REPORT, 25 Oct 2026, about the ladder and the candle-close watcher: *"whenever it starts
working, it keeps on going off which i think is not FIX data issue but how it was built such that
it is not aware of when the price is moving slowly hence it assumes FIX data has stopped when price
stops or starts moving slowly."*

He was right. MEASURED from 786 days of the broker's own saved minutes (the M1 bars carry cTrader's
tick count, so the pauses can be counted without a live session):

    EUR/USD   pauses of 3s or more: ~1,940 per WEEKDAY     34.6% of all minutes hold one
              at 21:00 UTC: 291 per hour - one every 12 seconds
    GBP/USD   ~1,452 per weekday                           25.6% of minutes

The ladder's rule was 3 seconds of no tick on one pair, so it announced a dead feed thousands of
times a day on a feed that was working perfectly, DMing him on every flip.

⚠ THE REPLAY BELOW IS THE WHOLE POINT. It drives the real decision function with the 21:00 UTC tick
pattern taken from that measurement, and counts the alarms. The old rule is run over the SAME
pattern so the two numbers sit side by side - a test that only asserted "no alarms now" would not
show that there was ever anything wrong.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(_HERE, "..")))
os.environ.setdefault("DATABASE_URL", "postgresql://x/x")

import time  # noqa: E402

from data.fix_book import QuoteBook  # noqa: E402
from data.fix_wire import SOH, build, parse_stream  # noqa: E402

count, failed = 0, []


def check(label, got, want=True):
    global count
    count += 1
    ok = got == want
    print(f"   {'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if not ok:
        failed.append(label)


print("\nA QUIET MARKET IS NOT A DEAD FEED\n")

# ── 1. THE BOOK TELLS THE TWO APART ─────────────────────────────────────────────────────
book = QuoteBook()
book.connected = True
book.heard()                                   # the session said something just now

# Pretend 60 seconds pass with NO price at all, but heartbeats still arriving every 30s.
# This is the 21:00 UTC market, not a broken feed.
real_now = time.monotonic
try:
    t0 = real_now()
    time.monotonic = lambda: t0 + 60.0         # type: ignore[assignment]
    book._last_msg = t0 + 45.0                 # a heartbeat landed 15s ago
    check("60s with no price does NOT look like a dead session", book.session_silent(75.0), False)
    check("...while the PRICE is correctly reported as not having moved", book.is_stale(3.0), True)

    # Now the session itself goes quiet - no heartbeat, no anything.
    book._last_msg = t0 - 120.0
    check("a session that has said nothing for 180s IS dead", book.session_silent(75.0), True)
finally:
    time.monotonic = real_now                  # type: ignore[assignment]

# ── 2. THE REPLAY: 21:00 UTC, THE QUIETEST HOUR MEASURED ────────────────────────────────
# From the measurement: at 21:00 UTC EUR/USD averages ~291 pauses of 3s+ per hour. Modelled here as
# one tick every 12 seconds for an hour, with the FIX heartbeat arriving every 30s throughout.
TICK_EVERY_S, HEARTBEAT_EVERY_S, HOUR = 12.0, 30.0, 3600


def replay(session_rule: bool) -> int:
    """Count alarms over an hour of quiet-but-healthy market.

    session_rule=True  -> the new behaviour: alarm only when the SESSION goes silent
    session_rule=False -> the old behaviour: alarm when no tick for 3s
    """
    b = QuoteBook()
    b.connected = True
    alarms, degraded = 0, False
    last_tick = last_msg = 0.0
    for sec in range(HOUR):
        if sec % int(TICK_EVERY_S) == 0:
            last_tick = last_msg = float(sec)
        elif sec % int(HEARTBEAT_EVERY_S) == 0:
            last_msg = float(sec)              # a heartbeat: the session is alive, price unchanged
        if session_rule:
            bad = (sec - last_msg) > 75.0
        else:
            bad = (sec - last_tick) > 3.0
        if bad and not degraded:
            alarms += 1
            degraded = True
        elif not bad and degraded:
            alarms += 1                        # the all-clear is a DM too
            degraded = False
    return alarms


old_alarms = replay(session_rule=False)
new_alarms = replay(session_rule=True)
check("the OLD rule fires repeatedly over one quiet hour", old_alarms > 100, True)
check("...which is what he was receiving", old_alarms >= 500, True)
check("the NEW rule fires NOT ONCE over the same hour", new_alarms, 0)
print(f"      (old: {old_alarms} messages in one quiet hour   new: {new_alarms})")

# ── 3. A GENUINELY DEAD SESSION IS STILL CAUGHT ─────────────────────────────────────────
dead = QuoteBook()
dead.connected = True
dead._last_msg = 0.0                           # never heard from
dead._connected_at = time.monotonic() - 300.0
check("a session open 5 minutes that never spoke is dead", dead.session_silent(75.0), True)

fresh = QuoteBook()
fresh.connected = True                         # stamps _connected_at now
check("a session that only just opened is NOT called dead", fresh.session_silent(75.0), False)

# ── 4. A DEAD SUBSCRIPTION, TOLD APART FROM A QUIET MARKET ──────────────────────────────
mixed = QuoteBook()
mixed.connected = True
now = time.monotonic()
mixed._last_tick = {"EUR/USD": now, "GBP/JPY": now - 300.0}
check("one pair silent while another ticks = something IS ticking",
      mixed.ticking_symbols(90.0), 1)
allquiet = QuoteBook()
allquiet.connected = True
allquiet._last_tick = {"EUR/USD": now - 300.0, "GBP/JPY": now - 300.0}
check("nothing ticking anywhere = a quiet market, nothing to report",
      allquiet.ticking_symbols(90.0), 0)

# ── 5. A MESSAGE SPLIT ACROSS TWO READS IS NOT LOST ─────────────────────────────────────
# Losing one is not cosmetic: a lost test request is never answered and the broker logs us out -
# a real disconnect caused by our own parsing.
msg = build("1", 7, "SENDER", [(112, "ping-1")]).decode()
first, second = msg[: len(msg) // 2], msg[len(msg) // 2:]
msgs, leftover = parse_stream(first)
check("half a message yields nothing yet", msgs, [])
check("...and the half is KEPT, not thrown away", leftover, first)
msgs, leftover = parse_stream(leftover + second)
check("the other half completes it", len(msgs), 1)
check("...intact, and recognisable as a test request", msgs[0].get("35"), "1")
check("...carrying its id, so it can be answered", msgs[0].get("112"), "ping-1")
check("...and nothing is left over", leftover, "")

two = build("0", 8, "S", [(112, "a")]).decode() + build("0", 9, "S", [(112, "b")]).decode()
msgs, leftover = parse_stream(two)
check("two whole messages in one read are both parsed", len(msgs), 2)
check("...with nothing left over", leftover, "")

# ── 6. THE LIVE QUOTE ITSELF NO LONGER SWITCHES OFF IN A QUIET MARKET ───────────────────
# Four readers depend on this, and each paid for the old age-only rule:
#   the forming momentum candle (fell back to a bar up to 80s behind, ~37x a weekday)
#   the position tracker, where a STOP goes (~1,940x a weekday, at a 3s limit)
#   the spread reader, and the journal ticker - which DROPPED the pair from his screen.
from data import fix_quotes  # noqa: E402

class _FakeBook:
    """Just enough book to answer the three questions `_usable` asks."""
    def __init__(self, session_dead=False, others=0):
        self._dead, self._others = session_dead, others
    def session_silent(self, _limit):   return self._dead
    def ticking_symbols(self, _within): return self._others

quiet = _FakeBook(session_dead=False, others=0)       # nothing ticking: a still market
check("a 60s-old price on a LIVE session is usable — it has not changed",
      fix_quotes._usable(quiet, "EUR/USD", 60.0, 15.0), True)
check("...and at the 3-second limit the stop decision uses too",
      fix_quotes._usable(quiet, "EUR/USD", 60.0, 3.0), True)
check("a fresh price is of course still usable",
      fix_quotes._usable(quiet, "EUR/USD", 1.0, 15.0), True)

dead = _FakeBook(session_dead=True)
check("a price from a session that stopped answering is REFUSED",
      fix_quotes._usable(dead, "EUR/USD", 60.0, 15.0), False)
check("...even a recent one is refused once the session is gone",
      fix_quotes._usable(dead, "EUR/USD", 20.0, 15.0), False)
check("...but inside the caller's own freshness window it is still taken",
      fix_quotes._usable(dead, "EUR/USD", 2.0, 15.0), True)

busy = _FakeBook(session_dead=False, others=3)        # other pairs ARE arriving
check("one pair silent while three others tick = a dead subscription, refused",
      fix_quotes._usable(busy, "GBP/JPY", 120.0, 15.0), False)
check("...and never having had a price at all is refused the same way",
      fix_quotes._usable(busy, "GBP/JPY", None, 15.0), False)

# ⚠ THE CEILING, AND THE GAP IT CLOSES. With ONE symbol subscribed there is no other stream to
# compare against, so "others are ticking" cannot tell a dead subscription from a still market
# however long it lasts. An existing test caught exactly that — a 10-minute-old quote being
# accepted. Across 786 days there was never a single minute with zero ticks on these pairs, so
# five minutes of silence is a broken feed, not a quiet one.
check("a 10-minute-old price is refused even with a live session and nothing else subscribed",
      fix_quotes._usable(quiet, "EUR/USD", 600.0, 15.0), False)
check("...while four minutes on a live session is still accepted",
      fix_quotes._usable(quiet, "EUR/USD", 240.0, 15.0), True)
check("a pair quiet for 20s while others tick is NOT yet suspect",
      fix_quotes._usable(busy, "GBP/JPY", 20.0, 15.0), True)

print()
if failed:
    print(f"{len(failed)} of {count} FAILED: {failed}")
    sys.exit(1)
print(f"ALL PASS ({count} checks)")
