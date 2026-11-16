"""C10 — A STRATEGY CALCULATING MUST NOT FREEZE THE TRADE-PROTECTING JOBS (16 Nov 2026).

Measured live (07:51–08:56 UTC): the 2-second position tracker dropped 149 of ~1,960 passes and waited up
to 4.5 s, because `await strategy.analyze(...)` runs pure calculation ON the one event loop
(`orchestrator/strategy_runner.py`). The strategies now calculate on ONE dedicated thread.

Proved here with a fake strategy that burns CPU for a second: a 0.1-second job on the main loop keeps
ticking beside it (and DID NOT with the old direct await — the teeth); strategies still take turns; and
the record both sides share (`FiredRegistry`) survives being used from two threads at once.
"""
import asyncio
import threading
import time

from _harness import Suite

from orchestrator import strategy_runner as R

s = Suite("C10 — strategies calculate on their own thread; the main worker stays free")


class Busy:
    """A strategy whose analyze is pure calculation for `secs` — no waits, like VIX.1 and BX."""
    def __init__(self, secs, log=None):
        self.secs, self.log = secs, log

    async def analyze(self, context):
        if self.log is not None:
            self.log.append(("start", time.monotonic()))
        end, x = time.monotonic() + self.secs, 0
        while time.monotonic() < end:
            x += 1
        if self.log is not None:
            self.log.append(("end", time.monotonic()))
        return x


async def ticks_during(run):
    """How many 0.1-second ticks the main loop managed while `run` was going, and the longest gap."""
    stamps, done = [], False

    async def ticker():
        while not done:
            stamps.append(time.monotonic())
            await asyncio.sleep(0.1)

    t = asyncio.create_task(ticker())
    await asyncio.sleep(0)            # let the ticker take its first turn before the calculation
    await run()
    stamps.append(time.monotonic())   # the calculation's end closes the last gap
    done = True
    await t
    gaps = [b - a for a, b in zip(stamps, stamps[1:])] or [0.0]
    return len(stamps), max(gaps)


loop = asyncio.new_event_loop()
n_new, gap_new = loop.run_until_complete(ticks_during(
    lambda: asyncio.get_running_loop().run_in_executor(R._STRATEGY_THREAD, R._calculate, Busy(1.0), None)))
n_old, gap_old = loop.run_until_complete(ticks_during(lambda: Busy(1.0).analyze(None)))
s.check(f"on the strategy thread, the main loop kept ticking ({n_new} ticks, longest gap {gap_new:.2f}s)",
        gap_new < 0.5, True)
s.teeth(f"the OLD direct await froze it for the whole calculation (longest gap {gap_old:.2f}s)",
        gap_old >= 0.9)

# ── strategies still take turns ────────────────────────────────────────────
events: list = []


async def two_at_once():
    lp = asyncio.get_running_loop()
    await asyncio.gather(lp.run_in_executor(R._STRATEGY_THREAD, R._calculate, Busy(0.3, events), None),
                         lp.run_in_executor(R._STRATEGY_THREAD, R._calculate, Busy(0.3, events), None))

loop.run_until_complete(two_at_once())
kinds = [k for k, _ in events]
s.check("two strategies asked at the same moment still run ONE AFTER THE OTHER", kinds,
        ["start", "end", "start", "end"])

src = open(R.__file__, encoding="utf-8").read()
s.teeth("the runner really calculates on the strategy thread (the call, not just the definition)",
        "run_in_executor(\n            _STRATEGY_THREAD, _calculate, strategy, context)" in src
        and "result = await strategy.analyze(context)" not in src)

# ── the shared record survives two threads ─────────────────────────────────
from core import fired_registry as FR                              # noqa: E402
FR.strategy_state_repo.save = lambda *a, **k: None
FR.strategy_state_repo.load = lambda *a, **k: {}
reg = FR.FiredRegistry("test")
errors: list = []


def hammer(prefix):
    try:
        for i in range(3000):
            reg.add(f"{prefix}{i}")
            reg.has(f"{prefix}{i // 2}")
            if i % 50 == 0:
                reg.cleanup(0)
    except Exception as exc:                      # "dictionary changed size during iteration"
        errors.append(repr(exc))

ts = [threading.Thread(target=hammer, args=(p,)) for p in ("a", "b", "c")]
[t.start() for t in ts]
[t.join() for t in ts]
s.check("the sent-messages record used from three threads at once raises nothing", errors, [])
s.done()
