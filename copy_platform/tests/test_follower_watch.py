"""LISTENING TO FOLLOWER ACCOUNTS — a copy that goes its own way is recorded (plan step 5, 21 Nov 2026).

Real protobuf events through the real `follower_watch.describe` and `watch`: a copy closed on the follower's side or
refused by the broker is written as DRIFT; the follower's own (non-copy) trades and the copier's own commands are not.
"""
import asyncio

from _harness import Suite
import follower_watch as W
import dispatcher
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAExecutionEvent
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAExecutionType as T, ProtoOAPositionStatus as PS

s = Suite("COPY — follower accounts are listened to: drift is recorded")


def ev(et, label="cp-123", closed=False):
    e = ProtoOAExecutionEvent(ctidTraderAccountId=9, executionType=et)
    o = e.order
    o.orderId, o.orderType, o.orderStatus = 5, 3, 1
    o.tradeData.symbolId, o.tradeData.volume, o.tradeData.tradeSide, o.tradeData.label = 1, 100, 1, label
    if closed:
        p = e.position
        p.positionId, p.positionStatus, p.swap = 7, PS.POSITION_STATUS_CLOSED, 0
        p.tradeData.symbolId, p.tradeData.volume, p.tradeData.tradeSide, p.tradeData.label = 1, 100, 1, label
    return e


s.check("a copy closed on the follower's side is drift", "CLOSED" in (W.describe(ev(T.ORDER_FILLED, closed=True)) or ""),
        True)
s.check("a copy order the broker rejected is drift", "REJECTED" in (W.describe(ev(T.ORDER_REJECTED)) or ""), True)
s.check("the follower's OWN trade (no copy label) is not ours to report", W.describe(ev(T.ORDER_FILLED, "", True)), None)
s.check("a copy simply accepted is not drift", W.describe(ev(T.ORDER_ACCEPTED)), None)

logged = []
dispatcher._log = lambda fid, tid, lvl, evn, msg: logged.append((fid, evn))


class Conn:
    def listen(self, acct, fn):
        self.fn = fn
        return lambda: None


class Pool:
    def __init__(self):
        self.lock = asyncio.Lock()

    def account_lock(self, acct):
        return self.lock


async def go():
    c, p = Conn(), Pool()
    W._watching.clear()
    W.watch(c, p, 9, ["f-1"])
    e = ev(T.ORDER_FILLED, closed=True)
    m = ProtoMessage(payloadType=e.payloadType, payload=e.SerializeToString())
    c.fn(None, m)
    first = list(logged)
    async with p.lock:                     # the copier itself is closing it
        c.fn(None, m)
    return first, list(logged)


import sweep  # noqa: E402
asked: list = []
sweep.request_check = lambda acct: asked.append(acct)
first, after = asyncio.new_event_loop().run_until_complete(go())
s.check("the drift is written for the follower on that account", first, [("f-1", "DRIFT")])
s.check("the copier's OWN close (account busy with its command) is not reported as drift", after, first)
# ── AND THE ACCOUNT IS CHECKED, NOT ONLY WRITTEN DOWN (22 Nov 2026, plan step 4) ────────────────────────────────────
s.check("drift asks for a check of THAT account (9) — once, not for the copier's own close", asked, [9])

# The requested check runs over ONLY the accounts asked for, once, after the settle time.
import importlib  # noqa: E402
sweep = importlib.reload(sweep)
ran: list = []


async def fake_pass(engine, only):
    ran.append(only)
sweep._pass, sweep.SETTLE_S = fake_pass, 0.01


async def requested():
    task = asyncio.ensure_future(sweep.run_requested(None))
    sweep.request_check(9)
    sweep.request_check(9)
    sweep.request_check(12)
    sweep.request_check(5, live_only=True)        # logged back in: checked only if it holds a live copy
    sweep.request_check(12, live_only=True)       # ...but a FORCED request for the same account still wins
    await asyncio.sleep(0.1)
    task.cancel()
asyncio.new_event_loop().run_until_complete(requested())
s.check("a burst of requests becomes ONE check, of exactly the accounts asked for — forced, or only if live",
        ran, [{9: True, 12: True, 5: False}])

# ── A STOP/TARGET CHANGED BY HAND IS NOTICED (his decision "A", 23 Nov 2026) ─────────────────────────────────────────
import time  # noqa: E402
NOW = time.time()


def amend(label="cp-123", age_s=600, status=PS.POSITION_STATUS_OPEN, et=T.ORDER_REPLACED):
    e = ev(et, label)
    p = e.position
    p.positionId, p.positionStatus, p.swap = 7, status, 0
    p.tradeData.symbolId, p.tradeData.volume, p.tradeData.tradeSide, p.tradeData.label = 1, 100, 1, label
    p.tradeData.openTimestamp = int((NOW - age_s) * 1000)
    p.stopLoss = 1.05
    return e


s.check("a stop changed on an open copy (REPLACED) is a hand change of trade 7", W.hand_amend(amend(), NOW), 7)
s.check("the broker setting the opening stop (copy 10 s old) is NOT", W.hand_amend(amend(age_s=10), NOW), None)
s.check("the follower's own trade (no copy label) is NOT ours", W.hand_amend(amend(label="mine"), NOW), None)
s.check("a closed copy is NOT (that is the close drift)", W.hand_amend(amend(status=PS.POSITION_STATUS_CLOSED), NOW), None)
s.check("a fill is NOT a stop change", W.hand_amend(amend(et=T.ORDER_FILLED), NOW), None)

marked: list = []
import sweep_decide  # noqa: E402
real_note = sweep_decide.note_hand_change
sweep.note_hand_change = lambda acct, pid: marked.append((acct, pid))
asked.clear()
logged.clear()


async def hand():
    c, p = Conn(), Pool()
    W._watching.clear()
    W.watch(c, p, 9, ["f-1"])
    e = amend()
    msg = ProtoMessage(payloadType=e.payloadType, payload=e.SerializeToString())
    async with p.lock:                     # the copier's own stop move: never a hand change
        c.fn(None, msg)
    inside = list(marked)
    c.fn(None, msg)                         # nobody from the copier working on the account: a hand change
    return inside
import sys  # noqa: E402
sys.modules["sweep"].request_check = lambda acct, live_only=False: asked.append(acct)
inside = asyncio.new_event_loop().run_until_complete(hand())
s.check("the copier's OWN stop move (account lock held) is not marked", inside, [])
s.check("a stop changed while the copier was not working on the account is marked for trade 7 on account 9",
        marked, [(9, 7)])
s.check("…written to the Activity log for that follower, and a check of account 9 asked for",
        (logged, asked), ([("f-1", "DRIFT")], [9]))
sweep.note_hand_change = real_note
s.done()
