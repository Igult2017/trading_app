"""THE REPAIR SWEEP — copies that went their own way are put right, and nothing else is touched (plan step 7).

Real `sweep.decide` on real broker objects (ProtoOAOrder / ProtoOAPosition) against hand-built master views. In words:
  * a copy order whose master order is gone (on a read taken after the copy was placed) is cancelled;
  * a copy trade whose master trade is closed is closed — only if the master listener was running when it opened;
  * a copy trade with no stop gets its master's stop (through the normal stop path);
  * a copy younger than 2 minutes, a trade without the copy label, or a stale master read: left alone;
  * with TWO masters on one account, another master's copy is never closed.
"""
import time
from types import SimpleNamespace

from _harness import Suite
import sweep
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAOrder, ProtoOAPosition

s = Suite("COPY — the repair sweep")
NOW, MONO = time.time(), time.monotonic()


def order(oid, label, age_s=600):
    o = ProtoOAOrder(orderId=oid)
    o.tradeData.label, o.tradeData.openTimestamp = label, int((NOW - age_s) * 1000)
    return o


def position(pid, label, age_s=600, sl=1.1):
    p = ProtoOAPosition(positionId=pid)
    p.tradeData.label, p.tradeData.openTimestamp = label, int((NOW - age_s) * 1000)
    if sl:
        p.stopLoss = sl
    return p


def master(resting=(), positions=None, origin=None, read_ago=5, started_ago=3600):
    return SimpleNamespace(resting=set(resting), read_at=MONO - read_ago, started_at=NOW - started_ago,
                           _positions=positions or {}, origin=origin or {})


snap = SimpleNamespace(stop_loss=1.2)
m = master(resting={101}, positions={500: snap}, origin={500: 102})
acts = sweep.decide([order(9, "cp-101"), order(8, "cp-999")], [position(7, "cp-102"), position(6, "cp-777")],
                    {"A": m}, NOW, MONO)
s.check("a copy order whose master order is gone is cancelled; one still resting is left",
        [a[:2] for a in acts if a[0] == "cancel"], [("cancel", 8)])
s.check("a copy trade whose master trade is closed is closed; the live one is left",
        [a[:2] for a in acts if a[0] == "close"], [("close", 6)])
acts = sweep.decide([], [position(7, "cp-102", sl=0)], {"A": m}, NOW, MONO)
s.check("a copy with no stop gets its master's stop (and is not closed)", [(a[0], a[1], a[2], a[3]) for a in acts],
        [("stop", 7, 500, "A")])
s.check("a copy younger than 2 minutes is never judged",
        sweep.decide([order(8, "cp-999", age_s=30)], [position(6, "cp-777", age_s=30)], {"A": m}, NOW, MONO), [])
s.check("a trade without the copy label is never touched",
        sweep.decide([order(8, "auto-vix1")], [position(6, "his own trade")], {"A": m}, NOW, MONO), [])
s.check("a stale master read: nothing is decided",
        sweep.decide([order(8, "cp-999")], [position(6, "cp-777")], {"A": master(read_ago=600)}, NOW, MONO), [])
s.check("a copy opened BEFORE the master listener started is not closed (its origin cannot be known)",
        sweep.decide([], [position(6, "cp-777", age_s=7200)], {"A": m}, NOW, MONO), [])
b = master(positions={900: snap}, origin={900: 777})
acts = sweep.decide([], [position(6, "cp-777")], {"A": m, "B": b}, NOW, MONO)
s.check("TWO masters on one account: master B's copy is NOT closed because master A does not know it", acts, [])
s.teeth("judging against one master alone would have closed it",
        bool(sweep.decide([], [position(6, "cp-777")], {"A": m}, NOW, MONO)))
# (No "placed after the master's last read" case: a copy is judged only at 2+ minutes old and the master's read must be
# under 90 s old, so such a copy can never be judged — the check in `decide` is a second guard, not a reachable path.)
s.check("nothing in the sweep can OPEN a trade (no such action exists)",
        "open_position" in open(sweep.__file__, encoding="utf-8").read() or
        "place_pending" in open(sweep.__file__, encoding="utf-8").read(), False)
s.done()
