"""A master's order/position may carry SEVERAL recorded events (docs/OPEN.md D75, fixed 18 Nov 2026).

ROOT CAUSE. `server/db-init.ts` created a UNIQUE index on copy_trades_master (master_id, external_id) — one row per
order/position number. The dispatcher records PLACED then each AMENDED for an order, and OPEN, REDUCE, CLOSE for a
position, all under that one number (`dispatcher._save_master_trade`). So the 2nd event crashed the save — 10 times on
18 Nov (an AMENDED) — and a master's CLOSE would have crashed the same way, never reaching followers.

Run on a REAL table (SQLite in memory) through the REAL `_save_master_trade`: with the old rule the 2nd save fails;
with the statements db-init.ts now runs, every event is kept.  Run: python copy_platform/tests/test_master_event_history.py
"""
import re
from types import SimpleNamespace

from _harness import Suite, repo_path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from db import CopyTradeMaster
import dispatcher

s = Suite("copy: one order/position number may carry many recorded events")


def fresh(old_rule: bool):
    eng = create_engine("sqlite://")
    CopyTradeMaster.__table__.create(eng)
    with eng.begin() as c:
        if old_rule:
            c.execute(text("CREATE UNIQUE INDEX idx_copy_trades_master_dedup ON copy_trades_master (master_id, external_id)"))
        else:   # exactly what db-init.ts now runs (DROP is a no-op here; the look-up index is created)
            c.execute(text("DROP INDEX IF EXISTS idx_copy_trades_master_dedup"))
            c.execute(text("CREATE INDEX IF NOT EXISTS idx_copy_trades_master_lookup "
                           "ON copy_trades_master (master_id, external_id, event_type)"))
    return sessionmaker(eng, expire_on_commit=False)()


def order(price):
    return SimpleNamespace(key="377939771", symbol="GBPUSD", action="BUY", volume_lots=0.1, entry_price=price,
                           stop_loss=1.30, take_profit=1.33, order_id="377939771", order_type="STOP")


def position(closed=None):
    return SimpleNamespace(key="9001", symbol="GBPUSD", action="BUY", volume_lots=0.1, entry_price=1.31,
                           stop_loss=1.30, take_profit=1.33, closed_price=closed, position_id="9001")


def saves(db, events):
    out = []
    for snap, etype in events:
        try:
            dispatcher._save_master_trade(db, "M1", snap, etype, "ctrader")
            db.commit()                 # as `_claim_event` does, once, after the follower jobs (21 Nov 2026)
            out.append("ok")
        except Exception as exc:
            db.rollback()
            out.append(type(exc).__name__)
    return out


ORDER_LIFE = [(order(1.3172), "PLACED"), (order(1.3168), "AMENDED"), (order(1.3165), "AMENDED")]
TRADE_LIFE = [(position(), "OPEN"), (position(), "REDUCE"), (position(1.32), "CLOSE")]

print("THE CAUSE — with the old one-row rule the 2nd event on a number crashes:")
s.check("order: PLACED then AMENDED, AMENDED", saves(fresh(True), ORDER_LIFE), ["ok", "IntegrityError", "IntegrityError"])
s.check("trade: OPEN then REDUCE, CLOSE (a master's close would never reach followers)",
        saves(fresh(True), TRADE_LIFE), ["ok", "IntegrityError", "IntegrityError"])

print("\nTHE FIX — with the statements db-init.ts now runs, every event is kept:")
db = fresh(False)
s.check("order: PLACED, AMENDED, AMENDED all saved", saves(db, ORDER_LIFE), ["ok", "ok", "ok"])
s.check("trade: OPEN, REDUCE, CLOSE all saved", saves(db, TRADE_LIFE), ["ok", "ok", "ok"])
s.check("...six rows kept", db.query(CopyTradeMaster).count(), 6)
s.check("a repeated CLOSE is still folded onto the first (the dispatcher's own guard)",
        (saves(db, [(position(1.32), "CLOSE")]), db.query(CopyTradeMaster).filter_by(event_type="CLOSE").count()),
        (["ok"], 1))

src = open(repo_path("server", "db-init.ts"), encoding="utf-8").read()
s.teeth("db-init.ts drops the old rule", "DROP INDEX IF EXISTS idx_copy_trades_master_dedup" in src)
s.teeth("...and no longer creates it", not re.search(r"CREATE UNIQUE INDEX[^`]*idx_copy_trades_master_dedup", src))
s.done()
