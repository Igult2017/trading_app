"""A MISSED ENTRY MUST BE RECOVERED — the reconcile has to emit OPEN, not just CLOSE.

HIS REPORT, 2026-10-19: *"Copy trading platform not working at all. I placed one trade and set copy
and it was never copied. Copy trading log is also not working."*

THE LOG WAS NOT BROKEN. IT HAD NOTHING TO REPORT. Traced through production:

    18 Oct 21:05:50  journal sync, his master's account
        recorded      EURUSD  Short 1.5 lots
        live-latency  EURUSD  live feed -> database in 43ms
        missed-close          "1 position(s) closed at the broker with no trade
                               recorded — the live feed missed them; fetching now"

    copy engine, same account:  newest master trade = 12 Oct.  SIX DAYS EARLIER.

The journal saw his trade in 43 milliseconds. The copy engine recorded nothing, because the 30s
safety reconcile emitted a synthetic CLOSE for a position that vanished but deliberately stayed
SILENT about one that appeared — its comment said *"the live execution event already handles opens;
avoids double-copying"*. That assumption holds only while no event is ever dropped, and the
journal's own log proves they are dropped.

With no OPEN dispatched there is no master trade row, so no follower is ever evaluated and NO LOG
LINE IS WRITTEN AT ALL — which is exactly why the log looked dead.

It had a second tail: the position was adopted silently, so when it later closed the diff emitted a
CLOSE for something the follower had never opened. That is the
*"No open follower position for master pos 242751204"* skip already in his log from September.

These drive the REAL `_dispatch` reconcile branch on a real provider instance, built without a
socket — the same approach as `test_provider_resilience.py`.
"""
import asyncio

from _harness import Suite
import providers.ctrader as prov
from providers.ctrader import CTraderProvider, PositionSnapshot

s = Suite("RECONCILE — a missed OPEN is recovered, and the initial load stays silent")


def make_provider() -> CTraderProvider:
    """A real provider with no socket — __init__ would open one, so its fields are set directly."""
    p = object.__new__(CTraderProvider)
    p.master_id = "test-master"
    p.creds = {"ctraderId": "123", "accessToken": "t"}
    p.account_type = "demo"
    p.on_event = lambda *a, **k: None
    p._positions = {}
    p._awaiting_stop = {}
    p._spec_requested = set()
    p._symbols = {1: "EURUSD"}
    p._authed = p._reconciled = p._reconcile_scheduled = p._connected = False
    p._disconnected_since = None
    p._loop = asyncio.new_event_loop()
    p.client = None
    return p


class FakePos:
    def __init__(self, pid): self.positionId = pid


def snapshot(pid, price=1.1, symbol="EURUSD", action="BUY"):
    return PositionSnapshot(position_id=pid, symbol=symbol, action=action,
                            volume_lots=0.1, entry_price=price, stop_loss=None, take_profit=None)


def run_reconcile(provider, positions):
    """Drive the real reconcile branch.

    RUN INSIDE THE LOOP, because events are emitted with `asyncio.ensure_future` — outside a running
    loop nothing is ever scheduled, and a real emission would look identical to a suppressed one.
    That would make the most important check here pass for the wrong reason.
    """
    provider._snap = lambda pos: snapshot(pos.positionId)
    class Res:
        position = positions
    prov.Protobuf = type("P", (), {"extract": staticmethod(lambda m: Res())})
    class Msg:
        payloadType = prov.ProtoOAReconcileRes().payloadType

    async def drive():
        provider._dispatch(None, Msg())
        await asyncio.sleep(0)
        await asyncio.sleep(0)
    asyncio.set_event_loop(provider._loop)
    provider._loop.run_until_complete(drive())


def capturing(bucket):
    async def capture(ev, mid):
        bucket.append((ev["type"], ev["snap"].position_id))
    return capture


# ── 1. THE BUG ITSELF: a position that appeared must be recovered ──────────
seen: list = []
p = make_provider()
p._reconciled = True                 # past the initial load — this is the periodic safety pass
p._positions = {}                    # the live event for position 42 was MISSED
p.on_event = capturing(seen)
run_reconcile(p, [FakePos(42)])
s.check("a position the live event missed IS recovered as an OPEN", seen, [("OPEN", 42)])
s.check("...and is now tracked", 42 in p._positions, True)


# ── 2. THE REGRESSION GUARD: a vanished position still closes ──────────────
seen2: list = []
p = make_provider()
p._reconciled = True
p._positions = {7: snapshot(7)}
p.on_event = capturing(seen2)
run_reconcile(p, [])
s.check("a position that vanished still emits CLOSE", seen2, [("CLOSE", 7)])
s.check("...and is removed from tracking", 7 in p._positions, False)


# ── 3. NO DUPLICATE: a position already known emits nothing ────────────────
# This is the half the old comment was worried about. It is handled here by tracking, and again
# underneath by `dispatcher.dispatch`, which counts OPEN rows against CLOSE rows for the same
# master and position id and refuses a second OPEN while one is open (dispatcher.py:127-135).
seen3: list = []
p = make_provider()
p._reconciled = True
p._positions = {9: snapshot(9)}
p.on_event = capturing(seen3)
run_reconcile(p, [FakePos(9)])
s.check("a position already known emits NOTHING", seen3, [])


# ── 4. ⚠ THE INITIAL LOAD MUST STAY SILENT ─────────────────────────────────
# The regression that would be far worse than the bug being fixed: emitting OPENs on the first
# reconcile after auth would copy every position already open on the master, on EVERY restart of
# the engine. The `if not self._reconciled` branch records without diffing, and must keep doing so.
seen4: list = []
p = make_provider()
p._reconciled = False                # cold start, straight after authentication
p._positions = {}
p.on_event = capturing(seen4)
run_reconcile(p, [FakePos(1), FakePos(2), FakePos(3)])
s.check("the INITIAL load emits nothing, however many positions exist", seen4, [])
s.check("...but it does record all of them", sorted(p._positions), [1, 2, 3])
s.check("...and marks itself reconciled", p._reconciled, True)


# ── 5. BOTH DIRECTIONS IN ONE PASS ─────────────────────────────────────────
seen5: list = []
p = make_provider()
p._reconciled = True
p._positions = {11: snapshot(11)}    # 11 is open and about to vanish; 12 appears unseen
p.on_event = capturing(seen5)
run_reconcile(p, [FakePos(12)])
s.check("one pass closes the gone one and opens the new one",
        sorted(seen5), [("CLOSE", 11), ("OPEN", 12)])


# ── TEETH ──────────────────────────────────────────────────────────────────
# Prove these can fail. If the recovery were still silent, check 1 would read [] — so assert that
# the empty result is genuinely distinguishable from the passing one.
s.teeth("the recovery check would fail if OPEN were still silent", seen == [("OPEN", 42)] and seen3 == [])
s.teeth("the initial-load check can tell silence from emission", seen4 == [] and seen2 == [("CLOSE", 7)])

s.done()
