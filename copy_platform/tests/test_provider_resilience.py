"""ONE BAD MESSAGE MUST NOT KILL THE BROKER CONNECTION — and a read failure is not a close.

Found 2026-09-02 by reading production logs. `providers/ctrader.py:_want_spec` said `self._client`
where the attribute is `self.client` (it is `self.client` at __init__ and at every other use in the
file). So every time a master position was read it raised
`AttributeError: 'CTraderProvider' object has no attribute '_client'`.

MEASURED OVER 6.8 HOURS OF PRODUCTION:

    64   AttributeError: ... has no attribute '_client'
    56   connection dropped and reconnected  (one every ~7 minutes)
    147  Twisted timeout tracebacks these produced

THE TYPO IS THE TRIGGER. THE CAUSE IS THAT NOTHING CAUGHT IT. `_on_message` had no try/except, so
the exception escaped into Twisted, which reads that as a failed connection and tears the session
down. The provider then reconnects, re-authenticates, reads the same position, and raises again.
That is how one wrong word became an outage — and why 147 tracebacks looked like dozens of separate
faults instead of one.

The rule already exists in this codebase, in `signal_platform/data/fix_book.absorb`: *"A bar builder
must never be able to kill the price stream that feeds it."* Same principle: the transport must
outlive a fault in anything reading from it.

AND A SECOND, WORSE ONE FOUND WHILE FIXING IT. If `_snap` raises for a position, that position is
simply missing from the reconcile's `fresh` map — and the diff reads "missing" as *"closed on the
master"* and emits a synthetic CLOSE. So a failure to READ the master's position would have closed
the FOLLOWER's real position. The previous snapshot is now carried forward instead: an unreadable
position is treated as unchanged, which is the safe direction.

These run the REAL methods on a real instance, built without a socket.
"""
import asyncio

from _harness import Suite
import providers.ctrader as prov
from providers.ctrader import CTraderProvider, PositionSnapshot

s = Suite("PROVIDER RESILIENCE — a fault must not take the connection down")


def make_provider() -> CTraderProvider:
    """A real provider with no socket — __init__ would open one, so its fields are set directly."""
    p = object.__new__(CTraderProvider)
    p.master_id = "test-master"
    p.creds = {"ctraderId": "123", "accessToken": "t"}
    p.account_type = "demo"
    p.on_event = lambda *a, **k: None
    p._positions = {}
    p._spec_requested = set()
    p._symbols = {1: "EURUSD"}
    p._authed = p._reconciled = p._reconcile_scheduled = p._connected = False
    p._disconnected_since = None
    p._loop = asyncio.new_event_loop()
    p.client = None
    return p


# ── THE TYPO ITSELF ────────────────────────────────────────────────────────
# `_want_spec` returns early on a None client. With the wrong attribute name it raised instead, and
# `client = None` is exactly the state that proves which name is being read.
p = make_provider()
raised = None
try:
    p._want_spec(1)
except Exception as exc:
    raised = f"{type(exc).__name__}: {exc}"
s.check("_want_spec no longer raises AttributeError", raised, None)
s.check("...and it read `client`, not `_client`", hasattr(p, "_client"), False)

src = open(prov.__file__, encoding="utf-8").read()
code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
s.check("no `self._client` remains in executable code",
        "self._client" in code.replace('`self._client`', ''), False)


# ── THE GUARD: a raising handler must NOT drop the connection ──────────────
# `_on_message` is what Twisted calls. It now delegates to `_dispatch` inside a try/except, so an
# exception is logged and the session survives. Before, it escaped and killed the connection.
p = make_provider()

class Boom:
    @property
    def payloadType(self):
        raise RuntimeError("exploding message")

escaped = None
try:
    p._on_message(None, Boom())
except Exception as exc:
    escaped = f"{type(exc).__name__}: {exc}"
s.check("a message that explodes does NOT escape to Twisted", escaped, None)

# The same, through the real path that was actually failing: a message type that reaches _snap.
p2 = make_provider()
p2._dispatch = lambda c, m: (_ for _ in ()).throw(AttributeError("no attribute '_client'"))
escaped2 = None
try:
    p2._on_message(None, object())
except Exception as exc:
    escaped2 = f"{type(exc).__name__}: {exc}"
s.check("the exact production fault would now be contained", escaped2, None)

# AND IT MUST NOT BE A SILENCER. `_dispatch` still raises for anything that calls it directly, so
# the fault is real and logged — only the transport is protected.
p3 = make_provider()
direct = None
try:
    p3._dispatch(None, Boom())
except Exception as exc:
    direct = type(exc).__name__
s.check("the fault is NOT swallowed — _dispatch still raises", direct, "RuntimeError")


# ── A READ FAILURE IS NOT A CLOSE ──────────────────────────────────────────
# The dangerous one. A position we cannot parse must be held as unchanged, never reported closed.
class FakePos:
    def __init__(self, pid): self.positionId = pid

def snapshot(pid, price=1.1):
    return PositionSnapshot(position_id=pid, symbol="EURUSD", action="BUY",
                            volume_lots=0.1, entry_price=price, stop_loss=None, take_profit=None)

closes: list = []

def run_reconcile(provider, positions, snap_impl):
    """Drive the real reconcile branch with a stubbed _snap.

    RUN INSIDE THE LOOP, because the CLOSE is emitted with `asyncio.ensure_future` — outside a
    running loop nothing is ever scheduled and a real close looks identical to a suppressed one,
    which would make the most important check here pass for the wrong reason.
    """
    provider._snap = snap_impl
    class Res:
        position = positions
    prov.Protobuf = type("P", (), {"extract": staticmethod(lambda m: Res())})
    class Msg:
        payloadType = prov.ProtoOAReconcileRes().payloadType

    async def drive():
        provider._dispatch(None, Msg())
        await asyncio.sleep(0)        # let any ensure_future'd CLOSE actually run
        await asyncio.sleep(0)
    asyncio.set_event_loop(provider._loop)
    provider._loop.run_until_complete(drive())

# A provider that already knows position 7, and now cannot read it.
p = make_provider()
p._reconciled = True
p._positions = {7: snapshot(7)}
p.on_event = lambda ev, mid: closes.append(ev["type"])

def boom_snap(pos):
    raise ValueError("cannot read this position")

run_reconcile(p, [FakePos(7)], boom_snap)
s.check("an unreadable position does NOT emit a CLOSE", closes, [])
s.check("...and is still tracked, not dropped", 7 in p._positions, True)
s.check("...holding its previous entry price", p._positions[7].entry_price, 1.1)

# A position that GENUINELY vanished must still close — the guard must not blind the real case.
closes.clear()
p = make_provider()
p._reconciled = True
p._positions = {7: snapshot(7)}
fired: list = []
async def capture(ev, mid): fired.append(ev["type"])
p.on_event = capture
run_reconcile(p, [], lambda pos: snapshot(pos.positionId))
s.check("a position that really vanished IS closed", fired, ["CLOSE"])
s.check("...and is removed from tracking", 7 in p._positions, False)

# One bad position must not cost the good ones in the same batch.
p = make_provider()
p._reconciled = True
p._positions = {7: snapshot(7), 8: snapshot(8, 2.2)}
p.on_event = lambda ev, mid: closes.append(ev["type"])
closes.clear()
def one_bad(pos):
    if pos.positionId == 7:
        raise ValueError("unreadable")
    return snapshot(pos.positionId, 2.2)
run_reconcile(p, [FakePos(7), FakePos(8)], one_bad)
s.check("one unreadable position does not close the others", closes, [])
s.check("...both stay tracked", sorted(p._positions), [7, 8])


# ── TEETH ──────────────────────────────────────────────────────────────────
# Prove the guard is what contains the fault, by running the SAME message through the unguarded
# path. If this did not raise, the checks above would be passing for some other reason.
unguarded = None
try:
    make_provider()._dispatch(None, Boom())
except Exception as exc:
    unguarded = type(exc).__name__
s.teeth("the unguarded path really does raise on that message", unguarded == "RuntimeError")
s.teeth("...while the guarded one did not", escaped is None)
s.teeth("the real-close path can still fire", fired == ["CLOSE"])

s.done()
