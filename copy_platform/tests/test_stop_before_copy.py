"""A COPY MUST NOT GO OUT BEFORE THE MASTER'S STOP IS KNOWN — and must still go out eventually.

WHAT WENT WRONG, from production on 2026-09-20. His self-copy had never mirrored a single trade in
19 days. The engine saw all five fills — positions 240741293, 241723106, 241869270, 242203419,
242362800 — and skipped every one with:

    "Risk-% mode: can't size — the trade has no stop-loss, or your account balance isn't synced yet"

It was not the balance (both accounts synced, $9,301.72 and $1,000.00). **Every one of the 11 master
events ever recorded carried no stop, and no MODIFY ever arrived.** The fill event does not carry the
protection; the 30-second reconcile does, and the reconcile branch deliberately says nothing for a
position it has not seen ("do NOT emit OPEN — avoids double-copying"). So the stop arrived and was
thrown away, sizing had nothing to work with, and the entry was lost for good.

THE RULE NOW: an OPEN with no stop is HELD, the broker is asked for the position, and the OPEN is
emitted complete. Most of this file asserts the endings that are NOT the happy one — a position that
closes first must copy nothing, and a master who genuinely trades without stops must not be held for
ever.

Real provider methods on a real instance, built without a socket (same approach as
test_provider_resilience.py).
"""
import asyncio

from _harness import Suite
import providers.ctrader as prov
from providers.ctrader import CTraderProvider, PositionSnapshot

s = Suite("COPY — hold the entry until the master's stop is known")

OPEN_ST = prov.ProtoOAPositionStatus.POSITION_STATUS_OPEN
CLOSED_ST = prov.ProtoOAPositionStatus.POSITION_STATUS_CLOSED


def make_provider():
    p = object.__new__(CTraderProvider)
    p.master_id = "test-master"
    p.creds = {"ctraderId": "123", "accessToken": "t"}
    p.account_type = "demo"
    p._positions = {}
    p._awaiting_stop = {}
    p._spec_requested = set()
    p._symbols = {1: "EURUSD"}
    p._authed = p._reconciled = p._reconcile_scheduled = p._connected = False
    p._disconnected_since = None
    p._loop = asyncio.new_event_loop()
    p.client = None
    p.events = []
    async def on_event(ev, mid):
        p.events.append(ev)
    p.on_event = on_event
    return p


def snap(pid=7, stop=None, price=1.14693):
    return PositionSnapshot(position_id=pid, symbol="EURUSD", action="SELL", volume_lots=3.85,
                            entry_price=price, stop_loss=stop, take_profit=None)


class Pos:
    """Only the fields `_handle_execution` reads before `_snap` (which is stubbed)."""
    def __init__(self, pid, status, price=1.14693):
        self.positionId, self.positionStatus, self.price = pid, status, price


class Event:
    def __init__(self, pos):
        self.position = pos

    def HasField(self, _name):
        return True


def fire(p, pid, status, stop=None):
    """Drive the REAL `_handle_execution` with `_snap` stubbed to the snapshot we want to test."""
    p._snap = lambda pos: snap(pos.positionId, stop)
    p._loop.run_until_complete(p._handle_execution(Event(Pos(pid, status))))


def reconcile(p, positions):
    """Drive the REAL reconcile branch. `positions` is a list of (pid, stop)."""
    class Res:
        position = [Pos(pid, OPEN_ST) for pid, _ in positions]
    stops = dict(positions)
    p._snap = lambda pos: snap(pos.positionId, stops[pos.positionId])
    prov.Protobuf = type("P", (), {"extract": staticmethod(lambda m: Res())})

    class Msg:
        payloadType = prov.ProtoOAReconcileRes().payloadType

    async def drive():
        p._dispatch(None, Msg())
        await asyncio.sleep(0)
        await asyncio.sleep(0)
    asyncio.set_event_loop(p._loop)
    p._loop.run_until_complete(drive())


# ── 1. THE FILL THAT STARTED IT: no stop on the event ───────────────────────
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
s.check("a fill with no stop copies NOTHING yet", p.events, [])
s.check("...it is held, waiting for the stop", 7 in p._awaiting_stop, True)
s.check("...and the position is still tracked", 7 in p._positions, True)

# The broker comes back with the position, now carrying its stop. THIS is the fix.
reconcile(p, [(7, 1.14746)])
s.check("once the stop is read, the entry is copied", [e["type"] for e in p.events], ["OPEN"])
s.check("...carrying the master's real stop", p.events[0]["snap"].stop_loss, 1.14746)
s.check("...and nothing is left waiting", p._awaiting_stop, {})

# A second reconcile must not copy it again.
reconcile(p, [(7, 1.14746)])
s.check("a later reconcile does not copy it twice", len(p.events), 1)


# ── 2. THE STOP ARRIVES ON A LIVE EVENT INSTEAD ─────────────────────────────
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
fire(p, 7, OPEN_ST, stop=1.14746)          # the broker attaching protection a moment later
s.check("a stop arriving live releases the entry immediately",
        [e["type"] for e in p.events], ["OPEN"])
s.check("...as an OPEN, not a MODIFY of a position the follower never took",
        p.events[0]["snap"].stop_loss, 1.14746)


# ── 3. IT CLOSED BEFORE WE COULD READ IT (his 16 Sep trade: 1.2 seconds) ────
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
fire(p, 7, CLOSED_ST, stop=None)
# NOTHING AT ALL, not even a CLOSE. The entry was never announced, so the follower is holding
# nothing to exit — and a master CLOSE row with no OPEN beside it is a record that reads like a
# failed copy. That misreading is what made this defect take a day to find.
s.check("a position that closes first copies NOTHING — no entry and no exit", p.events, [])
s.check("...and stops waiting for a stop it will never get", p._awaiting_stop, {})

# BUT THE REAL CASE MUST STILL CLOSE. A position the engine DID copy has to be exited when the
# master exits, or the follower is stranded in a live trade. That is the check that keeps the
# suppression above honest.
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=1.14746)          # copied for real
p.events.clear()
fire(p, 7, CLOSED_ST, stop=1.14746)
s.check("a position that WAS copied is still closed", [e["type"] for e in p.events], ["CLOSE"])

# The same ending by the other route: it simply is not in the reconcile any more.
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
reconcile(p, [])
s.check("gone from the broker's list -> nothing copied", p.events, [])
s.check("...and not held for ever", p._awaiting_stop, {})


# ── 4. A MASTER WHO GENUINELY TRADES WITHOUT STOPS IS NOT HELD FOR EVER ─────
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
for _ in range(CTraderProvider.MAX_STOP_WAITS - 1):
    reconcile(p, [(7, None)])
s.check(f"still waiting after {CTraderProvider.MAX_STOP_WAITS - 1} reads", p.events, [])
reconcile(p, [(7, None)])
s.check("after the last read it is copied anyway", [e["type"] for e in p.events], ["OPEN"])
s.check("...and honestly, with no stop on it", p.events[0]["snap"].stop_loss, None)
s.check("...once, not once per reconcile", len(p.events), 1)
reconcile(p, [(7, None)])
s.check("...confirmed: a further read adds nothing", len(p.events), 1)


# ── 5. THE ORDINARY CASE IS UNTOUCHED ───────────────────────────────────────
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=1.14746)
s.check("a fill that DOES carry its stop copies at once, with no wait",
        [e["type"] for e in p.events], ["OPEN"])
s.check("...and nothing is held", p._awaiting_stop, {})


# ── TEETH ───────────────────────────────────────────────────────────────────
# The old behaviour, reproduced: emit the fill as it arrives. The entry then goes out with no stop,
# which is exactly what `lot_calc` and `risk_guard` refuse — his five lost trades.
p = make_provider()
p._reconciled = True
fire(p, 7, OPEN_ST, stop=None)
held = p.events == []
reconcile(p, [(7, 1.14746)])
s.teeth("without the hold, the entry would have gone out stop-less and been skipped",
        held and p.events[0]["snap"].stop_loss == 1.14746)

s.done()
