"""WHEN A MIRRORED ORDER FILLS, NOTHING IS SENT — and the record still has to be right.

This is the subtle half of mirroring a resting order. Every other event ends in an instruction to
the broker; this one ends in SILENCE, because the follower's own order is resting at the same price
and fills by itself. Send a market order here and the follower is opened twice, the second time at
a price the master never took.

THE THREE THINGS THAT CAN GO WRONG, and each has a check below:

  * SILENCE WHEN IT SHOULD SPEAK — a follower with no mirror (its platform cannot rest an order, or
    the risk cap refused it) must still be copied in the ordinary way. Answering once for the whole
    master, rather than per follower, would leave that follower with nothing at all on a trade the
    master is now in.
  * SPEAKING WHEN IT SHOULD BE SILENT — the double entry above.
  * A RECORD THAT CANNOT BE CLOSED — the row must carry the FOLLOWER's position id, or the close
    that follows has no position to name and the copy can never be exited. That is worse than
    never having copied.

Runs against a REAL SQLite database through the real SQLAlchemy models — the queries are the point,
so a stub of them would prove nothing.
"""
import asyncio
import os
import sys
import tempfile

from _harness import Suite

# A real, throwaway database — pointed at BEFORE db.py is imported, since it builds its engine at
# import time from this variable.
_DB = os.path.join(tempfile.mkdtemp(), "mirror_test.sqlite")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"

from datetime import datetime, timezone                                # noqa: E402

from db import Session, Base, engine, CopyTradeMaster, CopyTradeFollower   # noqa: E402
import mirror                                                          # noqa: E402

# ONLY THE TWO TRADE TABLES. `copy_followers` carries a PostgreSQL ARRAY column that SQLite cannot
# render, and nothing here touches that table — building it would fail the file for a reason that
# has nothing to do with what is being tested.
Base.metadata.create_all(engine, tables=[CopyTradeMaster.__table__, CopyTradeFollower.__table__])

s = Suite("COPY — a mirrored order that fills sends nothing, but must still be recorded")

MASTER = "master-1"
ORDER_KEY = "999"           # the master's ORDER id
POS_KEY = "555"             # the position that order became — a DIFFERENT number


class Snap:
    """The fill, as the position path reports it."""
    symbol, action, volume_lots = "XAUUSD", "BUY", 0.1
    entry_price, stop_loss, take_profit = 4375.05, 4367.56, 4405.0
    key = POS_KEY


def seed_mirror(follower_id, follower_order_id="7001", cancelled=False):
    """A master PLACED row and this follower's executed mirror of it."""
    with Session() as d:
        m = CopyTradeMaster(id=f"mt-{follower_id}", master_id=MASTER, external_id=ORDER_KEY,
                            source="ctrader", symbol="XAUUSD", action="BUY",
                            event_type="PLACED", volume=0.1, entry_price=4375.05)
        d.add(m)
        d.add(CopyTradeFollower(id=f"ft-{follower_id}", master_trade_id=m.id,
                                follower_id=follower_id, external_id=follower_order_id,
                                symbol="XAUUSD", action="BUY", event_type="PLACED",
                                volume=0.1, status="executed",
                                executed_at=datetime.now(timezone.utc)))
        if cancelled:
            d.add(CopyTradeFollower(id=f"fc-{follower_id}", master_trade_id=m.id,
                                    follower_id=follower_id, external_id=follower_order_id,
                                    symbol="XAUUSD", action="BUY", event_type="CANCELLED",
                                    volume=0.1, status="executed",
                                    executed_at=datetime.now(timezone.utc)))
        d.commit()


def run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# The position lookup makes a broker call. Stubbed to a known id so the RECORD is what is tested;
# the lookup itself is tested against real protobuf in test_order_mirror.py.
_found = {"pos": "88001", "err": None}
mirror._resolve_mirror_position = lambda fid, key: _async(_found["pos"], _found["err"])


async def _async(a, b):
    return a, b


# ── 1. A FOLLOWER THAT MIRRORED THE ORDER ───────────────────────────────────────────────────────
seed_mirror("f-has-mirror")
handled = run(mirror.record_fill_for("f-has-mirror", "mt-f-has-mirror", Snap(), ORDER_KEY))
s.check("the fill is handled here — nothing is sent to the broker", handled, True)

with Session() as d:
    row = d.query(CopyTradeFollower).filter_by(
        follower_id="f-has-mirror", event_type="OPEN").one_or_none()
s.check("an OPEN row is written for the follower", row is not None, True)
s.check("...carrying the FOLLOWER's position id, not the master's and not the order's",
        row.external_id, "88001")
s.check("...at the price the mirror actually filled", float(row.entry_price), 4375.05)
s.check("...with the size the mirror was placed at", float(row.volume), 0.1)
s.check("...marked executed, because it genuinely is", row.status, "executed")


# ── 2. A FOLLOWER WITH NO MIRROR IS COPIED THE ORDINARY WAY ─────────────────────────────────────
# Its platform cannot rest an order, or the risk cap refused the mirror. Either way the master is
# now IN a trade and this follower has nothing. It must fall through to the normal market entry.
handled = run(mirror.record_fill_for("f-no-mirror", "mt-x", Snap(), ORDER_KEY))
s.check("no mirror -> not handled here, so the ordinary entry path runs", handled, False)
with Session() as d:
    s.check("...and no row is invented for it",
            d.query(CopyTradeFollower).filter_by(follower_id="f-no-mirror").count(), 0)


# ── 3. A MIRROR THAT WAS ALREADY CANCELLED IS NOT A FILL ────────────────────────────────────────
# The order was withdrawn on the follower. Whatever the master did afterwards, there is no mirror
# resting to have filled — treating this as a fill would record a position the follower never took.
seed_mirror("f-cancelled", follower_order_id="7002", cancelled=True)
handled = run(mirror.record_fill_for("f-cancelled", "mt-f-cancelled", Snap(), ORDER_KEY))
s.check("a cancelled mirror is not a fill", handled, False)


# ── 4. THE POSITION COULD NOT BE IDENTIFIED ─────────────────────────────────────────────────────
# The broker call failed or the label was gone. The trade is STILL recorded — the follower is in
# it either way — but with no position id, and the log says so, because a silent blank here is a
# copy nobody can close.
_found.update(pos=None, err="no open position labelled 'cp-999'")
seed_mirror("f-lost", follower_order_id="7003")
handled = run(mirror.record_fill_for("f-lost", "mt-f-lost", Snap(), ORDER_KEY))
s.check("still handled — the follower IS in the trade", handled, True)
with Session() as d:
    row = d.query(CopyTradeFollower).filter_by(
        follower_id="f-lost", event_type="OPEN").one_or_none()
s.check("...recorded with no position id rather than a guessed one", row.external_id, None)
_found.update(pos="88001", err=None)


# ── TEETH ───────────────────────────────────────────────────────────────────────────────────────
# Prove case 2 can actually fail: if the answer were given once per MASTER rather than per
# follower, `f-no-mirror` would have been suppressed by `f-has-mirror`'s mirror existing.
with Session() as d:
    any_mirror = d.query(CopyTradeFollower).filter_by(event_type="PLACED",
                                                      status="executed").count()
s.teeth("a master-wide answer would have suppressed the follower that had no mirror",
        any_mirror > 0 and run(mirror.record_fill_for("f-no-mirror", "mt-x", Snap(),
                                                      ORDER_KEY)) is False)

try:
    s.done()
finally:
    sys.stdout.flush()
