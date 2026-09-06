"""
test_position_book.py — run with:
    py -3 signal_platform/tests/vix1/test_position_book.py

ONE SHARED ANSWER TO "WHAT IS OPEN?", AND THE TICK THAT WAKES THE WATCHER.

His worry, 2026-09-06: *"sometimes a market moves very fast so if it is not first we can lose money
in no time especially if we have good R that we need to lock."* Both stop-moving paths began the
same way — ask the broker what is open, THEN look at the price — so neither could react faster than
the broker answered, and the fast one spent a request every half second re-asking a question whose
answer changes a few times a day.

WHAT THESE CHECKS PROTECT. The cache sits in front of the only fact that decides whether a stop gets
moved at all. Two ways it could be worse than no cache:

    it turns "I could not find out" into "nothing is open"   -> a real position stops being watched
    it serves a position with a stop that has since moved    -> a done rung looks undone

Both are checked below, along with the thing the cache exists for: a second read inside the window
must not touch the broker.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

_pass = 0
_fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}: got {got!r}" + ("" if ok else f", want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


from monitor import position_book as PB
from data import ctrader_positions as CP


class _Broker:
    """Counts how many times it was actually asked — the point of the cache is that this stays low."""

    def __init__(self, answer):
        self.answer = answer
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        return self.answer() if callable(self.answer) else self.answer


def _reset(answer):
    """Point the book at a fresh fake broker with an empty cache."""
    PB._cached = None
    PB._cached_at = 0.0
    PB._forced = False
    broker = _Broker(answer)
    CP.open_positions = broker
    return broker


print("\nTHE SHARED POSITION BOOK\n")

# ── 1. THE WHOLE POINT: ASK ONCE, SERVE MANY ───────────────────────────────
print("1. a second read inside the window does not touch the broker:")
b = _reset(["a-position"])
first = asyncio.run(PB.positions())
check("the first read goes to the broker", b.calls, 1)
check("...and returns what it said", first, ["a-position"])
for _ in range(20):
    asyncio.run(PB.positions())
check("twenty more reads cost NOTHING", b.calls, 1)

# ── 2. NONE AND [] MUST STAY DIFFERENT ─────────────────────────────────────
# The contract `ctrader_positions` states and a boot test once caught being broken. A cache that
# blurs these stops a real position being watched.
print("\n2. 'could not find out' never becomes 'nothing is open':")
b = _reset(None)
check("a failed first read reports None, not []", asyncio.run(PB.positions()), None)
b = _reset([])
check("genuinely nothing open is [], not None", asyncio.run(PB.positions()), [])

# ── 3. A FAILED READ FALLS BACK TO WHAT WE LAST KNEW ───────────────────────
# Going blind because one request timed out would be worse than a five-second-old list: the position
# is still there, and its rungs still need watching.
print("\n3. one failed read does not blind the watcher:")
state = {"answer": ["still-open"]}
b = _reset(lambda: state["answer"])
asyncio.run(PB.positions())                      # warm it
state["answer"] = None                           # now the broker starts failing
PB.invalidate()
check("a failed refresh still serves the last good list",
      asyncio.run(PB.positions()), ["still-open"])

# ...BUT NOT FOR EVER. Past the abandon window it is not evidence of anything.
import time as _time
PB._cached_at = _time.monotonic() - (PB._ABANDON_AFTER_S + 1)
check("...but a list older than the abandon window is given up, not served",
      asyncio.run(PB.positions()), None)

# ── 4. AFTER A STOP MOVE, THE CACHED COPY IS WRONG ─────────────────────────
# It still carries the OLD stop, and the ratchet in `execution.breakeven` compares against exactly
# that — so an already-moved rung would look unmoved.
print("\n4. invalidate() forces a fresh read:")
b = _reset(["v1"])
asyncio.run(PB.positions())
check("warm", b.calls, 1)
asyncio.run(PB.positions())
check("...still warm", b.calls, 1)
PB.invalidate()
asyncio.run(PB.positions())
check("after a stop move it asks again", b.calls, 2)

# ── 5. TWO CALLERS, ONE REQUEST ────────────────────────────────────────────
# The watcher and the tracker can both find the list stale in the same instant. Without the lock
# that is two reconciles at a socket that serialises them anyway.
print("\n5. concurrent callers share one broker read:")


async def _both():
    PB._cached = None
    PB._cached_at = 0.0
    PB._forced = False
    return await asyncio.gather(PB.positions(), PB.positions(), PB.positions())


b = _reset(["shared"])
results = asyncio.run(_both())
check("three callers at once", b.calls, 1)
check("...and all three get the answer", results, [["shared"]] * 3)

# ── 6. THE TICK WAKES THE WATCHER ──────────────────────────────────────────
# The loop used to sleep half a second between price looks. It now waits on the tick itself, so a
# rung reached is acted on when the price lands rather than up to 500ms later.
print("\n6. a price tick wakes the watcher immediately:")
from monitor.trade_watcher import TradeWatcher


async def _noop(_msg):
    return True


async def _wake():
    w = TradeWatcher(_noop)
    loop = asyncio.get_running_loop()
    started = loop.time()
    # A tick lands 20ms from now; the watcher is waiting with a 5s liveness timeout.
    loop.call_later(0.02, lambda: w._on_tick("EURUSD", 1.1, 0.0))
    await w._wait_for_tick(timeout=5.0)
    return loop.time() - started


waited = asyncio.run(_wake())
check("it returns on the tick, not on the timeout", waited < 1.0, True)


async def _quiet():
    w = TradeWatcher(_noop)
    loop = asyncio.get_running_loop()
    started = loop.time()
    await w._wait_for_tick(timeout=0.05)          # no tick ever arrives
    return loop.time() - started


# AND A SILENT MARKET MUST NOT HANG IT. If no tick ever comes, the loop still has to come round to
# notice the stream has died and fall back to a requested quote.
quiet = asyncio.run(_quiet())
check("a silent market still lets the loop go round", quiet >= 0.05, True)

# ── 7. THE SCHEDULED JOB MUST ACTUALLY RUN ─────────────────────────────────
#
# THIS CHECK EXISTS BECAUSE IT DID NOT, AND THE TRACKER SHIPPED DEAD (2026-09-06).
#
# The job was first wired as `lambda: track_positions(_dm)`. APScheduler decides how to run a job by
# asking `iscoroutinefunction(func)`, and a lambda that RETURNS a coroutine is not a coroutine
# function — so it ran the lambda in a worker thread, got a coroutine object back and dropped it:
#
#     RuntimeWarning: coroutine 'check_all' was never awaited
#
# The tracker never executed once. Everything I checked passed — the modules imported, the signature
# matched, all five suites were green — because none of them asked the only question that mattered:
# would the job actually run. Deployed, and caught only by reading the production boot log.
print("\n7. the scheduled job is something APScheduler will await:")
import inspect
import main as MAIN

check("the tracker job is a real coroutine function",
      inspect.iscoroutinefunction(MAIN._track_positions), True)
# TEETH FOR THIS ONE, because the failing shape is subtle: a lambda returning a coroutine LOOKS
# right, is accepted without complaint, and silently never runs.
check("  ...and a lambda returning a coroutine would NOT pass this",
      inspect.iscoroutinefunction(lambda: MAIN._track_positions()), False)


# ── TEETH ──────────────────────────────────────────────────────────────────
print("\n  teeth — these checks can actually fail:")
b = _reset(["x"])
asyncio.run(PB.positions())
PB._cached_at = 0.0                               # pretend the window has passed
asyncio.run(PB.positions())
check("  a stale window really does re-ask", b.calls, 2)

print(f"\n  {_pass} passed, {_fail} failed\n")
sys.exit(1 if _fail else 0)
