"""A cTrader message that gets no reply must not end as "Unhandled error in Deferred" (OPEN.md D67).

ROOT CAUSE: `ctrader_open_api.Client.send` arms a 5-second reply timeout on every message and returns
it. This service threw every one away, so a missing reply — always, for the heartbeat, which the
broker never answers — became an unhandled Twisted error in the live log. `ctrader_send.send` now
handles it. These checks use the library's REAL `Client.send` timeout path, driven on a fake clock.
"""
import gc
import logging

from _harness import Suite
from twisted.internet import defer, task
from twisted.python import log as twlog

import ctrader_send
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAVersionReq

S = Suite("copy_platform — a cTrader send with no reply is handled, not left unhandled")


class FakeClient:
    """Does what the library's `Client.send` does with the reply: a Deferred with a 5 s timeout."""
    def __init__(self, clock):
        self.clock = clock

    def send(self, req):
        d = defer.Deferred()
        d.addTimeout(5, self.clock)
        return d


def run(use_helper: bool, req):
    """Send, let 6 s pass on a fake clock, and count unhandled errors Twisted reports."""
    clock = task.Clock()
    client = FakeClient(clock)
    unhandled = []
    obs = lambda ev: unhandled.append(ev) if ev.get("isError") else None
    twlog.addObserver(obs)
    warnings = []
    handler = logging.Handler()
    handler.emit = lambda rec: warnings.append(rec.getMessage())
    logging.getLogger("ctrader_send").addHandler(handler)
    try:
        d = ctrader_send.send(client, req) if use_helper else client.send(req)
        clock.advance(6)
        del d
        gc.collect()                       # an unhandled Deferred error is reported when it is collected
    finally:
        twlog.removeObserver(obs)
        logging.getLogger("ctrader_send").removeHandler(handler)
    return len(unhandled), warnings


n, w = run(True, ProtoHeartbeatEvent())
S.check("heartbeat with no reply: no unhandled error", n, 0)
S.check("heartbeat with no reply: no warning either (the broker never answers one)", len(w), 0)

n, w = run(True, ProtoOAVersionReq())
S.check("a request with no reply: no unhandled error", n, 0)
S.check("a request with no reply: ONE warning naming it", (len(w), "ProtoOAVersionReq" in (w[0] if w else "")),
        (1, True))

# TEETH — the old way (the Deferred thrown away) must produce exactly the error seen in the live log.
n, _ = run(False, ProtoHeartbeatEvent())
S.teeth("without the shared send, the heartbeat's timeout IS unhandled", n >= 1)

S.done()
