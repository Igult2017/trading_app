"""DURABLE FAN-OUT — every follower's copy is written down BEFORE it is sent (plan step 6, 21 Nov 2026).

THE GAP. A master event fanned out to its followers in memory only. If the engine stopped part-way — a deploy, a
crash — the followers not yet reached simply never got the trade, and nothing recorded that they should have.

NOW. The jobs are written in the SAME database transaction as the master's own row (`dispatcher._claim_event`), one
per follower: pending. Each is marked started just before it is sent and done/failed when it finishes. At start-up
`resume()` picks up what was left:
  * pending (never started) — sent now; nothing has happened for it yet;
  * started, and the action is safe to repeat (close, stop/target change, moving or cancelling an order) — sent again;
    the dispatcher already no-ops a close with nothing to close and a change to levels already there;
  * started, and it is an ENTRY or a PARTIAL CLOSE — NOT resent (the copier's rule: an entry is never retried — it
    could open a second trade), marked `unknown` and written to the Activity log for the repair sweep (plan step 7);
  * older than REPLAY_WINDOW — `expired`, logged; the market has moved on and the sweep decides.
"""
import dataclasses
import logging
from datetime import datetime, timedelta
from uuid import uuid4

log = logging.getLogger("copy.jobs")

REPLAY_WINDOW = timedelta(minutes=10)
SAFE_TO_REPEAT = {"CLOSE", "MODIFY", "AMENDED", "CANCELLED"}


def to_record(event: dict) -> dict:
    """The parts of a master event needed to send it again — plain JSON."""
    snap = event.get("snap") or event.get("order")
    return {"type": event["type"], "kind": "order" if event.get("order") is not None else "position",
            "snap": dataclasses.asdict(snap), "master_order_id": event.get("master_order_id"),
            "fraction": event.get("fraction")}


def from_record(rec: dict):
    """(snap, master_order_id, fraction) rebuilt from `to_record`."""
    from providers.ctrader import OrderSnapshot, PositionSnapshot
    cls = OrderSnapshot if rec.get("kind") == "order" else PositionSnapshot
    return cls(**rec["snap"]), rec.get("master_order_id"), rec.get("fraction")


def create(db, master_id: str, master_trade_id: str, followers, event: dict) -> dict:
    """One pending job per follower, added to the caller's session (committed with it). {follower id: job id}."""
    from db import CopyJob
    rec, ids = to_record(event), {}
    for f in followers:
        jid = str(uuid4())
        db.add(CopyJob(id=jid, master_id=master_id, master_trade_id=master_trade_id, follower_id=f.id,
                       event_type=event["type"], event=rec, status="pending", attempts=0,
                       created_at=datetime.utcnow()))
        ids[f.id] = jid
    return ids


def mark(job_id: str | None, status: str, error: str | None = None, session_factory=None) -> None:
    """Move one job on. Never raises — losing a status row must not lose the copy it describes."""
    if not job_id:
        return
    try:
        if session_factory is None:
            from db import Session as session_factory
        from db import CopyJob
        with session_factory() as db:
            j = db.get(CopyJob, job_id)
            if j is None:
                return
            now = datetime.utcnow()
            j.status = status
            if status == "started":
                j.started_at, j.attempts = now, (j.attempts or 0) + 1
            else:
                j.finished_at, j.error = now, (error or None)
            db.commit()
    except Exception as exc:
        log.warning("[jobs] could not mark %s %s: %s", job_id, status, exc)


def plan_resume(rows, now: datetime | None = None) -> tuple[list, list, list]:
    """Split unfinished jobs into (send, unknown, expired) by the rules above. Pure — the tests drive it."""
    now = now or datetime.utcnow()
    send, unknown, expired = [], [], []
    for j in rows:
        if j.created_at is not None and now - j.created_at > REPLAY_WINDOW:
            expired.append(j)
        elif j.status == "pending" or (j.status == "started" and j.event_type in SAFE_TO_REPEAT):
            send.append(j)
        else:
            unknown.append(j)
    return send, unknown, expired


async def resume(session_factory=None) -> int:
    """At start-up: finish what the last run left. Returns how many jobs were sent again."""
    from db import CopyJob, CopyFollower
    from db_io import run_db
    import dispatcher
    if session_factory is None:
        from db import Session as session_factory

    def _load():
        with session_factory() as db:
            rows = db.query(CopyJob).filter(CopyJob.status.in_(("pending", "started"))).all()
            db.expunge_all()
            return rows
    rows = await run_db(_load)
    send, unknown, expired = plan_resume(rows)
    for j in unknown + expired:
        why = ("it may already have been sent when the engine stopped — not resent (an entry is never retried); "
               "the repair sweep checks it") if j in unknown else \
              "older than 10 minutes when the engine came back — not replayed; the repair sweep checks it"
        await run_db(mark, j.id, "unknown" if j in unknown else "expired", why, session_factory)
        dispatcher._log(j.follower_id, j.master_trade_id, "WARNING", "RESUME", f"{j.event_type}: {why}")
    for j in send:
        def _follower(fid=j.follower_id):
            with session_factory() as db:
                f = db.get(CopyFollower, fid)
                if f is not None:
                    db.expunge(f)
                return f
        f = await run_db(_follower)
        if f is None:
            await run_db(mark, j.id, "failed", "follower no longer exists", session_factory)
            continue
        snap, oid, frac = from_record(j.event)
        log.info("[jobs] resuming %s for follower %s (was %s)", j.event_type, j.follower_id, j.status)
        await dispatcher._exec_follower_bounded(j.master_trade_id, f, snap, j.event_type, oid, frac, job_id=j.id)
    if rows:
        log.info("[jobs] start-up: %d resent, %d unknown, %d expired", len(send), len(unknown), len(expired))
    return len(send)
