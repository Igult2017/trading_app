"""EVENTS ABOUT ONE MASTER TRADE ARE COPIED IN ORDER — the race found by the 21 Nov 2026 audit.

A follower copy takes seconds to place. Every master event used to start as its own task, so the master's NEXT action
on the same trade could be handled before that placement finished: a move or cancel then found no mirror and was
skipped, and a FILL found no mirror and was entered as a new trade — the follower in twice once the placement landed.

Drives the REAL listener (`CTraderProvider._dispatch` → `_handle_execution`) with real protobuf messages fired 10 ms
apart. Only the follower side is replaced, by a fake that is SLOW to place (0.3 s) and records what a real
dispatcher would conclude: AMENDED/CANCELLED with no mirror = "SKIPPED", OPEN with no mirror = "ENTERED AGAIN".
"""
import asyncio
import types

from _harness import Suite

import symbol_details
symbol_details.get = lambda acct, sid: types.SimpleNamespace(
    lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12, digits=5)

import lanes                                                            # noqa: E402
from providers.ctrader import CTraderProvider                           # noqa: E402
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage   # noqa: E402
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAExecutionEvent  # noqa: E402
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (        # noqa: E402
    ProtoOAExecutionType as T, ProtoOAOrderType, ProtoOAPositionStatus as PS)

s = Suite("COPY — one master trade's events are copied in order")


def provider(use_lanes=True):
    p = object.__new__(CTraderProvider)
    p.master_id, p.creds = "m", {"ctraderId": "123"}
    p._symbols, p._positions, p._spec_requested = {22: "XAUUSD"}, {}, set()
    p._lanes = lanes.Lanes()
    p.out, p.mirror = [], set()

    async def on_event(ev, mid):
        kind = ev["type"]
        key = (ev.get("order") or ev.get("snap")).key if kind != "OPEN" else str(ev.get("master_order_id"))
        if kind == "PLACED":
            await asyncio.sleep(0.3)               # a follower placement takes time
            p.mirror.add(key); p.out.append("PLACED")
        elif kind in ("AMENDED", "CANCELLED"):
            p.out.append(kind if key in p.mirror else f"{kind} SKIPPED")
        elif kind == "OPEN":
            p.out.append("FILL RECORDED" if key in p.mirror else "ENTERED AGAIN")
        else:
            p.out.append(kind)
    p.on_event = on_event
    if not use_lanes:                               # today's behaviour, to prove the test can fail
        p._lanes = types.SimpleNamespace(run=lambda keys, mk: asyncio.ensure_future(mk()))
    return p


def ev(et, position=None):
    e = ProtoOAExecutionEvent()
    e.executionType, e.ctidTraderAccountId = et, 123
    o = e.order
    o.orderStatus = 1
    o.orderId, o.orderType = 999, ProtoOAOrderType.Value("STOP")
    o.stopPrice, o.stopLoss, o.takeProfit = 4375.05, 4367.56, 4405.0
    o.tradeData.symbolId, o.tradeData.volume, o.tradeData.tradeSide = 22, 1_000_000, 1
    if position is not None:
        ps = e.position
        ps.positionId, ps.positionStatus, ps.swap = 555, position, 0
        ps.price, ps.stopLoss, ps.takeProfit = 4375.05, 4367.56, 4405.0
        ps.tradeData.symbolId, ps.tradeData.volume, ps.tradeData.tradeSide = 22, 1_000_000, 1
    m = ProtoMessage()
    m.payloadType, m.payload = e.payloadType, e.SerializeToString()
    return m


def run(p, msgs):
    async def go():
        for m in msgs:
            p._dispatch(None, m)
            await asyncio.sleep(0.01)
        await asyncio.sleep(1.0)
    asyncio.new_event_loop().run_until_complete(go())
    return p.out


seq = [ev(T.ORDER_ACCEPTED), ev(T.ORDER_REPLACED), ev(T.ORDER_FILLED, PS.POSITION_STATUS_OPEN),
       ev(T.ORDER_FILLED, PS.POSITION_STATUS_CLOSED)]
got = run(provider(), seq)
s.check("placed, moved, filled, closed — 10 ms apart — copied once each, in order",
        got, ["PLACED", "AMENDED", "FILL RECORDED", "CLOSE"])
s.check("the follower is never entered a second time", "ENTERED AGAIN" in got, False)
old = run(provider(use_lanes=False), seq)
s.teeth("without the lanes the move is skipped and the fill enters again",
        "ENTERED AGAIN" in old and "AMENDED SKIPPED" in old)

got = run(provider(), [ev(T.ORDER_ACCEPTED), ev(T.ORDER_CANCELLED)])
s.check("a cancel right after placing cancels the mirror (no orphan order)", got, ["PLACED", "CANCELLED"])


async def _two_trades():
    lane = lanes.Lanes()
    done = []

    async def slow():
        await asyncio.sleep(0.3); done.append("A")

    async def fast():
        done.append("B")
    lane.run(["order:1"], slow)
    lane.run(["order:2"], fast)
    await asyncio.sleep(0.5)
    return done
s.check("a DIFFERENT trade is not held up by a slow one", asyncio.new_event_loop().run_until_complete(_two_trades()),
        ["B", "A"])


async def _after_failure():
    lane = lanes.Lanes()
    done = []

    async def boom():
        raise RuntimeError("broker down")

    async def nxt():
        done.append("next ran")
    lane.run(["order:1"], boom)
    lane.run(["order:1"], nxt)
    await asyncio.sleep(0.1)
    return done, lane.busy()
s.check("a failed event does not block the next one about the same trade, and nothing is left held",
        asyncio.new_event_loop().run_until_complete(_after_failure()), (["next ran"], 0))

s.done()
