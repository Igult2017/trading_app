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
import sweep_decide  # noqa: E402
both = open(sweep.__file__, encoding="utf-8").read() + open(sweep_decide.__file__, encoding="utf-8").read()
s.check("nothing in the sweep can OPEN a trade (no such action exists)",
        "open_position" in both or "place_pending" in both, False)

# ── PUT BACK A STOP/TARGET CHANGED BY HAND (his decision "A", 23 Nov 2026) ───────────────────────────────────────────
# Master trade 500 (stop 1.2) is copied as follower trade 7. The copier last MOVED the copy to stop 1.1 / target 1.4.
mv = {("A", "500"): (1.1, 1.4)}


def pos(sl=1.1, tp=1.4, **kw):
    p = position(7, "cp-102", sl=sl, **kw)
    if tp:
        p.takeProfit = tp
    return p


def acts_for(p, recorded=mv, flagged=None):
    return [(a[0], a[1], a[2], a[3]) for a in sweep.decide([], [p], {"A": m}, NOW, MONO, recorded, flagged)]


s.check("stop moved by hand (1.1 -> 1.05): the copier's levels are put back", acts_for(pos(sl=1.05)),
        [("restore", 7, 500, "A")])
s.check("target moved by hand (1.4 -> 1.5): put back", acts_for(pos(tp=1.5)), [("restore", 7, 500, "A")])
s.check("target REMOVED by hand: put back", acts_for(pos(tp=None)), [("restore", 7, 500, "A")])
s.check("exactly what the copier set: nothing", acts_for(pos()), [])
s.check("the broker's echo differing by float noise (1e-12): nothing", acts_for(pos(sl=1.1 + 1e-12)), [])
s.check("the record says moved, the listener did not see it, no record: nothing (the OPEN's price is never compared)",
        acts_for(pos(sl=1.05), recorded={}), [])
s.check("no record, but the listener SAW a hand change: put back", acts_for(pos(sl=1.05), recorded={}, flagged={7}),
        [("restore", 7, 500, "A")])
s.check("flagged, but the levels are exactly the copier's (its own late news): nothing",
        acts_for(pos(), flagged={7}), [])
s.check("stop removed by hand: the existing 'stop' repair, not a second action",
        acts_for(pos(sl=0)), [("stop", 7, 500, "A")])
s.check("a hand-changed trade WITHOUT the copy label: never touched",
        [a for a in sweep.decide([], [position(7, "his own trade", sl=1.05)], {"A": m}, NOW, MONO, mv, {7})], [])
s.check("a copy younger than 2 minutes: not judged yet",
        acts_for(pos(sl=1.05, age_s=30), flagged={7}), [])
s.teeth("without the comparison the hand-moved stop would be left alone",
        acts_for(pos(sl=1.05)) == [("restore", 7, 500, "A")])

# At most one restore per trade per 10 minutes — a refused one must not loop every ~2 s.
sweep._restored.clear()
s.check("a first restore is due", sweep.restore_due(9, 7, 1000.0), True)
sweep._restored[(9, 7)] = 1000.0
s.check("a second one 5 s later is NOT", sweep.restore_due(9, 7, 1005.0), False)
s.check("10 minutes later it is due again", sweep.restore_due(9, 7, 1000.0 + sweep.RESTORE_GAP_S), True)
s.check("another trade on the account is not held back", sweep.restore_due(9, 8, 1005.0), True)
sweep._restored.clear()
s.done()
