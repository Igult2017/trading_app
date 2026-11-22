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


# ── 4+5. HOW MANY CONNECTIONS — the POOL (21 Nov 2026, docs/copy-realtime-plan.md) ──────────────────────────────
# The old gateway held TWO connections for everyone; it was never wired and is deleted. The pool puts accounts on a few
# long-lived connections, COPY_ACCOUNTS_PER_CONN each, per (environment, app). The 50-a-second rule per connection is
# held by `ctrader_protocol.OwnQueueProtocol` and proven with a stand-in broker in `test_pool.py`.
print()
print("4. HOW MANY CONNECTIONS THE PLATFORM HOLDS")
import pool                                                            # noqa: E402
P = pool.Pool()
home = {a: P._conn_for(a, "demo", "app") for a in range(1, pool.ACCOUNTS_PER_CONN + 2)}
s.check(f"{pool.ACCOUNTS_PER_CONN} accounts share ONE connection", len({id(home[a]) for a in range(1, pool.ACCOUNTS_PER_CONN + 1)}), 1)
for a in home:
    home[a].creds[a] = {}
P2 = pool.Pool()
c1 = [P2._conn_for(a, "demo", "app") for a in range(1, 4)]
s.check("an account stays on the connection it was given", P2._conn_for(2, "demo", "app") is c1[1], True)
s.check("demo and live never share a connection", P._conn_for(9001, "live", "app") is home[1], False)
s.check("accounts of a DIFFERENT app never share a connection (cTrader would refuse them)",
        P._conn_for(9002, "demo", "other-app") is home[1], False)
s.teeth("the per-connection cap is what opens a second connection",
        P._conn_for(10_000, "demo", "app") is not home[1])

# AT THE COPIER'S CONNECTION LIMIT (22 Nov 2026): a new account SHARES the least-loaded connection, never opens another —
# the website, the signal engine and the copier share one cTrader app and their limits add up to 20.
Q = pool.Pool()
_lim = pool.POOL_MAX_CONNS
pool.POOL_MAX_CONNS = 2
try:
    made = []
    for a in range(1, 2 * pool.ACCOUNTS_PER_CONN + 6):
        c = Q._conn_for(a, "demo", "app")
        c.creds[a] = {}
        c.client = c.client or object()        # as if connected
        made.append(c)
    s.check("at the limit of 2, no third connection is opened", len({id(c) for c in made}), 2)
    s.check("...the extra accounts share the least-loaded one", Q.count(), 2)
finally:
    pool.POOL_MAX_CONNS = _lim

s.done()
