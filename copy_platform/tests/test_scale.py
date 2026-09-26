"""COPY TRADING AT SCALE — the ceilings, measured rather than asserted.

His instruction, 2026-09-26: *"ensure copy trader can be used by many people and the only limit is
resources which is hosting. Make it production grade and most effective and ingenious piece of
engineering."*

Before this work the copier was **software**-bound, not resource-bound, in four ways. Each one has a
check here, and each check REPORTS A NUMBER rather than saying "fast":

  1. every database call ran ON the event loop, so the whole engine stopped for each one;
  2. the fan-out gathered every follower at once, with no bound;
  3. each order re-downloaded the account's 1,941-symbol list (312 KB measured on his account);
  4. nothing held the broker's documented rate limit, so a burst got throttled rather than served.

THE ONE CEILING THAT REMAINS IS THE BROKER'S, and it is not ours to remove: cTrader allows
*"a maximum of 50 requests per second per connection"* (https://help.ctrader.com/open-api/) and
recommends *"at most... two connections: one for demo accounts and one for live"*
(https://help.ctrader.com/open-api/connection/). Test 4 proves we stay inside it.

Nothing here talks to a broker or a real database.
"""
import asyncio
import time

from _harness import Suite

import gateway
import symbol_details
from db_io import run_db

s = Suite("COPY — the scale ceilings")


# ── 1. THE DATABASE NO LONGER STOPS THE ENGINE ─────────────────────────────────────────────────
# The proof that matters for his actual ask. A blocking call of 200 ms, fifty times over — on the
# event loop that is 10 seconds of a stopped engine no matter how big the server is. Off it, the
# host's threads decide.
SLOW_MS, N = 0.2, 50


def _slow_db():
    time.sleep(SLOW_MS)          # stands in for a real query; blocking, exactly like psycopg2
    return 1


async def _on_the_loop():
    t0 = time.monotonic()
    for _ in range(N):
        _slow_db()               # what the code did before: called straight from async code
    return time.monotonic() - t0


async def _off_the_loop():
    t0 = time.monotonic()
    await asyncio.gather(*[run_db(_slow_db) for _ in range(N)])
    return time.monotonic() - t0


async def _loop_stays_alive():
    """While the database work runs, does anything ELSE get to run? That is the real question —
    a stalled loop is a master's socket that is not being read."""
    ticks = 0

    async def heartbeat():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    hb = asyncio.ensure_future(heartbeat())
    await _off_the_loop()
    hb.cancel()
    return ticks


print()
print("1. THE DATABASE, ON THE EVENT LOOP vs OFF IT")
before = asyncio.run(_on_the_loop())
after = asyncio.run(_off_the_loop())
print(f"   {N} x {SLOW_MS*1000:.0f}ms queries, the OLD way (on the loop) : {before:5.2f}s")
print(f"   {N} x {SLOW_MS*1000:.0f}ms queries, the NEW way (worker pool): {after:5.2f}s")
print(f"   -> {before/max(after, 1e-9):.1f}x faster, and the difference grows with the host")
s.check("the fan-out is no longer serialised by the database", after < before / 2, True)

ticks = asyncio.run(_loop_stays_alive())
print(f"   the event loop ran {ticks} other things while those queries were in flight")
s.check("the engine keeps running during database work (0 would mean it is still stalled)",
        ticks > 5, True)
s.teeth("the old path really did block — it is not a slow-thread artefact",
        before > after)


# ── 2. THE FAN-OUT IS BOUNDED ──────────────────────────────────────────────────────────────────
# 500 followers used to mean 500 simultaneous broker requests. The cap keeps memory flat and stops
# the queue in front of the rate limiter growing without limit.
async def _bounded(n, cap):
    sem = asyncio.Semaphore(cap)
    live = peak = 0

    async def one():
        nonlocal live, peak
        async with sem:
            live += 1
            peak = max(peak, live)
            await asyncio.sleep(0.001)
            live -= 1

    await asyncio.gather(*[one() for _ in range(n)])
    return peak


print()
print("2. THE FAN-OUT CAP")
peak = asyncio.run(_bounded(500, 25))
print(f"   500 followers, cap 25 -> the most ever running at once: {peak}")
s.check("never exceeds the cap", peak <= 25, True)
s.teeth("without a cap all 500 would be live at once", asyncio.run(_bounded(500, 500)) > 25)


# ── 3. THE SYMBOL LIST IS FETCHED ONCE PER ACCOUNT, NOT ONCE PER ORDER ─────────────────────────
print()
print("3. THE 312 KB SYMBOL LIST")
ACCT = 999001
symbol_details.forget_account(ACCT)
s.check("nothing cached to begin with", symbol_details.symbol_map(ACCT), None)
symbol_details.put_symbol_map(ACCT, {"EURUSD": 1, "GBPUSD": 2})
s.check("cached after the first fetch", symbol_details.symbol_map(ACCT), {"EURUSD": 1, "GBPUSD": 2})
s.check("...and it is per ACCOUNT — symbol ids are not shared between accounts",
        symbol_details.symbol_map(ACCT + 1), None)
# A BROKER HICCUP MUST NOT POISON THE CACHE. An empty reply cached as fact would make every later
# order on that account unresolvable, silently.
symbol_details.put_symbol_map(ACCT, {})
s.check("an EMPTY reply is not cached over a good one",
        symbol_details.symbol_map(ACCT), {"EURUSD": 1, "GBPUSD": 2})
s.teeth("forgetting an account really clears it",
        (symbol_details.forget_account(ACCT), symbol_details.symbol_map(ACCT))[1] is None)


# ── 4. THE BROKER'S OWN RATE LIMIT IS HELD ─────────────────────────────────────────────────────
# "a maximum of 50 requests per second per connection" — we sit just under it so a clock edge
# cannot tip us over. A burst inside one second's budget must NOT be slowed: that is what makes a
# fan-out fast; only sustained load waits.
async def _burst_then_sustain():
    b = gateway._Bucket(45.0)
    t0 = time.monotonic()
    for _ in range(45):
        await b.take()
    burst = time.monotonic() - t0
    t1 = time.monotonic()
    for _ in range(45):
        await b.take()
    return burst, time.monotonic() - t1


print()
print("4. THE BROKER'S 50-REQUESTS-PER-SECOND RULE")
burst, paced = asyncio.run(_burst_then_sustain())
print(f"   first 45 (one second's budget): {burst*1000:6.0f} ms  <- a burst is not throttled")
print(f"   next  45:                       {paced:6.2f} s   <- paced to the limit")
s.check("a burst within budget is not slowed", burst < 0.2, True)
s.check("sustained load is paced to the broker's rule", 0.8 < paced < 1.5, True)


# ── 5. TWO CONNECTIONS FOR THE WHOLE PLATFORM, NOT ONE PER ORDER ───────────────────────────────
# Spotware: "At most, you should create two connections: one for demo accounts and one for live."
print()
print("5. HOW MANY CONNECTIONS THE PLATFORM HOLDS")
gateway._gateways.clear()
seen = {gateway.for_account(t) for t in ("demo", "demo", "demo", "live", "live", "LIVE", "funded")}
s.check("however many accounts, there are only ever TWO gateways", len(seen), 2)
s.check("demo and live are separate connections, as the docs require",
        gateway.for_account("demo") is not gateway.for_account("live"), True)
s.check("a funded/prop account goes on the LIVE connection, not demo",
        gateway.for_account("funded") is gateway.for_account("live"), True)
s.teeth("the same environment really does reuse one object",
        gateway.for_account("demo") is gateway.for_account("demo"))

s.done()
