"""ONE way to send a message to cTrader from the copy service — with the missing reply handled.

THE ROOT CAUSE THIS EXISTS FOR (found 2026-11-15, OPEN.md D67). The cTrader library starts a 5-second
wait for a reply on EVERY message it sends (`ctrader_open_api.Client.send`,
`responseTimeoutInSeconds=5`) and hands back the wait. Every call in this service threw the wait
away, so when no reply came the timeout had nobody to catch it, and Twisted printed it as
"Unhandled error in Deferred" — 9 of them in one short live log after the 15 Nov deploy.

The commonest case is not a fault at all: THE HEARTBEAT, sent every 8 s to keep the socket open
(`gateway.py` `_heartbeat`), is never answered by the broker, by design. Its wait always runs out.

So every send now goes through `send`, which keeps the reply logic exactly as it was (replies are
still read in each module's own message callback) and only decides what a missing reply means:
  heartbeat      expected — say nothing
  anything else  one warning naming the message, so a reply that is really late is still seen
"""
import logging

from twisted.internet import defer

log = logging.getLogger(__name__)

_NO_REPLY_EXPECTED = {"ProtoHeartbeatEvent"}


def send(client, req):
    """Send `req` on `client` exactly as before, with the missing-reply case handled."""
    d = client.send(req)
    name = type(req).__name__
    if d is not None:
        d.addErrback(_missing_reply, name)
    return d


def _missing_reply(failure, name: str):
    if failure.check(defer.TimeoutError, defer.CancelledError):
        if name not in _NO_REPLY_EXPECTED:
            log.warning("[ctrader] no reply to %s within the library's 5 s wait", name)
        return None
    log.warning("[ctrader] sending %s failed: %s", name, failure.getErrorMessage())
    return None
