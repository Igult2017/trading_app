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
    rec["master_ms"] = event.get("master_ms")
    for f in followers:
        jid = str(uuid4())
        db.add(CopyJob(id=jid, master_id=master_id, master_trade_id=master_trade_id, follower_id=f.id,
                       event_type=event["type"], event=rec, status="pending", attempts=0,
                       created_at=datetime.utcnow()))
        ids[f.id] = jid
    return ids


def owner_of(broker_account_id: str | None, count: int | None = None) -> int:
    """Which worker owns this follower ACCOUNT (plan step 8) — the same stable hash the engine uses for masters, so one
    account's connection lives in exactly one worker."""
    import hashlib
    from config import COPY_WORKER_COUNT
    n = count or COPY_WORKER_COUNT
    return int(hashlib.md5((broker_account_id or "").encode()).hexdigest(), 16) % max(1, n)


def claim(job_id: str | None, session_factory=None) -> bool:
    """Take a pending job for THIS worker — atomically, so two workers (or the fan-out and the 5 s check) never both
    run it. True = it is ours to run now. A job with no id (nothing was written) is always ours."""
    if not job_id:
        return True
    try:
        if session_factory is None:
            from db import Session as session_factory
        from sqlalchemy import text
        with session_factory() as db:
            n = db.execute(text("UPDATE copy_jobs SET status = 'started', started_at = :now, "
                                "attempts = COALESCE(attempts, 0) + 1 WHERE id = :id AND status = 'pending'"),
                           {"id": job_id, "now": datetime.utcnow()}).rowcount
            db.commit()
            return n == 1
    except Exception as exc:
        log.warning("[jobs] could not claim %s: %s — running it", job_id, exc)
        return True


def owned_pending(index: int, count: int, session_factory=None) -> list:
    """Pending jobs whose follower account this worker owns (oldest first)."""
    if session_factory is None:
        from db import Session as session_factory
    from db import CopyJob, CopyFollower
    with session_factory() as db:
        rows = (db.query(CopyJob, CopyFollower.broker_account_id)
                  .join(CopyFollower, CopyFollower.id == CopyJob.follower_id)
                  .filter(CopyJob.status == "pending").order_by(CopyJob.created_at).limit(500).all())
        out = [j for j, acct in rows if owner_of(acct, count) == index]
        db.expunge_all()
        return out


async def run_owned(index: int, count: int, session_factory=None) -> None:
    """For a worker in a group of 2+: run the pending jobs of the followers it owns, woken by NOTIFY copy_jobs and
    checked every 5 s as the safety net. A single worker does not run this — its fan-out runs every job itself."""
    import asyncio
    import dispatcher
    from db_io import run_db
    from db import CopyFollower
    if session_factory is None:
        from db import Session as session_factory
    wake = asyncio.Event()

    async def _wake():
        wake.set()
    try:
        from notify import start_listener
        start_listener(asyncio.get_running_loop(), _wake, channel="copy_jobs")
    except Exception as exc:
        log.warning("[jobs] no NOTIFY listener (%s) — 5 s checks only", exc)
    while True:
        try:
            await asyncio.wait_for(wake.wait(), 5.0)
        except asyncio.TimeoutError:
            pass
        wake.clear()
        try:
            for j in await run_db(owned_pending, index, count, session_factory):
                def _f(fid=j.follower_id):
                    with session_factory() as db:
                        f = db.get(CopyFollower, fid)
                        if f is not None:
                            db.expunge(f)
                        return f
                f = await run_db(_f)
                if f is None:
                    continue
                snap, oid, frac = from_record(j.event)
                asyncio.ensure_future(dispatcher._exec_follower_bounded(j.master_trade_id, f, snap, j.event_type,
                                                                        oid, frac, job_id=j.id,
                                                                        master_ms=(j.event or {}).get("master_ms")))
        except Exception:
            log.exception("[jobs] owned-jobs pass failed")


def mark(job_id: str | None, status: str, error: str | None = None, session_factory=None) -> None:
    """Move one job on. Never raises — losing a status row must not lose the copy it describes."""
    if not job_id:
        return
    try:
        if session_factory is None:
            from db import Session as session_factory
        from sqlalchemy import text
        # ONE WRITE, not a read and then a write (21 Nov 2026, measured by `tests/capacity_dispatch.py`): this runs
        # for every follower of every master event, so each statement saved is thousands per busy minute.
        with session_factory() as db:
            if status == "started":
                db.execute(text("UPDATE copy_jobs SET status = :s, started_at = :now, "
                                "attempts = COALESCE(attempts, 0) + 1 WHERE id = :id"),
                           {"s": status, "now": datetime.utcnow(), "id": job_id})
            else:
                db.execute(text("UPDATE copy_jobs SET status = :s, finished_at = :now, error = :e WHERE id = :id"),
                           {"s": status, "now": datetime.utcnow(), "e": error or None, "id": job_id})
            db.commit()
    except Exception as exc:
        log.warning("[jobs] could not mark %s %s: %s", job_id, status, exc)


def stamp(job_id, master_ms, follower_ms, session_factory=None) -> None:
    """Record the broker's time at both ends of one copy and the delay between them (plan step 9). Never raises."""
    if not job_id or not follower_ms:
        return
    try:
        if session_factory is None:
            from db import Session as session_factory
        from db import CopyJob
        with session_factory() as db:
            j = db.get(CopyJob, job_id)
            if j is None:
                return
            j.master_ms, j.follower_ms = master_ms, follower_ms
            j.delay_ms = int(follower_ms - master_ms) if master_ms else None
            db.commit()
    except Exception as exc:
        log.warning("[jobs] could not stamp the delay of %s: %s", job_id, exc)


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
        await dispatcher._exec_follower_bounded(j.master_trade_id, f, snap, j.event_type, oid, frac, job_id=j.id,
                                                force=(j.status == "started"), master_ms=(j.event or {}).get("master_ms"))
    if rows:
        log.info("[jobs] start-up: %d resent, %d unknown, %d expired", len(send), len(unknown), len(expired))
    return len(send)
