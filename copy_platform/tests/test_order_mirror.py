"""MIRRORING A RESTING ORDER — the half of copy trading that was never built.

HIS OBSERVATION IS WHAT FOUND IT, 2026-09-21: *"if it was working then it would have copied that
trade which was not filled and later cancelled because it should mirror what is happening in master
exactly."* His XAU/USD order was placed at 12:07 and cancelled at 12:10 without ever filling, and
the follower saw none of it.

THE CAUSE WAS THREE LINES. `_handle_execution` read `event.position` and returned when there was
none — and a RESTING ORDER HAS NO POSITION, so every order event the broker sent was dropped at the
door: accepted, amended, cancelled, expired, rejected.

Four kinds of fact are pinned here:

  * WHAT THE LISTENING END HEARS — each execution type mapped to the right event, and the three
    kinds of order that must NEVER be mirrored (a fill, a stop-loss order, a closing order).
  * WHAT THE ACTING END SENDS — a STOP resting at stopPrice, a LIMIT at limitPrice, a cancel that
    names an order id.
  * WHICH REPLY MEANS SUCCESS — and this is the one that is silent when wrong: ORDER_CANCELLED
    CONFIRMS a cancel and FAILS everything else.
  * THAT A FILL SENDS NOTHING — the follower's own order fills by itself; a market order here
    would open the follower twice.

NOT A TEST OF THE BROKER: nothing here opens a socket. Real protobuf messages, real methods.
"""
import asyncio
import types

from _harness import Suite

import symbol_details
symbol_details.get = lambda acct, sid: types.SimpleNamespace(
    lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12, digits=5)

import executors.ctrader as ex                                          # noqa: E402
import mirror                                                           # noqa: E402
from providers.ctrader import CTraderProvider, OrderSnapshot            # noqa: E402

from ctrader_open_api.messages.OpenApiMessages_pb2 import (             # noqa: E402
    ProtoOAExecutionEvent)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (        # noqa: E402
    ProtoOAExecutionType as T, ProtoOAOrderType)

s = Suite("COPY — a resting order is mirrored as an order")


# ── 1. WHAT THE LISTENING END HEARS ─────────────────────────────────────────────────────────────

def provider():
    p = object.__new__(CTraderProvider)
    p.master_id, p.creds = "test-master", {"ctraderId": "123"}
    p._symbols, p._positions, p._spec_requested = {22: "XAUUSD"}, {}, set()
    p.events = []

    async def on_event(ev, mid):
        p.events.append(ev)
    p.on_event = on_event
    return p


def order_event(et, otype="STOP", closing=False, sl=4367.56):
    e = ProtoOAExecutionEvent()
    e.executionType = et
    o = e.order
    o.orderId = 999
    o.orderType = ProtoOAOrderType.Value(otype)
    o.closingOrder = closing
    o.stopPrice = 4375.05
    if sl:
        o.stopLoss = sl
    o.takeProfit = 4405.0
    o.tradeData.symbolId = 22
    o.tradeData.volume = 1_000_000
    o.tradeData.tradeSide = 1
    return e


def heard(event):
    p = provider()
    asyncio.new_event_loop().run_until_complete(p._handle_order(event))
    return p.events[0]["type"] if p.events else None


print()
print("EVERY EXECUTION TYPE, mapped to what it means to a copier")
s.check("ORDER_ACCEPTED  -> PLACED", heard(order_event(T.ORDER_ACCEPTED)), "PLACED")
s.check("ORDER_REPLACED  -> AMENDED", heard(order_event(T.ORDER_REPLACED)), "AMENDED")
s.check("ORDER_CANCELLED -> CANCELLED", heard(order_event(T.ORDER_CANCELLED)), "CANCELLED")
s.check("ORDER_EXPIRED   -> CANCELLED (the order is off the book either way)",
        heard(order_event(T.ORDER_EXPIRED)), "CANCELLED")
s.check("ORDER_REJECTED  -> CANCELLED", heard(order_event(T.ORDER_REJECTED)), "CANCELLED")

print()
print("WHAT MUST NEVER BE MIRRORED — each of these would place a second entry")
s.check("a FILL — the position path owns it", heard(order_event(T.ORDER_FILLED)), None)
s.check("a stop-loss/take-profit, which is itself an order on this wire",
        heard(order_event(T.ORDER_ACCEPTED, "STOP_LOSS_TAKE_PROFIT")), None)
s.check("the order that CLOSES a position",
        heard(order_event(T.ORDER_ACCEPTED, closing=True)), None)
s.check("a MARKET order — it becomes a position at once, so the position path owns it",
        heard(order_event(T.ORDER_ACCEPTED, "MARKET")), None)

print()
print("AND THE PLACED EVENT CARRIES THE STOP — the reason nothing copied for 19 days")
p = provider()
asyncio.new_event_loop().run_until_complete(p._handle_order(order_event(T.ORDER_ACCEPTED)))
snap = p.events[0]["order"]
s.check("stop", snap.stop_loss, 4367.56)
s.check("target", snap.take_profit, 4405.0)
s.check("where it rests", snap.price, 4375.05)
s.check("size, from the broker's contract spec", snap.volume_lots, 0.1)
s.check("the key is the ORDER id, not a position id", snap.key, "999")
s.check("and `entry_price` is where it WOULD fill, so the risk distance can be measured",
        snap.entry_price, 4375.05)


# ── 2. WHAT THE ACTING END SENDS ────────────────────────────────────────────────────────────────

def executor(cmd):
    x = object.__new__(ex.CTraderExecutor)
    x.creds, x.account_type = {"ctraderId": "1"}, "live"
    x._symbol_map, x._pending_cmd, x._modify_filled = {"XAUUSD": 22}, cmd, False
    x._result = None
    x._resolve = lambda r: setattr(x, "_result", r)
    return x


def built(cmd):
    sent = []
    executor(cmd)._send_command(types.SimpleNamespace(send=sent.append))
    return sent[0] if sent else None

print()
print("THE ORDER IT BUILDS — his 21 Sep XAU/USD stop order, mirrored")
r = built(("place", "XAUUSD", "BUY", 0.1, "STOP", 4375.05, 4367.56, 4405.0, "cp-999"))
s.check("a STOP rests at stopPrice", r.stopPrice, 4375.05)
s.check("...and NOT at limitPrice — the broker would rest it somewhere else", r.limitPrice, 0.0)
s.check("its protection travels with it", (r.stopLoss, r.takeProfit), (4367.56, 4405.0))
s.check("sized through the broker's own spec, not lots*100", r.volume, 1_000_000)
s.check("and labelled, so the position it becomes can be found again", r.label, "cp-999")

r = built(("place", "XAUUSD", "SELL", 0.1, "LIMIT", 4375.05, None, None, ""))
s.check("a LIMIT rests at limitPrice", (r.limitPrice, r.stopPrice), (4375.05, 0.0))
s.check("SELL is side 2", r.tradeSide, 2)

s.check("a cancel names the order id", built(("cancel", 777)).orderId, 777)
r = built(("amend", 777, "STOP", 4380.0, 4370.0, 4410.0))
s.check("an amend moves the order it names", (r.orderId, r.stopPrice), (777, 4380.0))
s.check("...and re-sends BOTH legs, because cTrader's amend CLEARS what it is not given",
        (r.stopLoss, r.takeProfit), (4370.0, 4410.0))


# ── 3. WHICH REPLY MEANS SUCCESS ────────────────────────────────────────────────────────────────

def verdict(cmd, et):
    e = ProtoOAExecutionEvent()
    e.executionType = et
    e.order.orderId = 888
    e.order.stopPrice = 4375.05
    ex.Protobuf.extract = staticmethod(lambda m, _e=e: _e)
    x = executor(cmd)
    x._on_message(None, types.SimpleNamespace(payloadType=ProtoOAExecutionEvent().payloadType))
    return None if x._result is None else (x._result.ok, x._result.external_id)

PLACE = ("place", "XAUUSD", "BUY", 0.1, "STOP", 4375.05, None, None, "")
print()
print("SUCCESS AND FAILURE MUST NOT BE SWAPPED — the same reply means opposite things")
s.check("place  + ORDER_ACCEPTED  -> ok, and the follower's ORDER id comes back",
        verdict(PLACE, T.ORDER_ACCEPTED), (True, "888"))
s.check("place  + ORDER_REJECTED  -> failed", verdict(PLACE, T.ORDER_REJECTED), (False, None))
s.check("place  + ORDER_FILLED    -> no verdict; a resting order is not confirmed by a fill",
        verdict(PLACE, T.ORDER_FILLED), None)
s.check("cancel + ORDER_CANCELLED -> ok. THIS is the one that reads as a failure everywhere else",
        verdict(("cancel", 888), T.ORDER_CANCELLED), (True, "888"))
s.check("open   + ORDER_CANCELLED -> still a failure, unchanged",
        verdict(("open", "XAUUSD", "BUY", 0.1, None, None), T.ORDER_CANCELLED), (False, None))
s.check("amend  + ORDER_REPLACED  -> ok", verdict(("amend", 888, "STOP", 4380.0, None, None),
                                                  T.ORDER_REPLACED), (True, "888"))


# ── 4. FINDING THE POSITION A MIRROR BECAME ─────────────────────────────────────────────────────
print()
print("AFTER IT FILLS — the label is the only thread back to the master's order")


class FakePos:
    def __init__(self, pid, label, price=4375.05):
        self.positionId, self.price = pid, price
        self.tradeData = types.SimpleNamespace(label=label)


res = types.SimpleNamespace(position=[FakePos(11, "cp-111"), FakePos(22, "cp-999")])
found = executor(("find", "cp-999"))._match_label(res, "cp-999")
s.check("the labelled position is found", (found.ok, found.external_id), (True, "22"))
miss = executor(("find", "cp-404"))._match_label(res, "cp-404")
s.check("an unlabelled one is NOT guessed at — a wrong position id closes the wrong trade",
        (miss.ok, miss.external_id), (False, None))
s.check("and the label is derived the same way at both ends", mirror.mirror_label("999"), "cp-999")


# ── TEETH ───────────────────────────────────────────────────────────────────────────────────────
# The defect itself: the door that dropped every order event. A resting order has no position, so
# the old guard returned before anything could read it.
_no_position = ProtoOAExecutionEvent()
_no_position.executionType = T.ORDER_ACCEPTED
s.teeth("a resting order carries no position, which is what the old handler required",
        not _no_position.HasField("position") and heard(order_event(T.ORDER_ACCEPTED)) == "PLACED")

s.done()
