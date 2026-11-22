"""THE MASTER'S BOOK — what each master holds, remembered across a gap (22 Nov 2026, plan step 2).

THE GAP IT CLOSES. On a restart the listener loaded each master SILENTLY (`providers/ctrader.py`, "record, no diff"),
so anything the master did while the copier was down — closed a trade, moved his stop to breakeven, moved or cancelled
a pending order — never reached a follower. A master CLOSE during a restart left the follower's trade OPEN. And the
catch-up that did run compared only size and existence, never stop / target or pending orders.

NOW. The book is kept on disk (`copy_master_book`) and updated as events arrive. After ANY gap the master's state is
read once and compared with the book; EVERY difference becomes the copy action it is. Only a master with no book at all
(newly added) is loaded silently — copying everything already open on a new master would be wrong.

WHICH ORDER BECAME WHICH TRADE. A pending order that vanished during the gap either FILLED or was CANCELLED, and the two
need opposite handling: a fill sends the follower NOTHING (its own mirrored order filled by itself, `mirror.py`) and the
new trade carries the order id so the dispatcher knows it (`dispatcher.py`, `record_fill_for`); a cancel cancels the
follower's order. `filled_from` (position id -> order id, from the deals made during the gap) decides it. Without it
the old catch-up emitted OPEN with no order id — a follower whose mirrored order had filled would be entered TWICE.

cTrader numbers no events, so after a gap STATES are compared, not events replayed: a stop moved and moved back inside
the gap is invisible — and harmless, the end state being the same.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict

log = logging.getLogger("copy.book")


def _reduced(before, after) -> float | None:
    """How much of a still-open trade was closed (0-1), or None if it did not shrink. Same rule as the live path."""
    try:
        before, after = float(before or 0), float(after or 0)
    except (TypeError, ValueError):
        return None
    if before <= 0 or after <= 0 or after >= before - 1e-9:
        return None
    return (before - after) / before


def _levels(x) -> tuple:
    return (x.stop_loss, x.take_profit)


def diff(book_pos: dict, book_ord: dict, fresh_pos: dict, fresh_ord: dict, filled_from: dict) -> list[dict]:
    """The copy actions that take the followers from the book to the master's state NOW.

    book_pos / fresh_pos: {position_id: PositionSnapshot}; book_ord / fresh_ord: {order_id: OrderSnapshot};
    filled_from: {position_id: order_id} for trades the master's pending orders became during the gap.
    Closes and cancels come first, so a follower never holds more than the master did.
    """
    out: list[dict] = []
    for pid, prev in book_pos.items():
        if pid not in fresh_pos:
            out.append({"type": "CLOSE", "snap": prev})
    filled_orders = set(filled_from.values())
    for oid, prev in book_ord.items():
        if oid not in fresh_ord and oid not in filled_orders:
            out.append({"type": "CANCELLED", "order": prev})
    for pid, snap in fresh_pos.items():
        prev = book_pos.get(pid)
        if prev is None:
            out.append({"type": "OPEN", "snap": snap, "master_order_id": filled_from.get(pid)})
            continue
        frac = _reduced(prev.volume_lots, snap.volume_lots)
        if frac:
            out.append({"type": "REDUCE", "snap": snap, "fraction": frac})
        if _levels(prev) != _levels(snap):
            out.append({"type": "MODIFY", "snap": snap, "prev": prev})
    for oid, o in fresh_ord.items():
        prev = book_ord.get(oid)
        if prev is None:
            out.append({"type": "PLACED", "order": o})
        elif (prev.price, prev.volume_lots) + _levels(prev) != (o.price, o.volume_lots) + _levels(o):
            out.append({"type": "AMENDED", "order": o})
    # A pending order that filled AND closed inside the gap left no trade to compare: its follower's mirror filled by
    # itself too, and is closed by the repair check (`sweep.py`: a copy whose master trade is closed). Said, not hidden.
    for pid, oid in filled_from.items():
        if pid not in fresh_pos and pid not in book_pos:
            log.warning(f"order {oid} filled and its trade {pid} closed during the gap — left to the repair check")
    return out


def to_json(positions: dict, orders: dict) -> str:
    return json.dumps({"positions": [asdict(p) for p in positions.values()],
                       "orders": [asdict(o) for o in orders.values()]})


def from_json(text: str) -> tuple[dict, dict]:
    from providers.ctrader import OrderSnapshot, PositionSnapshot
    d = json.loads(text)
    pos = {int(p["position_id"]): PositionSnapshot(**p) for p in d.get("positions", [])}
    ords = {int(o["order_id"]): OrderSnapshot(**o) for o in d.get("orders", [])}
    return pos, ords


def load(master_id: str, session_factory=None) -> tuple[dict, dict] | None:
    """The master's last remembered book, or None when there is none (a new master — loaded silently)."""
    from sqlalchemy import text
    if session_factory is None:
        from db import Session as session_factory
    with session_factory() as db:
        row = db.execute(text("SELECT book FROM copy_master_book WHERE master_id = :m"), {"m": master_id}).first()
    return from_json(row[0] if isinstance(row[0], str) else json.dumps(row[0])) if row else None


def save(master_id: str, positions: dict, orders: dict, session_factory=None) -> None:
    from sqlalchemy import text
    if session_factory is None:
        from db import Session as session_factory
    with session_factory() as db:
        db.execute(text("INSERT INTO copy_master_book (master_id, book, updated_at) VALUES (:m, CAST(:b AS JSONB), NOW()) "
                        "ON CONFLICT (master_id) DO UPDATE SET book = EXCLUDED.book, updated_at = NOW()"),
                   {"m": master_id, "b": to_json(positions, orders)})
        db.commit()
