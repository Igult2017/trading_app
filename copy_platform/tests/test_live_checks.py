"""CHECK ONLY WHAT IS LIVE — his idea, 22 Nov 2026 (plan step 5).

In words:
  * a master holding a trade or order, or active in the last 24 h (or since this start), is re-read every 30 s; one
    quiet for 24 h, every 5 minutes — listening is never reduced, only this re-read;
  * the repair check reads ONLY followers holding a live copy; a follower with nothing copied is read 0 times;
  * a FORCED request (the follower's own news, a copy that failed) is read even if not live; a "logged back in"
    request is read only if live.
The REAL `sweep._pass` and `CTraderProvider._check_every` run; the database, pool and broker are stand-ins.
"""
import asyncio
import time
from types import SimpleNamespace

from _harness import Suite
import sweep
import providers.ctrader as prov
from providers.ctrader import CTraderProvider

s = Suite("COPY — checking only what is live")

# ── 1. THE MASTER'S TWO SPEEDS ─────────────────────────────────────────────────────────────────────────────────────


def master(positions=None, orders=None, started_ago_h=48.0, active_ago_h=None):
    p = object.__new__(CTraderProvider)
    p._positions, p._orders = positions or {}, orders or {}
    p.started_at = time.time() - started_ago_h * 3600
    if active_ago_h is not None:
        p._active_at = time.time() - active_ago_h * 3600
    return p.__class__._check_every(p)


s.check("a master holding a trade is re-read every 30 s", master(positions={1: object()}), 30.0)
s.check("...holding a pending order too", master(orders={5: object()}), 30.0)
s.check("a master active 1 hour ago (nothing open now) stays at 30 s — his followers' stuck copies need a fresh read",
        master(active_ago_h=1), 30.0)
s.check("a master just started stays at 30 s for 24 h", master(started_ago_h=0.1), 30.0)
s.check("a master quiet for 24 h is re-read every 5 minutes", master(started_ago_h=48, active_ago_h=30),
        float(prov.IDLE_CHECK_S))

# ── 2. THE REPAIR CHECK READS ONLY LIVE FOLLOWERS ──────────────────────────────────────────────────────────────────
import pool  # noqa: E402
import cred_manager  # noqa: E402
import db_io  # noqa: E402

ACCOUNTS = {"bA": 101, "bB": 102, "bC": 103}          # broker row id -> follower's cTrader account id
rows = [(SimpleNamespace(id=f"f{b}", master_id="m1"), SimpleNamespace(id=b, account_type="demo", platform="ctrader"))
        for b in ACCOUNTS]
LIVE = {"fbA"}                                         # only follower A holds a live copy
read: list = []


async def fake_run_db(fn, *a, **k):
    if getattr(fn, "__name__", "") == "_rows":
        return rows
    return fn(*a, **k)


async def fake_creds(b):
    return {"ctraderId": str(ACCOUNTS[b.id])}


async def fake_read(conn, the_pool, acct):
    read.append(acct)
    return SimpleNamespace(order=[], position=[])

db_io.run_db = fake_run_db
cred_manager.get_creds = fake_creds
sweep.live_followers = lambda holding: set(LIVE)
sweep._read = fake_read
sweep.EVERY_S = 0.03
pool.enabled_for = lambda kind: True
pool.POOL = SimpleNamespace(_home={101: object(), 102: object(), 103: object()})
m1 = SimpleNamespace(_positions={}, _orders={}, read_at=time.monotonic(), resting=set(), origin={}, started_at=0)
engine = SimpleNamespace(_providers={"m1": m1})


def run_pass(only):
    read.clear()
    asyncio.new_event_loop().run_until_complete(sweep._pass(engine, only))
    return sorted(read)


s.check("the timed check reads ONLY the follower holding a live copy", run_pass(None), [101])
s.check("a FORCED request reads that follower even with nothing live (its own news, a failed copy)",
        run_pass({102: True}), [102])
s.check("a 'logged back in' request for a follower with nothing live reads nothing", run_pass({103: False}), [])
s.check("...and one for the live follower does read it", run_pass({101: False}), [101])
LIVE.clear()
s.check("with no live copies at all, the timed check reads NOTHING", run_pass(None), [])
s.done()
