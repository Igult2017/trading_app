"""EVERY cTrader CONNECTION GETS ITS OWN OUTGOING QUEUE. Use `OwnQueueProtocol`, never the library's.

THE ROOT CAUSE THIS FIXES (found 2026-11-15, OPEN.md D68). The library's connection class declares
its outgoing queue on the CLASS:

    class TcpProtocol(Int32StringReceiver):      # ctrader_open_api/tcpProtocol.py
        _send_queue = deque([])                  # ONE queue for every connection in the program

Each connection's once-a-second timer (`_sendStrings`) takes up to 5 messages from that queue and
writes them down ITS OWN socket. With more than one connection open — and the copy service opens one
per master to listen for its trades, plus one per follower order — a message goes out on whichever
connection's timer fires first, not the one it was written for.

What that looked like live, 15 Nov 2026 15:25-15:30 UTC, in the broker's own words: ctraderpep's
connection was told "Trading account is already authorized in this channel" and "Open API
application is already authorized" — logins it never sent; the other four masters' logins had gone
down its socket, so those four never logged in and were rebuilt every 3 minutes. A follower's order
could go out on a master's connection the same way and be refused.

THE FIX IS ONLY THIS: the queue (and the timer that drains it) are created per connection. Every
other line is the library's own. The event-listener design is unchanged, and so is the load: the same
number of connections, each still sending at most `numberOfMessagesToSendPerSecond` (5) a second,
far under cTrader's documented 50 per second per connection.
"""
import datetime
import os
import time
from collections import deque

from ctrader_open_api import TcpProtocol
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage

# HOW MANY MESSAGES ONE CONNECTION MAY SEND IN ANY ONE SECOND. cTrader's limit is 50 non-historical requests per
# second per connection (https://help.ctrader.com/open-api/). 35, not 45 (21 Nov 2026): measured on the stand-in broker
# (`tests/test_pool.py`), a machine busy with 2,000 accounts flushes messages in bunches, so a sender paced at 45 or even
# 30 still ARRIVED over 50 in a second; at 25 none did. 35 leaves that margin, and a "too many" answer is resent a
# second later (`executors/ctrader._resend_later`, `pool.Conn` logins), so a bunch costs a second, never a copy.
PER_SECOND = float(os.environ.get("CTRADER_REQS_PER_SEC", "35"))
PEAK = 0          # measured: the highest count of messages written on any one connection within one second


class OwnQueueProtocol(TcpProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._send_queue = deque()          # this connection's messages only
        self._send_task = None              # this connection's own drain timer
        self._lastSendMessageTime = None
        self._recent = deque()              # when each of the last messages was written (a SLIDING second)
        self._drain_call = None

    # SENT AT ONCE, NOT ON THE NEXT TICK (21 Nov 2026, the copier audit). The library puts every message on a queue
    # that a ONE-SECOND timer drains (`TcpProtocol.connectionMade`: `LoopingCall(_sendStrings).start(1)`), so each
    # message waited up to a second before leaving. A copy is 3-4 messages in a row (app login, account login, often
    # a read, then the order), each waiting for the reply to the one before — that is most of the 3-5 s a copy took
    # (20 Nov gold: master 02:03:08, follower 02:03:13). Now a message is written the moment it is sent while fewer
    # than PER_SECOND were written in the LAST SECOND (a sliding second — the stricter reading, so 45 at the end of
    # one second and 45 at the start of the next can never make 90 inside one second; caught by the stand-in broker
    # in `tests/test_pool.py`). Past that it queues, in order, and is written the instant a slot frees.
    def connectionLost(self, reason=None):
        if self._drain_call is not None and self._drain_call.active():
            self._drain_call.cancel()
        self._drain_call = None
        super().connectionLost(reason)

    def _room(self, now: float) -> bool:
        while self._recent and now - self._recent[0] >= 1.0:
            self._recent.popleft()
        return len(self._recent) < PER_SECOND

    def _write(self, data: bytes, now: float) -> None:
        global PEAK
        self._recent.append(now)
        PEAK = max(PEAK, len(self._recent))      # the most this process ever wrote on one connection in one second
        self.sendString(data)
        self._lastSendMessageTime = datetime.datetime.now()

    def send(self, message, instant=False, clientMsgId=None, isCanceled=None):
        if isCanceled is not None and isCanceled():
            return
        if isinstance(message, ProtoMessage):
            data = message.SerializeToString()
        elif isinstance(message, bytes):
            data = message
        elif isinstance(message, ProtoMessage.__base__):
            data = ProtoMessage(payload=message.SerializeToString(), clientMsgId=clientMsgId,
                                payloadType=message.payloadType).SerializeToString()
        else:
            data = b""
        now = time.monotonic()
        if not self._send_queue and self._room(now):
            self._write(data, now)
        else:
            self._send_queue.append((isCanceled, data))
            self._schedule_drain(now)

    def _schedule_drain(self, now: float) -> None:
        if self._drain_call is not None and self._drain_call.active():
            return
        wait = max(0.0, 1.0 - (now - self._recent[0])) if self._recent else 0.0
        from twisted.internet import reactor
        self._drain_call = reactor.callLater(wait + 0.001, self._drain)

    def _drain(self) -> None:
        self._drain_call = None
        now = time.monotonic()
        while self._send_queue and self._room(now):
            is_cancelled, data = self._send_queue.popleft()
            if is_cancelled is not None and is_cancelled():
                continue
            self._write(data, now)
        if self._send_queue:
            self._schedule_drain(now)

    def _sendStrings(self):
        """The library's once-a-second tick: only the idle heartbeat now — the queue is drained by `_drain`, inside
        the same sliding-second limit, never in a burst of its own."""
        if not self._send_queue and (self._lastSendMessageTime is None or
                                     (datetime.datetime.now() - self._lastSendMessageTime).total_seconds() > 20):
            self.heartbeat()
        elif self._send_queue:
            self._drain()

    def heartbeat(self):
        from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent
        now = time.monotonic()
        if self._room(now):                  # a heartbeat counts too; skipped when the second is full (traffic is flowing)
            self._write(ProtoMessage(payload=ProtoHeartbeatEvent().SerializeToString(),
                                     payloadType=ProtoHeartbeatEvent().payloadType).SerializeToString(), now)
