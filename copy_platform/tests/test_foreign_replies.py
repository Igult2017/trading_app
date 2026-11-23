"""A COPY JOB ACTS ONLY ON ITS OWN REPLIES, AND SENDS NOTHING AFTER IT HAS ANSWERED (23 Nov 2026 — the GBP/USD loss).

What happened, on ctrader4 (account 5347048) at 06:03:03: the copy job for the master's GBP/USD stop order asked for
GBP/USD's contract details. A details reply that ANOTHER part of the copier had asked for, on the same shared connection,
arrived first; the job took it as its own, found GBP/USD still missing, and reported "failed — no contract spec". Then
its OWN reply came — and it placed the order anyway. Nobody knew that copy existed.

The REAL executor (`executors/ctrader.py`), fed the broker's real message types in that order. Only the socket is
stood in for: it records what would have been sent and hands out the reply tag the library would.
Run: cd copy_platform/tests && python test_foreign_replies.py
"""
import asyncio

from twisted.internet import defer
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOASymbolByIdRes, ProtoOANewOrderReq, ProtoOAReconcileRes,
    ProtoOAAmendPositionSLTPReq, ProtoOAErrorRes)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOASymbol, ProtoOAPosition, ProtoOATradeData

from _harness import Suite
import executors.ctrader as EX

s = Suite("COPY — a job acts only on its own replies, and never sends after it has answered")
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)


class Socket:
    """What the library's `Client.send` does that matters here: returns the reply wait whose id is the request's tag."""
    def __init__(self):
        self.sent, self.tags = [], []

    def send(self, req):
        d = defer.Deferred()
        self.sent.append(req)
        self.tags.append(str(id(d)))
        self._keep = getattr(self, "_keep", []) + [d]          # keep it alive, so its id stays unique
        return d


def wire(body, tag):
    return ProtoMessage(payloadType=body.payloadType, payload=body.SerializeToString(), clientMsgId=tag)


def gbp(acct):
    return ProtoOASymbolByIdRes(ctidTraderAccountId=acct, symbol=[ProtoOASymbol(
        symbolId=2, lotSize=10_000_000, minVolume=100_000, maxVolume=10_000_000_000, stepVolume=100_000, digits=5, pipPosition=4)])


def other_symbol(acct):
    return ProtoOASymbolByIdRes(ctidTraderAccountId=acct, symbol=[ProtoOASymbol(symbolId=41, lotSize=100, digits=2, pipPosition=1)])


def place_job(acct):
    ex = EX.CTraderExecutor(creds={"ctraderId": str(acct)}, account_type="demo")
    ex._pending_cmd = ("place", "GBPUSD", "BUY", 0.96, "STOP", 1.31200, 1.31000, 1.31800, "cp-379730644")
    ex._symbol_map = {"GBPUSD": 2}
    ex._result_future = loop.create_future()
    sock = Socket()
    ex._after_symbols(sock)                                     # GBP/USD's details not cached -> asked for
    return ex, sock


def orders(sock):
    return [r for r in sock.sent if isinstance(r, ProtoOANewOrderReq)]


# ── 1. THE 23 NOV ORDER OF EVENTS ──────────────────────────────────────────────────────────────────────────────────
ex, sock = place_job(5347048)
s.check("the job asks for GBP/USD's details first", [type(r).__name__ for r in sock.sent], ["ProtoOASymbolByIdReq"])
ex._on_message(sock, wire(other_symbol(5347048), "someone-else"))      # the reply another part of the copier asked for
s.check("ANOTHER job's details reply arrives first -> nothing placed", orders(sock), [])
s.check("...and NOT reported as failed (the 23 Nov 'no contract spec')", ex._result_future.done(), False)
ex._on_message(sock, wire(gbp(5347048), sock.tags[0]))                 # its own reply
s.check("its OWN reply -> the order goes out, once", len(orders(sock)), 1)
s.check("...at the right size: 0.96 lots = 9,600,000", orders(sock)[0].volume, 9_600_000)
ex._on_message(sock, wire(gbp(5347048), sock.tags[0]))
s.check("the same reply again never sends a second order", len(orders(sock)), 1)

# ── 2. AFTER THE JOB HAS ANSWERED, NOTHING MORE GOES OUT ────────────────────────────────────────────────────────────
ex, sock = place_job(5347049)
ex._resolve(EX.ExecResult(ok=False, error="no contract spec"))         # the job reported a failure (any reason)
ex._on_message(sock, wire(gbp(5347049), sock.tags[0]))                 # ...and then its own reply arrives
s.check("a job that already reported 'failed' places NOTHING when its reply comes late", orders(sock), [])
s.check("...and its answer stays 'failed'", ex._result_future.result().ok, False)

# ── 3. A STOP MOVE: ANOTHER JOB'S ACCOUNT READ IS NOT THIS JOB'S ────────────────────────────────────────────────────
ex = EX.CTraderExecutor(creds={"ctraderId": "5347050"}, account_type="demo")
ex._pending_cmd = ("modify", 77, 1.31246, None)                        # breakeven, target left as it is
ex._result_future = loop.create_future()
sock = Socket()
ex._start_command(sock)
s.check("a stop move with the target left alone reads the account first", type(sock.sent[0]).__name__,
        "ProtoOAReconcileReq")
pos = ProtoOAPosition(positionId=77, tradeData=ProtoOATradeData(symbolId=2, volume=9_600_000, tradeSide=1),
                      positionStatus=1, swap=0, takeProfit=1.31800)
foreign = ProtoOAReconcileRes(ctidTraderAccountId=5347050)             # someone else's read
ex._on_message(sock, wire(foreign, "someone-else"))
s.check("ANOTHER job's account read -> no stop change sent", [r for r in sock.sent
                                                              if isinstance(r, ProtoOAAmendPositionSLTPReq)], [])
ex._on_message(sock, wire(ProtoOAReconcileRes(ctidTraderAccountId=5347050, position=[pos]), sock.tags[0]))
amends = [r for r in sock.sent if isinstance(r, ProtoOAAmendPositionSLTPReq)]
s.check("its OWN read -> one stop change, to breakeven, keeping the target",
        [(a.positionId, round(a.stopLoss, 5), round(a.takeProfit, 5)) for a in amends], [(77, 1.31246, 1.318)])

# ── 4. A REFUSAL OF ANOTHER JOB'S REQUEST IS NOT THIS JOB'S ANSWER ──────────────────────────────────────────────────
ex, sock = place_job(5347051)
ex._on_message(sock, wire(ProtoOAErrorRes(ctidTraderAccountId=5347051, errorCode="INVALID_REQUEST"), "someone-else"))
s.check("another job's refusal does not fail this job", ex._result_future.done(), False)

# ── 5. TEETH — each guard removed on purpose brings the 23 Nov fault back ──────────────────────────────────────────
real_mine, real_answered = EX.CTraderExecutor._reply_to_me, EX.CTraderExecutor._answered
EX.CTraderExecutor._reply_to_me = lambda self, m: True                  # "every reply is mine" — the old behaviour
ex, sock = place_job(5347052)
ex._on_message(sock, wire(other_symbol(5347052), "someone-else"))
s.check("TEETH: without the tag check, another job's reply fails the job ('no contract spec')",
        ex._result_future.done() and ex._result_future.result().ok, False)
EX.CTraderExecutor._reply_to_me = real_mine
EX.CTraderExecutor._answered = lambda self: False                       # "carry on after answering" — the old behaviour
ex, sock = place_job(5347053)
ex._resolve(EX.ExecResult(ok=False, error="no contract spec"))
ex._on_message(sock, wire(gbp(5347053), sock.tags[0]))
s.check("TEETH: without the 'answered' check, the order goes out after 'failed' (the hidden copy)", len(orders(sock)), 1)
EX.CTraderExecutor._answered = real_answered
s.done()
