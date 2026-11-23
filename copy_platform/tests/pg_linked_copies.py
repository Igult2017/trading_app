# The REAL linked_copies database steps against a REAL Postgres (PGlite over its socket), 23 Nov 2026 (the GBP/USD loss).
# @electric-sql/pglite-socket in the repo): python copy_platform/tests/pg_linked_copies.py — not in run_all (no node in CI).
import os, socket, subprocess, sys, time

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
    import dispatcher
    import linked_copies as L
    from providers.ctrader import PositionSnapshot
    s = Suite("linked_copies against a real Postgres")
    snap = PositionSnapshot(position_id=266762486, symbol="GBPUSD", action="BUY", volume_lots=0.96,
                            entry_price=1.312, stop_loss=1.31, take_profit=1.318)
    with Session() as db:

        row = dispatcher._save_master_trade(db, "m-ctp2", snap, "OPEN", "ctrader", from_order=379730644)
        mt = row.id
        db.commit()
    s.check("the master's OPEN record keeps the order it filled from", L.master_order_of("m-ctp2", "266762486"),
            "379730644")
    s.check("a master trade with no order behind it -> None (a market entry)", L.master_order_of("m-ctp2", "1"), None)
    L.adopt("f-ct4", mt, snap, None, "379730645")                 # the copy order found resting, not yet filled
    with Session() as db:
        r = db.query(CopyTradeFollower).filter_by(follower_id="f-ct4").one()
        s.check("a found copy ORDER is written down as the follower's OPEN, no position yet",
                (r.event_type, r.status, r.external_id), ("OPEN", "executed", None))
    s.check("the dispatcher's record lookup sees it with no position", dispatcher._find_follower_position_id(
        "f-ct4", "266762486")[0], None)
    L.correct_record("f-ct4", "266762486", "266762500")
    s.check("once found at the broker the record is corrected to its position",
            dispatcher._find_follower_position_id("f-ct4", "266762486")[0], "266762500")
    L.correct_record("f-ct4", "266762486", "999")
    s.check("...and a record that already has a position is never overwritten",
            dispatcher._find_follower_position_id("f-ct4", "266762486")[0], "266762500")
    s.done()
finally:
    pg.kill()
