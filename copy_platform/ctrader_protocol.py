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
# second per connection (https://help.ctrader.com/open-api/); we stay just under it.
PER_SECOND = float(os.environ.get("CTRADER_REQS_PER_SEC", "45"))


class OwnQueueProtocol(TcpProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._send_queue = deque()          # this connection's messages only
        self._send_task = None              # this connection's own drain timer
        self._lastSendMessageTime = None
        self._window_start = 0.0            # the current one-second window
        self._window_sent = 0               # messages written in it

    # SENT AT ONCE, NOT ON THE NEXT TICK (21 Nov 2026, the copier audit). The library puts every message on a queue
    # that a ONE-SECOND timer drains (`TcpProtocol.connectionMade`: `LoopingCall(_sendStrings).start(1)`), so each
    # message waited up to a second before leaving. A copy is 3-4 messages in a row (app login, account login, often
    # a read, then the order), each waiting for the reply to the one before — that is most of the 3-5 s a copy took
    # (20 Nov gold: master 02:03:08, follower 02:03:13). Now a message is written the moment it is sent, as long as
    # this connection has sent fewer than PER_SECOND in the current second; past that it queues and the library's
    # own timer drains it next second, so the broker's limit is still respected and order is kept.
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
        if now - self._window_start >= 1.0:
            self._window_start, self._window_sent = now, 0
        if instant or (not self._send_queue and self._window_sent < PER_SECOND):
            self._window_sent += 1
            self.sendString(data)
            self._lastSendMessageTime = datetime.datetime.now()
        else:
            self._send_queue.append((isCanceled, data))     # over this second's budget: the next tick sends it
