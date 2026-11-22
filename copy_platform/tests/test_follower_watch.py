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
s.done()
