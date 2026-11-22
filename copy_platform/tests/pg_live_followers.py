# The REAL sweep.live_followers query against a REAL Postgres (PGlite over its socket). Run by hand (needs node +
# @electric-sql/pglite-socket in the repo): python copy_platform/tests/pg_live_followers.py — not in run_all (no node in CI).
import os, socket, subprocess, sys, time
from datetime import datetime, timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, "copy_platform"))


def free_port():
    with socket.socket() as so:
        so.bind(("127.0.0.1", 0)); return so.getsockname()[1]


PORT = free_port()
pg = subprocess.Popen(["node", os.path.join(REPO, "node_modules", "@electric-sql", "pglite-socket", "dist", "scripts",
                                            "server.js"),
                       "-p", str(PORT), "-m", "5"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try:
        socket.create_connection(("127.0.0.1", PORT), 1).close(); break
    except OSError:
        time.sleep(0.2)
os.environ["DATABASE_URL"] = f"postgresql://postgres:postgres@127.0.0.1:{PORT}/postgres?sslmode=disable"
try:
    import _harness  # noqa: F401
    from _harness import Suite
    import db as DB
    from db import Session, CopyFollower, CopyTradeMaster, CopyTradeFollower, CopyJob
    DB.Base.metadata.create_all(DB.engine, tables=[CopyFollower.__table__, CopyTradeMaster.__table__,
                                                   CopyTradeFollower.__table__, CopyJob.__table__])
    import sweep
    s = Suite("live_followers against a real Postgres")
    now, old = datetime.utcnow(), datetime.utcnow() - timedelta(hours=30)
    with Session() as db:
        for fid, mid in (("f-holding", "m-holding"), ("f-recent", "m-recent"), ("f-failed", "m-quiet"),
                         ("f-job", "m-quiet"), ("f-quiet", "m-quiet")):
            db.add(CopyFollower(id=fid, master_id=mid, is_active=True))
        db.add(CopyTradeMaster(id="t-recent", master_id="m-recent", external_id="1", source="ctrader", symbol="X",
                               action="BUY", event_type="CLOSE", created_at=now - timedelta(hours=2)))
        db.add(CopyTradeMaster(id="t-old", master_id="m-quiet", external_id="2", source="ctrader", symbol="X",
                               action="BUY", event_type="CLOSE", created_at=old))
        db.add(CopyTradeFollower(id="r1", follower_id="f-failed", symbol="X", action="BUY", event_type="CLOSE",
                                 status="failed", created_at=now - timedelta(hours=1)))
        db.add(CopyTradeFollower(id="r2", follower_id="f-quiet", symbol="X", action="BUY", event_type="CLOSE",
                                 status="failed", created_at=old))
        db.add(CopyJob(id="j1", master_id="m-quiet", follower_id="f-job", event_type="OPEN", status="unknown",
                       created_at=now - timedelta(hours=3)))
        db.commit()
    got = sweep.live_followers({"m-holding"})
    s.check("a follower of a master HOLDING something now is live", "f-holding" in got, True)
    s.check("a follower of a master active in the last 24 h is live (his stuck copy after a close)", "f-recent" in got, True)
    s.check("a follower with a FAILED copy in the last 24 h is live", "f-failed" in got, True)
    s.check("a follower with an UNFINISHED copy job (unknown) is live", "f-job" in got, True)
    s.check("a follower whose master was quiet for 30 h and whose failure is 30 h old is NOT read", "f-quiet" in got, False)

    # ── dispatcher._moved_levels (23 Nov 2026): what the repair check compares a copy's live stop/target against ────────
    import dispatcher
    with Session() as db:
        db.add(CopyTradeMaster(id="mt-9", master_id="m-holding", external_id="900", source="ctrader", symbol="X",
                               action="BUY", event_type="OPEN", created_at=now))
        for rid, ev, st, sl, mins in (("o1", "OPEN", "executed", 1.00, 30), ("m1", "MODIFY", "executed", 1.05, 20),
                                      ("m2", "MODIFY", "failed", 1.08, 10), ("m3", "MODIFY", "skipped", 1.09, 5)):
            db.add(CopyTradeFollower(id=rid, master_trade_id="mt-9", follower_id="f-holding", symbol="X", action="BUY",
                                     event_type=ev, status=st, stop_loss=sl, take_profit=1.2,
                                     created_at=now - timedelta(minutes=mins)))
        db.add(CopyTradeFollower(id="o2", master_trade_id="mt-9", follower_id="f-recent", symbol="X", action="BUY",
                                 event_type="OPEN", status="executed", stop_loss=1.0, created_at=now))
        db.commit()
    lv = dispatcher._moved_levels(["f-holding", "f-recent"], {"900"})
    s.check("the NEWEST stop move counts — a FAILED one included (the follower still has the old stop): 1.08",
            lv.get(("f-holding", "900")), (1.08, 1.2))
    s.check("a copy the copier only OPENED (never moved) has no record — its opening stop is never compared",
            ("f-recent", "900") in lv, False)
    s.check("a master trade not open now is not read", dispatcher._moved_levels(["f-holding"], {"901"}), {})
    s.done()
finally:
    pg.kill()
