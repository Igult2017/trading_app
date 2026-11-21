"""LISTENING TO THE FOLLOWER ACCOUNTS — so a copy that goes its own way is noticed (plan step 5, 21 Nov 2026).

Until now nothing listened to a follower's account: a copy the broker refused later, or one the follower closed by
hand, left no trace and the follower silently stopped matching the master. On the pool every follower account is
logged in anyway, so its pushes arrive for free; this reads them.

WHAT IS RECORDED (Activity log + container log), and only for the copier's own trades (label `cp-…`):
  * a copy CLOSED while the copier was not working on that account — closed by hand, or by its own stop/target;
  * a copy order REJECTED or CANCELLED by the broker while the copier was not acting on it.
Commands the copier itself is running hold the account's lock (`pool.account_lock`), so their own news is not
reported as drift. Nothing here sends anything to the broker — it only listens and writes it down.
"""
import logging

from ctrader_open_api import Protobuf
from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAExecutionEvent
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAExecutionType as T, ProtoOAPositionStatus as PS

log = logging.getLogger("copy.follower_watch")
_PT_EXEC = ProtoOAExecutionEvent().payloadType
_watching: dict[int, object] = {}


def _label(event) -> str:
    for part in ("position", "order"):
        if event.HasField(part):
            lbl = getattr(getattr(event, part).tradeData, "label", "") or ""
            if lbl:
                return lbl
    return ""


def describe(event) -> str | None:
    """What happened to a copy on the follower's side, in words — or None when it is not drift worth recording."""
    lbl = _label(event)
    if not lbl.startswith("cp-"):
        return None
    et = event.executionType
    if event.HasField("position") and event.position.positionStatus == PS.POSITION_STATUS_CLOSED:
        return f"copy {lbl} was CLOSED on the follower's account (by hand, or by its own stop/target) — not by the copier"
    if et in (T.ORDER_REJECTED, T.ORDER_CANCELLED, T.ORDER_EXPIRED):
        return f"copy order {lbl} was {T.Name(et).split('_', 1)[1]} by the broker — the follower no longer mirrors it"
    return None


def watch(conn, the_pool, acct: int, follower_ids: list[str]) -> None:
    """Start listening to one follower account (once). `follower_ids` = the copy relationships on it."""
    if acct in _watching:
        return

    def on_message(client, message):
        if message.payloadType != _PT_EXEC or the_pool.account_lock(acct).locked():
            return                                   # a copier command is running: its own news, not drift
        what = describe(Protobuf.extract(message))
        if what:
            from dispatcher import _log
            for fid in follower_ids:
                _log(fid, None, "WARNING", "DRIFT", what)
    _watching[acct] = conn.listen(acct, on_message)
