"""A STAND-IN cTrader SERVER for the copier's tests — the real message framing, the real limit, no network.

Speaks what the copier sends (4-byte length + `ProtoMessage`, the library's own framing) and answers like cTrader:
  * app login → logged in;  account login → logged in, or refused (an access token "bad") with `ProtoOAErrorRes`;
  * a new order → `ORDER_ACCEPTED` (pending order) or `ORDER_FILLED` (market) on that account, echoing `clientOrderId`;
  * an amend / cancel / close / stop change → the matching execution event;
  * **50 requests in any one second on one connection → `REQUEST_FREQUENCY_EXCEEDED`**, counted as a breach — the
    limit cTrader documents (https://help.ctrader.com/open-api/), so a test can prove the copier never crosses it.
It can also drop every connection, to prove a reconnect logs everyone back in on the SAME client.
"""
import collections
import time

from twisted.internet import protocol
from twisted.protocols.basic import Int32StringReceiver

from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
from ctrader_open_api.messages import OpenApiMessages_pb2 as M
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAExecutionType as T, ProtoOAOrderStatus as OS


def _pt(cls):
    return cls().payloadType


class _Conn(Int32StringReceiver):
    MAX_LENGTH = 15_000_000

    def connectionMade(self):
        self.factory.conns.append(self)
        self.sent_times = collections.deque()

    def connectionLost(self, reason=None):
        if self in self.factory.conns:
            self.factory.conns.remove(self)

    def reply(self, body, client_msg_id=None):
        m = ProtoMessage(payloadType=body.payloadType, payload=body.SerializeToString())
        if client_msg_id:
            m.clientMsgId = client_msg_id
        self.sendString(m.SerializeToString())

    def stringReceived(self, data):
        f = self.factory
        msg = ProtoMessage()
        msg.ParseFromString(data)
        pt = msg.payloadType
        if pt == 51:                                   # heartbeat — free, cTrader does not count it
            return
        now = time.monotonic()
        self.sent_times.append(now)
        while self.sent_times and now - self.sent_times[0] >= 1.0:
            self.sent_times.popleft()
        f.requests += 1
        if len(self.sent_times) > f.limit:
            f.breaches += 1
            self.reply(M.ProtoOAErrorRes(errorCode="REQUEST_FREQUENCY_EXCEEDED", description="too many requests"),
                       msg.clientMsgId)
            return
        if pt == _pt(M.ProtoOAApplicationAuthReq):
            f.app_logins += 1
            self.reply(M.ProtoOAApplicationAuthRes(), msg.clientMsgId)
            return
        if pt == _pt(M.ProtoOAAccountAuthReq):
            req = M.ProtoOAAccountAuthReq(); req.ParseFromString(msg.payload)
            f.account_logins[req.ctidTraderAccountId] += 1
            if req.accessToken == "bad":
                self.reply(M.ProtoOAErrorRes(ctidTraderAccountId=req.ctidTraderAccountId,
                                             errorCode="CH_ACCESS_TOKEN_INVALID", description="token invalid"))
            else:
                self.reply(M.ProtoOAAccountAuthRes(ctidTraderAccountId=req.ctidTraderAccountId), msg.clientMsgId)
            return
        if pt == _pt(M.ProtoOANewOrderReq):
            req = M.ProtoOANewOrderReq(); req.ParseFromString(msg.payload)
            f.orders.append((req.ctidTraderAccountId, req.clientOrderId, time.monotonic()))
            f.next_id += 1
            ev = M.ProtoOAExecutionEvent(ctidTraderAccountId=req.ctidTraderAccountId)
            market = req.orderType == 1
            ev.executionType = T.ORDER_FILLED if market else T.ORDER_ACCEPTED
            o = ev.order
            o.orderId, o.orderType, o.clientOrderId = f.next_id, req.orderType, req.clientOrderId
            o.orderStatus = OS.ORDER_STATUS_FILLED if market else OS.ORDER_STATUS_ACCEPTED
            o.stopPrice = req.stopPrice
            o.tradeData.symbolId, o.tradeData.volume, o.tradeData.tradeSide = req.symbolId, req.volume, req.tradeSide
            if market:
                p = ev.position
                p.positionId, p.positionStatus, p.swap, p.price = f.next_id + 100_000, 1, 0, 1.1
                p.tradeData.symbolId, p.tradeData.volume, p.tradeData.tradeSide = req.symbolId, req.volume, req.tradeSide
            self.reply(ev)
            if f.noise:                                # another order's news on the same account, straight after
                other = M.ProtoOAExecutionEvent(ctidTraderAccountId=req.ctidTraderAccountId,
                                                executionType=T.ORDER_ACCEPTED)
                other.order.orderId, other.order.orderStatus, other.order.clientOrderId = 1, 1, "someone-else"
                other.order.orderType = 3
                other.order.tradeData.symbolId, other.order.tradeData.volume, other.order.tradeData.tradeSide = 1, 1, 1
                self.reply(other)
            return
        if pt == _pt(M.ProtoOASymbolsListReq):
            req = M.ProtoOASymbolsListReq(); req.ParseFromString(msg.payload)
            res = M.ProtoOASymbolsListRes(ctidTraderAccountId=req.ctidTraderAccountId)
            s = res.symbol.add(); s.symbolId, s.symbolName, s.enabled = 1, "EURUSD", True
            self.reply(res, msg.clientMsgId)
            return
        if pt == _pt(M.ProtoOAReconcileReq):
            req = M.ProtoOAReconcileReq(); req.ParseFromString(msg.payload)
            self.reply(M.ProtoOAReconcileRes(ctidTraderAccountId=req.ctidTraderAccountId), msg.clientMsgId)
            return
        if pt == _pt(M.ProtoOASymbolByIdReq):
            req = M.ProtoOASymbolByIdReq(); req.ParseFromString(msg.payload)
            res = M.ProtoOASymbolByIdRes(ctidTraderAccountId=req.ctidTraderAccountId)
            s = res.symbol.add()
            s.symbolId, s.digits, s.pipPosition, s.lotSize = 1, 5, 4, 10_000_000
            s.minVolume, s.stepVolume, s.maxVolume = 100_000, 100_000, 10 ** 12
            self.reply(res, msg.clientMsgId)
            return


class FakeCTrader(protocol.ServerFactory):
    protocol = _Conn

    def __init__(self, limit: int = 50):
        self.limit = limit
        self.conns: list[_Conn] = []
        self.app_logins = 0
        self.account_logins = collections.Counter()
        self.orders: list = []
        self.requests = 0
        self.breaches = 0
        self.next_id = 1000
        self.noise = False

    def drop_all(self):
        for c in list(self.conns):
            c.transport.loseConnection()


def plain_tcp_for_tests():
    """The library always dials `ssl:`; the stand-in server is plain TCP on localhost."""
    import ctrader_open_api.client as cc
    if getattr(cc, "_test_plain_tcp", False):
        return
    orig = cc.clientFromString
    cc.clientFromString = lambda reactor, s: orig(reactor, s.replace("ssl:", "tcp:", 1))
    cc._test_plain_tcp = True


# ── RUN AS ITS OWN PROCESS (like the real broker): `python fake_ctrader.py <port> <control_port>` ──────────────────
# The protocol port speaks cTrader; the control port takes one-line commands — stats | drop | noise on | noise off |
# reset — and answers one JSON line. A separate process matters: inside the test's own event loop, 41 busy client
# connections delay the server's reads and bunch messages together, which a real, separate broker does not see.
class _Control(protocol.Protocol):
    def dataReceived(self, data):
        import json
        f = self.factory.fake
        for line in data.decode().splitlines():
            cmd = line.strip()
            if cmd == "drop":
                f.drop_all()
            elif cmd == "noise on":
                f.noise = True
            elif cmd == "noise off":
                f.noise = False
            elif cmd.startswith("push "):            # the account places a STOP order — pushed to whoever listens
                acct = int(cmd.split()[1])
                ev = M.ProtoOAExecutionEvent(ctidTraderAccountId=acct, executionType=T.ORDER_ACCEPTED)
                o = ev.order
                o.orderId, o.orderType, o.orderStatus, o.stopPrice, o.stopLoss = 777, 3, 1, 1.1050, 1.1000
                o.tradeData.symbolId, o.tradeData.volume, o.tradeData.tradeSide = 1, 1_000_000, 1
                for c in f.conns:
                    c.reply(ev)
            elif cmd.startswith("limit "):
                f.limit = int(cmd.split()[1])
            elif cmd == "reset":
                f.requests = f.breaches = 0
                f.orders.clear()
            self.transport.write(json.dumps({
                "conns": len(f.conns), "app_logins": f.app_logins, "requests": f.requests, "breaches": f.breaches,
                "orders": len(f.orders), "account_logins": dict(f.account_logins)}).encode() + b"\n")


if __name__ == "__main__":
    import sys
    from twisted.internet import reactor
    fake = FakeCTrader()
    reactor.listenTCP(int(sys.argv[1]), fake, interface="127.0.0.1")
    cf = protocol.ServerFactory()
    cf.protocol, cf.fake = _Control, fake
    reactor.listenTCP(int(sys.argv[2]), cf, interface="127.0.0.1")
    print("ready", flush=True)
    reactor.run()
