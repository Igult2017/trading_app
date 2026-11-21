"""DURABLE FAN-OUT — a crash part-way through a fan-out no longer loses the remaining followers (plan step 6).

Real `jobs.create / mark / plan_resume / resume` on an in-memory database (the copier's own models), with only the
per-follower send replaced by a recorder. The rules, in plain words:
  * a copy written down but never started is sent at the next start-up — once;
  * a started close / stop change / order move or cancel is sent again (repeating it does no harm);
  * a started ENTRY or PARTIAL CLOSE is NOT sent again (it could open a second trade) — marked unknown, logged;
  * anything older than 10 minutes is not replayed — expired, logged.
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

from _harness import Suite
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import db as DB
import dispatcher
import jobs
from providers.ctrader import OrderSnapshot, PositionSnapshot

s = Suite("COPY — every follower's copy is written down before it is sent, and finished after a crash")

from sqlalchemy import ARRAY                                    # noqa: E402
from sqlalchemy.ext.compiler import compiles                    # noqa: E402


@compiles(ARRAY, "sqlite")
def _array_as_text(t, c, **kw):        # the in-memory test database has no list column; the job logic never reads it
    return "TEXT"


from sqlalchemy.pool import StaticPool                          # noqa: E402
eng = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
DB.CopyJob.__table__.create(eng)
DB.CopyFollower.__table__.create(eng)
S = sessionmaker(bind=eng)

order = OrderSnapshot(order_id=777, symbol="EURUSD", action="BUY", volume_lots=0.1, order_type="STOP", price=1.105,
                      stop_loss=1.1, take_profit=1.11)
s.check("an order event survives being written and read back", jobs.from_record(jobs.to_record(
    {"type": "PLACED", "order": order}))[0], order)
pos = PositionSnapshot(position_id=55, symbol="EURUSD", action="SELL", volume_lots=0.2, entry_price=1.1,
                       stop_loss=1.11, take_profit=1.09)
s.check("a position event survives too, with its fraction", jobs.from_record(jobs.to_record(
    {"type": "REDUCE", "snap": pos, "fraction": 0.5}))[::2], (pos, 0.5))


def job(status, etype, age_min=1):
    return SimpleNamespace(status=status, event_type=etype, created_at=datetime.utcnow() - timedelta(minutes=age_min))


send, unknown, expired = jobs.plan_resume([job("pending", "OPEN"), job("started", "CLOSE"), job("started", "MODIFY"),
                                           job("started", "OPEN"), job("started", "REDUCE"), job("started", "PLACED"),
                                           job("pending", "CLOSE", age_min=30)])
s.check("never started -> sent; started close/modify -> sent again", [(j.status, j.event_type) for j in send],
        [("pending", "OPEN"), ("started", "CLOSE"), ("started", "MODIFY")])
s.check("a started entry, partial close or order placement is NOT repeated", [j.event_type for j in unknown],
        ["OPEN", "REDUCE", "PLACED"])
s.check("older than 10 minutes is not replayed", [j.event_type for j in expired], ["CLOSE"])

# ── a fan-out to three followers stopped after the first ──
with S() as db:
    for fid in ("f1", "f2", "f3"):
        db.add(DB.CopyFollower(id=fid, master_id="m", is_active=True))
    db.commit()
    followers = [SimpleNamespace(id=f) for f in ("f1", "f2", "f3")]
    ids = jobs.create(db, "m", "mt-1", followers, {"type": "PLACED", "order": order})
    db.commit()
jobs.mark(ids["f1"], "started", session_factory=S)
jobs.mark(ids["f1"], "done", session_factory=S)
jobs.mark(ids["f2"], "started", session_factory=S)        # the engine stopped here, mid-send of f2

sent, logged = [], []


async def fake_bounded(mtid, f, snap, etype, oid, frac, job_id=None):
    sent.append((f.id, etype, snap.order_id))
    jobs.mark(job_id, "done", session_factory=S)
dispatcher._exec_follower_bounded = fake_bounded
dispatcher._log = lambda fid, tid, lvl, ev, msg: logged.append((fid, ev))


async def go():
    import db_io
    return await jobs.resume(session_factory=S)
asyncio.new_event_loop().run_until_complete(go())
s.check("after the restart, the follower never reached gets its copy — once", sent, [("f3", "PLACED", 777)])
s.check("the follower whose placement may have gone out is NOT sent it again — logged for the sweep",
        logged, [("f2", "RESUME")])
with S() as db:
    states = {j.follower_id: j.status for j in db.query(DB.CopyJob).all()}
s.check("every job ends in a known state", states, {"f1": "done", "f2": "unknown", "f3": "done"})
sent.clear()
asyncio.new_event_loop().run_until_complete(go())
s.check("a second restart sends nothing again", sent, [])
s.teeth("without the jobs written first, a restart has nothing to finish (the old loss)",
        jobs.plan_resume([])[0] == [])

import pathlib
src = (pathlib.Path(__file__).resolve().parents[1] / "dispatcher.py").read_text(encoding="utf-8")
s.check("the jobs are written in the claim, before the fan-out", "job_ids = jobs.create(db, master_id" in src, True)
s.check("...and every follower's copy moves its job on", 'await run_db(jobs.mark, job_id, "started")' in src, True)
s.done()
