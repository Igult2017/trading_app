"""EVERY COPY OF ONE MASTER TRADE ON A FOLLOWER'S ACCOUNT — found at the broker by its label, not taken from the record.

WHY THIS EXISTS — the GBP/USD loss of 23 Nov 2026 (ctrader4, −$109.44; `docs/copy-platform.md`). A copy of the master's
order went onto the follower's account although the copier had recorded it as failed, and the master's fill was then
copied AGAIN as a market order. Two copies; the copier knew one. Every stop move — the breakeven — and the close went to
the one on record only (`dispatcher._find_follower_position_id`), so the other kept its first stop and lost.

The same blind spot without any fault: a copy of an order that fills on the follower AFTER the master's fill (2 minutes
later that morning) has no position on record yet, and every stop move was skipped ("No open follower position").

So a stop move, a close or a part-close on cTrader first reads the follower's account and acts on EVERY open position
carrying the copier's mark for this trade: `cp-<master position>` (a market copy) or `cp-<master order>` (a copy of
the order it filled from). The label is the one thing the broker carries from a copied order onto its position
(`mirror.mirror_label`). Pure helpers here; the dispatcher does the acting.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from mirror import mirror_label

log = logging.getLogger("dispatcher.linked")


@dataclass
class Copy:
    """One open position on the follower's account that copies the master trade."""
    position_id: str
    raw_volume: int                  # the broker's own size (cents of a unit) — closes it exactly
    lots: float | None               # from the contract spec; None when the spec is not cached
    stop_loss: float | None
    take_profit: float | None
    label: str


def labels(master_pos_key, master_order_id=None) -> set[str]:
    """The marks a copy of this master trade can carry."""
    out = {mirror_label(str(master_pos_key))}
    if master_order_id:
        out.add(mirror_label(str(master_order_id)))
    return out


def master_order_of(master_id: str, master_pos_key: str) -> str | None:
    """Which master ORDER this master position filled from — kept on the master's OPEN record (`from_order`) so it
    survives a restart (the master listener only holds it in memory, `providers/ctrader.origin`)."""
    from db import Session, CopyTradeMaster
    with Session() as db:
        row = (db.query(CopyTradeMaster)
                 .filter_by(master_id=master_id, external_id=str(master_pos_key), event_type="OPEN")
                 .order_by(CopyTradeMaster.created_at.desc()).first())
    raw = (row.raw_payload or {}) if row is not None else {}
    oid = raw.get("from_order") if isinstance(raw, dict) else None
    return str(oid) if oid else None


def _lots(acct: int, pos) -> float | None:
    import symbol_details
    spec = symbol_details.get(acct, pos.tradeData.symbolId)
    size = getattr(spec, "lotSize", 0) if spec is not None else 0
    return round(pos.tradeData.volume / size, 2) if size else None


def open_copies(account, acct: int, labs: set[str], recorded_id: str | None = None) -> list[Copy]:
    """Every open position on the account carrying one of `labs` — plus the recorded position if it is still open and
    somehow unmarked (a copy from before every copy was marked, 27 Sep 2026)."""
    out = []
    for p in getattr(account, "position", ()):
        label = getattr(p.tradeData, "label", "") or ""
        if label in labs or (recorded_id and str(p.positionId) == str(recorded_id)):
            out.append(Copy(str(p.positionId), int(p.tradeData.volume), _lots(acct, p),
                            float(p.stopLoss) if p.stopLoss else None,
                            float(p.takeProfit) if p.takeProfit else None, label))
    return out


def resting_copies(account, labs: set[str]) -> list[str]:
    """Order ids of copy orders still resting with one of `labs` — a copy of the master's order that never filled."""
    return [str(o.orderId) for o in getattr(account, "order", ())
            if (getattr(o.tradeData, "label", "") or "") in labs]


def adopt(follower_id: str, master_trade_id: str, snap, copy: Copy | None, order_id: str | None) -> None:
    """Write down a copy found already on the account as this follower's copy of the master's fill — nothing sent.
    `copy` = the position; None while it is still an order (`order_id`), which the label finds once it fills."""
    from db import Session, CopyTradeFollower
    with Session() as db:
        db.add(CopyTradeFollower(
            id=str(uuid4()), master_trade_id=master_trade_id, follower_id=follower_id,
            external_id=copy.position_id if copy else None, symbol=snap.symbol, action=snap.action,
            event_type="OPEN", volume=(copy.lots if copy and copy.lots else 0.0), entry_price=snap.entry_price,
            stop_loss=snap.stop_loss, take_profit=snap.take_profit, status="executed",
            executed_at=datetime.now(timezone.utc)))
        db.commit()


def correct_record(follower_id: str, master_ext_id: str, position_id: str) -> None:
    """The copier's OPEN record for this copy had no position (a copied order that filled after the master's): the
    position found at the broker is written in, so the record is right again."""
    from db import Session, CopyTradeFollower, CopyTradeMaster
    with Session() as db:
        row = (db.query(CopyTradeFollower)
                 .join(CopyTradeMaster, CopyTradeFollower.master_trade_id == CopyTradeMaster.id)
                 .filter(CopyTradeFollower.follower_id == follower_id, CopyTradeMaster.external_id == master_ext_id,
                         CopyTradeFollower.event_type == "OPEN", CopyTradeFollower.status == "executed",
                         CopyTradeFollower.external_id.is_(None))
                 .order_by(CopyTradeFollower.executed_at.desc()).first())
        if row is not None:
            row.external_id = str(position_id)
            db.commit()


# ── WHAT THE DISPATCHER CALLS ──────────────────────────────────────────────────────────────────────────────────────────

async def hidden_copy(executor, fid: str, master_trade_id: str, snap, master_order_id) -> bool:
    """Before a market copy of a master fill that came from an order: is a copy ALREADY on the account? True = handled
    here (written down, nothing sent) — the caller must not open. Unreadable account = True as well, refused out loud:
    a missed entry is safer than a second one (the dispatcher's own rule for entries, `dispatcher._exec_follower`)."""
    from dispatcher import _log, run_db          # the dispatcher's own way to the database (one place to stand in)
    read = await executor.read_account()
    if not (read and read.ok and read.account is not None):
        _log(fid, master_trade_id, "ERROR", "FAIL",
             f"{snap.symbol}: could not read your account to check for a copy already there "
             f"({read.error if read else 'no answer'}) — NOT copied, so it can never be opened twice")
        return True
    labs = labels(snap.key, master_order_id)
    acct = int(executor.creds["ctraderId"])
    found = open_copies(read.account, acct, labs)
    orders = resting_copies(read.account, labs)
    if not found and not orders:
        return False
    first = found[0] if found else None
    await run_db(adopt, fid, master_trade_id, snap, first, None if first else orders[0])
    _log(fid, master_trade_id, "WARNING", "OPEN",
         f"{snap.symbol}: a copy of this trade is ALREADY on your account "
         + (f"(position {first.position_id})" if first else f"(order {orders[0]}, not filled yet)")
         + " — written down as your copy; no second order sent")
    return True


async def every_copy(make_executor, follower, snap, etype: str, master_order_id) -> list[Copy] | None:
    """Every open copy of this master trade on the follower's account, for a stop move / close / part-close. A close
    also cancels a copy ORDER of it still resting (its master order filled; the trade is now over).
    None = account unreadable → the caller uses the one on record, as before; [] = nothing open by label.
    `make_executor()` gives a fresh one-shot executor for the follower's account (one per request)."""
    from dispatcher import _log, _find_follower_position_id, run_db
    executor = make_executor()
    read = await executor.read_account()
    if not (read and read.ok and read.account is not None):
        log.warning("[linked] %s: account unreadable (%s) — using the copy on record", follower.id,
                    read.error if read else "no answer")
        return None
    oid = master_order_id or await run_db(master_order_of, follower.master_id, snap.key)
    labs = labels(snap.key, oid)
    recorded_id, _ = await run_db(_find_follower_position_id, follower.id, snap.key)
    acct = int(executor.creds["ctraderId"])
    found = open_copies(read.account, acct, labs, recorded_id)
    if found and not recorded_id:
        await run_db(correct_record, follower.id, snap.key, found[0].position_id)
    if len(found) > 1 or (found and recorded_id and found[0].position_id != str(recorded_id)):
        _log(follower.id, None, "WARNING", etype,
             f"{snap.symbol}: {len(found)} copies of this master trade are on your account (positions "
             f"{', '.join(c.position_id for c in found)}) — each one gets this change")
    if etype == "CLOSE":
        import dispatcher
        for order_id in resting_copies(read.account, labs):
            if dispatcher.COPY_DRY_RUN:          # a dry run sends nothing — a cancel included
                _log(follower.id, None, "INFO", "DRY_RUN", f"WOULD cancel your copy order {order_id} that never "
                                                           f"filled — dry run, nothing sent")
                continue
            # (the kill switch does NOT stop it: withdrawing an order is the safe direction — `dispatcher._exec_follower`)
            r = await make_executor().cancel_pending(int(order_id))
            _log(follower.id, None, "WARNING" if r.ok else "ERROR", "CANCELLED",
                 f"{snap.symbol}: the master's trade is closed — your copy order {order_id} that never filled "
                 + ("cancelled" if r.ok else f"could NOT be cancelled ({r.error}) — cancel it by hand"))
    return found
