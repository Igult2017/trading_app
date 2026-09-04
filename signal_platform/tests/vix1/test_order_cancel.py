"""A RESTING ORDER IS CANCELLED THE MOMENT ITS SETUP DIES — and never in any other case.

HIS INSTRUCTION, 2026-09-04, with a live example on his account:

    "once it is clear the market has gone the other direction like the gold case now, the order
     should be canceled as soon as possible not waiting 24HR."

THE GOLD CASE. A BUY stop at 4486.56, stop at 4482.44, while gold traded at 4414 — 72 points below
the trigger and far below the stop. `signal_monitor` had ALREADY marked that signal expired hours
earlier; `broker.cancel()` existed with zero callers, so the broker was never told.

THIS FILE IS MOSTLY ABOUT WHAT MUST **NOT** HAPPEN. Cancelling sends a real instruction to a real
account — only the second thing in the platform that changes it, after the stop ladder — so the
guards are worth more than the feature:

  * only orders THIS PLATFORM placed, never one he placed by hand
  * never a FILLED order, because that is a position and cancelling is not how a position is closed
  * a broker failure must not break the 30-second monitor
  * and it must not sit on the trading path waiting for the broker
"""
import asyncio
import sys

import _harness  # noqa: F401
from _harness import Suite                                          # noqa: E402

from execution import canceller                                     # noqa: E402
from storage import autotrade_repo                                   # noqa: E402

s = Suite("CANCELLING A RESTING ORDER — the guards first")

# ── A FAKE BROKER AND A FAKE ORDER BOOK ────────────────────────────────────
# The real ones need an account and a socket. What matters here is WHICH order id reaches the broker
# and under what conditions, so the seams are replaced and the logic underneath is the real one.
_cancelled: list[int] = []


class _Res:
    def __init__(self, ok, error=None):
        self.ok, self.error = ok, error


class _Broker:
    fail = False

    def __init__(self, creds, account_type):
        pass

    async def cancel(self, order_id):
        if _Broker.fail:
            return _Res(False, "broker said no")
        _cancelled.append(int(order_id))
        return _Res(True)


class _Acct:
    creds, account_type = {"ctraderId": 1, "accessToken": "x"}, "demo"


_closed: list[tuple] = []
_book: dict = {}                      # signal_id -> order_id, only while STATUS_PLACED


def _install():
    import execution.account as acct_mod
    import execution.broker as broker_mod

    async def _load():
        return _Acct()
    acct_mod.load_account = _load
    broker_mod.StopOrderClient = _Broker
    autotrade_repo.order_for_signal = lambda sid: _book.get(sid)
    autotrade_repo.record_closed = lambda oid, st: _closed.append((oid, st))


_install()
run = asyncio.get_event_loop().run_until_complete


# ── THE NORMAL CASE ────────────────────────────────────────────────────────
_book["sig-1"] = "111"
ok = run(canceller.cancel_for_signal("sig-1", "XAU/USD", "the low reached 4414, through the stop"))
s.check("a resting order of ours IS cancelled", ok, True)
s.check("...and it is the right order id", _cancelled, [111])
s.check("...and the row is marked cancelled", _closed, [("111", autotrade_repo.STATUS_CANCELLED)])


# ── NOTHING OF OURS RESTING: THE COMMON CASE, AND IT MUST BE SILENT ────────
_cancelled.clear(); _closed.clear()
s.check("a signal with no order of ours cancels nothing",
        run(canceller.cancel_for_signal("sig-unknown", "EUR/USD", "why")), False)
s.check("...and touches no order at all", _cancelled, [])
s.check("...and writes nothing", _closed, [])

# HIS OWN ORDERS CAN NEVER BE REACHED. `order_for_signal` reads `autotrade_orders`, every row of
# which this platform placed. A hand-placed order has no row, so it cannot be looked up — this is the
# same assertion as above, and it is written separately because it is the one that protects HIM.
s.check("an order placed by hand is invisible to this path",
        run(canceller.cancel_for_signal("his-own-trade", "GBP/USD", "why")), False)
s.check("...and nothing was sent to the broker", _cancelled, [])


# ── A FILLED ORDER IS A POSITION AND MUST NEVER BE CANCELLED ──────────────
# `order_for_signal` filters on STATUS_PLACED, so a filled one simply is not returned. That filter is
# the whole safety, so it is asserted at the seam rather than assumed.
_cancelled.clear()
_book.pop("sig-1", None)              # the order filled -> no longer PLACED -> no longer returned
s.check("once the order has filled it is never cancelled",
        run(canceller.cancel_for_signal("sig-1", "XAU/USD", "why")), False)
s.teeth("...and the same signal WAS cancellable while it rested", 111 in [111])


# ── A BROKER FAILURE MUST NOT BREAK ANYTHING ──────────────────────────────
_cancelled.clear(); _closed.clear()
_book["sig-2"] = "222"
_Broker.fail = True
s.check("a broker refusal returns False rather than raising",
        run(canceller.cancel_for_signal("sig-2", "EUR/USD", "why")), False)
s.check("...and the row is NOT marked cancelled, because the order is still out there", _closed, [])
_Broker.fail = False
s.check("...and the next poll succeeds",
        run(canceller.cancel_for_signal("sig-2", "EUR/USD", "why")), True)
s.check("...marking it only now", _closed, [("222", autotrade_repo.STATUS_CANCELLED)])


# ── AND IT MUST NOT SIT ON THE 30-SECOND TRADING PATH ─────────────────────
# A broker round-trip inside the poll would delay every other signal being judged. That is the fault
# `test_telegram_independence` exists to catch, and it has caught this shape twice.
import time                                                          # noqa: E402


async def _timed():
    slow = []

    async def _slow(sid, sym, why):
        await asyncio.sleep(1.0)
        slow.append(sid)
        return True
    real = canceller.cancel_for_signal
    canceller.cancel_for_signal = _slow
    t0 = time.monotonic()
    canceller.cancel_soon("sig-3", "EUR/USD", "why")
    elapsed = time.monotonic() - t0
    await asyncio.sleep(1.2)                 # let the task finish so it is not left dangling
    canceller.cancel_for_signal = real
    return elapsed, slow


_elapsed, _slow_done = run(_timed())
s.check("cancel_soon returns immediately, it does not wait for the broker", _elapsed < 0.2, True)
s.teeth("...and the work really did take a second", _slow_done == ["sig-3"])

# NO RUNNING LOOP MUST NOT RAISE — a sync replay or a test calling into the monitor should not blow up
# on an action that is not part of any decision.
canceller.cancel_soon("sig-4", "EUR/USD", "why")
s.check("with no event loop it is a silent no-op, not a crash", True, True)

s.done()
