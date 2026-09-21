"""A COPY MUST NOT GO OUT WITHOUT THE MASTER'S STOP — and now it never has to wait for one.

WHAT WENT WRONG, from production on 2026-09-20. His self-copy had never mirrored a single trade in
19 days. The engine saw all five fills — positions 240741293, 241723106, 241869270, 242203419,
242362800 — and skipped every one with:

    "Risk-% mode: can't size — the trade has no stop-loss, or your account balance isn't synced yet"

It was not the balance (both accounts synced, $9,301.72 and $1,000.00). **Every one of the 11 master
events ever recorded carried no stop.** Risk-% sizing has no distance to size by without one and the
per-trade cap has no risk to measure, so every copy was refused.

THE FIRST FIX WAS AIMED AT THE WRONG LAYER, and this file records that so it is not rebuilt. It held
the entry back, asked the broker for the position again, and waited up to three reconciles for the
stop to appear on it. It was chasing a number the engine already had in its hand.

THE ROOT CAUSE, found 2026-09-21: **at the moment of a fill the stop is on the ORDER, not on the
position** — and the order is on the very same message. `_handle_execution` read `event.position`
and ignored `event.order`, so the number was thrown away and then hunted for. Reading it is one
line, it is instant, and there is nothing left to hold.

WHAT THIS FILE PINS: that the stop is read from the order, that the POSITION still wins when it has
one of its own (a stop the master has since moved), and that nothing is ever invented.

Real provider methods, real protobuf messages, no socket.
"""
import asyncio
import types

from _harness import Suite

import symbol_details
# A forex contract spec, so `lots_from_volume` can read a size. Stubbed before the provider is
# imported: without a spec every snapshot reads 0 lots and the checks below would prove nothing.
symbol_details.get = lambda acct, sid: types.SimpleNamespace(
    lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12, digits=5)

import providers.ctrader as prov                                        # noqa: E402
from providers.ctrader import CTraderProvider                           # noqa: E402

from ctrader_open_api.messages.OpenApiMessages_pb2 import (             # noqa: E402
    ProtoOAExecutionEvent)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (        # noqa: E402
    ProtoOAExecutionType as T, ProtoOAOrderType, ProtoOAPositionStatus)

s = Suite("COPY — the master's stop, read from the order it arrives on")

OPEN_ST, CLOSED_ST = (ProtoOAPositionStatus.POSITION_STATUS_OPEN,
                      ProtoOAPositionStatus.POSITION_STATUS_CLOSED)


def make_provider():
    p = object.__new__(CTraderProvider)
    p.master_id = "test-master"
    p.creds = {"ctraderId": "123", "accessToken": "t"}
    p.account_type = "demo"
    p._positions = {}
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


def fill(pos_sl=0.0, order_sl=1.14746, status=OPEN_ST, pid=7, with_order=True):
    """A real ORDER_FILLED message: a position, and the order that became it."""
    e = ProtoOAExecutionEvent()
    e.executionType = T.ORDER_FILLED
    if with_order:
        o = e.order
        o.orderId = 999
        o.orderType = ProtoOAOrderType.Value("STOP")
        o.stopPrice = 1.14693
        if order_sl:
            o.stopLoss = order_sl
        o.tradeData.symbolId = 1
        o.tradeData.volume = 1_000_000
        o.tradeData.tradeSide = 2
    p = e.position
    p.positionId = pid
    p.positionStatus = status
    p.price = 1.14693
    if pos_sl:
        p.stopLoss = pos_sl
    p.tradeData.symbolId = 1
    p.tradeData.volume = 1_000_000
    p.tradeData.tradeSide = 2
    return e


def fire(p, event):
    p._loop.run_until_complete(p._handle_execution(event))


# ── 1. THE FILL THAT STARTED IT: no stop on the POSITION, but one on the ORDER ──────────────────
p = make_provider()
p._reconciled = True
fire(p, fill())
s.check("the entry copies IMMEDIATELY — nothing is held", [e["type"] for e in p.events], ["OPEN"])
s.check("...carrying the master's real stop, read off the order",
        p.events[0]["snap"].stop_loss, 1.14746)
s.check("...and the master's order id travels with it, so a mirrored order is recognised",
        p.events[0]["master_order_id"], 999)
s.check("...sized from the contract spec, not guessed", p.events[0]["snap"].volume_lots, 0.1)


# ── 2. THE POSITION'S OWN STOP WINS — a stop the master has MOVED ───────────────────────────────
# The order keeps the price it was placed with for ever. Once the trade is live and the stop is
# moved (VIX.1 moves it to breakeven at 0.4R) the truth is on the position, and taking the order's
# stale number would copy a stop the master no longer has.
p = make_provider()
p._reconciled = True
fire(p, fill(pos_sl=1.14800, order_sl=1.14746))
s.check("a moved stop is not overwritten by the order's original",
        p.events[0]["snap"].stop_loss, 1.14800)


# ── 3. NEITHER CARRIES ONE — no number is invented ──────────────────────────────────────────────
p = make_provider()
p._reconciled = True
fire(p, fill(order_sl=0.0))
s.check("no stop anywhere -> None, honestly", p.events[0]["snap"].stop_loss, None)
p = make_provider()
p._reconciled = True
fire(p, fill(with_order=False))
s.check("...and a message with no order at all does not crash", p.events[0]["snap"].stop_loss, None)


# ── 4. THE EXIT IS UNTOUCHED ────────────────────────────────────────────────────────────────────
# Every ending above is an entry. A follower that was copied in must still be copied out, or it is
# stranded in a live trade — the one failure worse than never copying at all.
p = make_provider()
p._reconciled = True
fire(p, fill())
p.events.clear()
fire(p, fill(status=CLOSED_ST))
s.check("a position that was copied is still closed", [e["type"] for e in p.events], ["CLOSE"])


# ── 5. A FILL IS NOT ANNOUNCED TWICE ────────────────────────────────────────────────────────────
# The order path and the position path both see this message. If both spoke, the follower would be
# opened once by the order mirror and again by the fill.
p = make_provider()
p._reconciled = True
fire(p, fill())
s.check("one message, one event — the order path stays silent on a fill", len(p.events), 1)


# ── TEETH ───────────────────────────────────────────────────────────────────────────────────────
# The defect itself, reproduced: read the position alone and the stop is gone. That is the exact
# state all 11 recorded master events were in, and why not one trade was ever copied.
_pos_only = prov._protection(fill().position, None, "stopLoss")
s.teeth("reading the position alone loses the stop — the 19-day defect",
        _pos_only is None and prov._protection(fill().position, fill().order, "stopLoss") == 1.14746)

s.done()
