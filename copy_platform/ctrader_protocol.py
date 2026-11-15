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
from collections import deque

from ctrader_open_api import TcpProtocol


class OwnQueueProtocol(TcpProtocol):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._send_queue = deque()          # this connection's messages only
        self._send_task = None              # this connection's own drain timer
        self._lastSendMessageTime = None
