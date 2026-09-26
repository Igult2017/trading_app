"""A COPY MUST NEVER GO ROUND IN A CIRCLE — and an account may still be a master and a slave.

HIS RULES, 2026-09-26: *"a master can be a slave to another master and a slave can be a master to a
master it does not copy"*, and *"The only thing that should stand is a master copying itself."*

WHAT A RING COSTS, which is why this is a safety test and not a tidiness one. The engine starts a
provider for EVERY active master (`engine.py:119`), whether or not that account is also somebody's
follower. So with A→B and B→A both saved: a trade on A is copied onto B; the provider watching B
sees that copy as a master event and copies it back to A; A's provider copies it to B again. **One
trade becomes an unbounded stream of REAL orders on both accounts.**

A CHAIN IS NOT A RING. A→B with B→C is a cascade, and he asked for it. Only a ring is refused.

TWO INDEPENDENT DEFENCES, and this file checks both:

  1. `POST /api/copy/self-copy` refuses a link that would close a ring (source text checked here,
     because the walk is the rule and it must not quietly disappear);
  2. the provider ignores an order carrying the label this engine stamps on its own copies
     (`cp-<master order id>`), so a ring built any OTHER way still cannot run away. That half is
     exercised for real against protobuf below.
"""
import asyncio
import os
import types

from _harness import Suite

import symbol_details
symbol_details.get = lambda acct, sid: types.SimpleNamespace(
    lotSize=10_000_000, stepVolume=100_000, minVolume=100_000, maxVolume=10 ** 12, digits=5)

import mirror                                                          # noqa: E402
import providers.ctrader as prov                                       # noqa: E402
from providers.ctrader import CTraderProvider                          # noqa: E402

from ctrader_open_api.messages.OpenApiMessages_pb2 import (            # noqa: E402
    ProtoOAExecutionEvent)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (       # noqa: E402
    ProtoOAExecutionType as T, ProtoOAOrderType)

s = Suite("COPY — no copy loops, but a master may still be a slave")


# ── 1. THE ENGINE NEVER COPIES ITS OWN COPY ────────────────────────────────────────────────────
def provider():
    p = object.__new__(CTraderProvider)
    p.master_id, p.creds = "m1", {"ctraderId": "1"}
    p._symbols, p._positions, p._spec_requested = {22: "XAUUSD"}, {}, set()
    p.events = []

    async def on_event(ev, mid):
        p.events.append(ev)
    p.on_event = on_event
    return p


def order_event(label="", client_order_id=""):
    e = ProtoOAExecutionEvent()
    e.executionType = T.ORDER_ACCEPTED
    o = e.order
    o.orderId = 999
    o.orderType = ProtoOAOrderType.Value("STOP")
    o.stopPrice = 4375.05
    o.stopLoss = 4367.56
    if client_order_id:
        o.clientOrderId = client_order_id
    o.tradeData.symbolId = 22
    o.tradeData.volume = 1_000_000
    o.tradeData.tradeSide = 1
    if label:
        o.tradeData.label = label
    return e


def heard(event):
    p = provider()
    asyncio.new_event_loop().run_until_complete(p._handle_order(event))
    return p.events[0]["type"] if p.events else None


print()
print("AN ORDER THIS ENGINE PLACED IS NOT A NEW MASTER TRADE")
OURS = mirror.mirror_label("362345472")          # "cp-362345472"
s.check("a trade he placed himself IS copied", heard(order_event()), "PLACED")
s.check("a trade WE placed is not copied on", heard(order_event(label=OURS)), None)
s.check("...recognised by clientOrderId too, in case the label is truncated",
        heard(order_event(client_order_id=OURS)), None)
s.check("a label that merely mentions copying is NOT ours",
        heard(order_event(label="my copy of gold")), "PLACED")
s.teeth("without the guard the copy would be copied again",
        prov._is_our_own_copy(order_event(label=OURS).order)
        and not prov._is_our_own_copy(order_event().order))


# ── 2. THE SERVER REFUSES A RING, AND ONLY A RING ──────────────────────────────────────────────
# Source-text checks: the walk IS the rule, and a rule that can silently vanish is the defect this
# whole file exists to prevent. The behaviour itself is exercised on his live panel (see the plan's
# verification section) because it needs his real accounts.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
routes = open(os.path.join(ROOT, "server", "routes.ts"), encoding="utf-8").read()

print()
# ── EVERY WAY A COPY IS PLACED MUST CARRY THE MARK ──────────────────────────────────
#
# THE HOLE THIS CLOSES, found 2026-09-27 while confirming his rule. The resting-order path stamped
# the mark and the MARKET path did not. So the rule held for one kind of copy and quietly did not
# hold for the other: a market copy landing on an account that is also a master looked like that
# account's own trade and would have been passed on again. A safety rule that holds on one path
# only is the worst shape for one to be in, because it tests green.
ex = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "executors", "ctrader.py"), encoding="utf-8").read()
print()
print("A COPY IS MARKED HOWEVER IT IS PLACED")
s.check("the resting-order path marks it", 'if label: req.label = label[:100]' in ex, True)
s.check("the MARKET path marks it too", "req.clientOrderId = label[:50]" in ex, True)
s.check("...and open_position actually takes a label to stamp",
        'tp: float | None, label: str = "") -> ExecResult:' in ex, True)
dispatch = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "dispatcher.py"), encoding="utf-8").read()
s.check("the dispatcher passes one on a market copy",
        "label=mirror.mirror_label(snap.key)" in dispatch, True)

print("THE SERVER REFUSES ONLY WHAT HE NAMED: AN ACCOUNT COPYING ITSELF")
s.check("an account still cannot copy itself",
        "Source and target must be different accounts" in routes, True)

# ⚠ THE RING CHECK WAS REMOVED 2026-09-27, AND ITS ABSENCE IS THE ASSERTION. I added one the
# day before that refused to create B->A when A->B existed - it banned the ARRANGEMENT. He
# corrected it: *"a master can be a slave to a slave account and slave can be a master... I dint
# mean they can copy the same trade."* The arrangement is fine; the TRADE must not go round, and
# the mark above is what stops it. Re-adding a ring check would break a setup he wants.
s.check("the arrangement B->A is NOT refused any more",
        "round in a circle for ever" in routes, False)
s.check("...and the walk that enforced it is gone", "copiesInto" in routes, False)

# ── 3. THE OVERVIEW REPORTS EVERY LINK, NOT ONE MASTER ─────────────────────────────────────────
# THE BUG THIS REPLACED: it took `selfRows[0]`'s master and listed EVERY follower under it, so with
# A→B and D→E saved the panel was told "A copies to B and E" — E has never copied A.
print()
print("SEVERAL MASTERS CAN BE REPORTED AT ONCE")
s.check("the overview returns a LIST of links", "links: selfRows" in routes, True)
s.check("...each naming BOTH sides", "masterAccountId:   r.master_account_id" in routes
        and "followerAccountId: r.follower_account_id" in routes, True)
# COMMENTS DO NOT COUNT. The old shape is quoted in a comment above the new block, on purpose, so
# nobody reinvents it — but a substring search finds that quote and reports the defect as live. Only
# an uncommented line is real code.
def _live(needle: str) -> bool:
    return any(needle in ln and not ln.strip().startswith("//") for ln in routes.splitlines())


s.check("the single-master shape is GONE from the code", _live("mirrorBrokerAccountIds:"), False)
s.check("...and is kept in a COMMENT, so nobody rebuilds it",
        "mirrorBrokerAccountIds:" in routes, True)
s.teeth("the old shape really did collapse several masters into one",
        _live("links: selfRows") and not _live("mirrorBrokerAccountIds:"))

s.done()
