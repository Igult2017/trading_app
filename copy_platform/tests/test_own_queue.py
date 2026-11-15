"""Each cTrader connection must send ONLY its own messages (OPEN.md D68).

The library declares its outgoing queue on the CLASS (`TcpProtocol._send_queue`), so with two
connections open a message written to one is sent down whichever connection's timer runs first. Live,
15 Nov 2026, that put four masters' logins on ctraderpep's socket ("already authorized in this
channel") and left those four masters never logged in. `OwnQueueProtocol` gives each connection its
own queue. This drives the library's REAL `send` and `_sendStrings` on fake sockets.
"""
import types

from _harness import Suite
from twisted.internet.testing import StringTransport

from ctrader_open_api import TcpProtocol
from ctrader_protocol import OwnQueueProtocol

S = Suite("copy_platform — every cTrader connection sends only its own messages")


def connection(cls):
    p = cls()
    p.factory = types.SimpleNamespace(numberOfMessagesToSendPerSecond=5)
    p.transport = StringTransport()     # a fake socket; no timers started — the test drains by hand
    return p


def run(cls):
    """Connection A queues "A-login", connection B queues "B-login"; A's timer fires first."""
    a, b = connection(cls), connection(cls)
    a.send(b"A-login")
    b.send(b"B-login")
    a._sendStrings()                    # A's once-a-second drain runs first
    b._sendStrings()
    return a.transport.value(), b.transport.value()


a_sock, b_sock = run(OwnQueueProtocol)
S.check("connection A's socket carries A's login", b"A-login" in a_sock, True)
S.check("connection A's socket does NOT carry B's login", b"B-login" in a_sock, False)
S.check("connection B's socket carries B's login", b"B-login" in b_sock, True)
S.check("connection B's socket does NOT carry A's login", b"A-login" in b_sock, False)

# TEETH — the library's own class reproduces the live fault: B's login goes down A's socket.
try:
    a_sock, b_sock = run(TcpProtocol)
    crossed = b"B-login" in a_sock and b"B-login" not in b_sock
finally:
    TcpProtocol._send_queue.clear()     # the shared class queue: leave it as found
S.teeth("with the library's class, B's login is sent down A's socket", crossed)

S.done()
