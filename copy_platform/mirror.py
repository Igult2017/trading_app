"""Mirroring a master's RESTING ORDER — the half of copy trading that was never built.

HIS OBSERVATION IS WHY THIS FILE EXISTS, 2026-09-21: *"if it was working then it would have copied
that trade which was not filled and later cancelled because it should mirror what is happening in
master exactly."* His XAU/USD order was placed at 12:07 and cancelled at 12:10 without ever filling,
and the follower saw none of it — because the engine only ever understood POSITIONS.

The three things that are different about an order, and that everything here exists to handle:

  * IT HAS NOT TRADED. There is no position id, so a mirror is matched back to its master by the
    master's ORDER id, and the position it eventually becomes is found by the LABEL it was placed
    with (`mirror_label`) — those are three different identifiers and mixing them up acts on the
    wrong trade.
  * ITS FILL SENDS NOTHING. The follower's own order is resting at the same price, so it fills BY
    ITSELF. `record_fill_for` writes that down and sends no order at all; sending one would open
    the follower a second time, at a price the master never took.
  * IT CAN DIE UNFILLED, which is the case he watched. That is a cancel on the follower, not a
    close — there is no position to close.

The position path (open, close, modify, the breakeven ladder) stays in `dispatcher.py` untouched.
"""
import logging
from datetime import datetime, timezone
from uuid import uuid4

from db import Session, CopyFollower, CopyTradeMaster, CopyTradeFollower

log = logging.getLogger("dispatcher.mirror")


def mirror_label(master_order_key: str) -> str:
    """The tag a mirrored order carries so its POSITION can be found after it fills.

    An order id and a position id are different numbers, and when the follower's own order fills
    nothing tells us — it is the follower's account, and the engine only listens to masters. The
    label is the one field cTrader carries from the order onto the position it becomes, so it is
    the thread that ties a copied trade back to the master order it came from.
    """
    return f"cp-{master_order_key}"


def find_follower_order_id(follower_id: str, master_ext_id: str):
    """(follower order external_id, placed volume) for the mirror of this MASTER ORDER, or
    (None, None) when no mirror is resting.

    STILL RESTING MEANS: placed, and not since cancelled. The PLACED row is found by the master's
    order id, then the follower's own rows for that same master order are checked for a successful
    CANCELLED — because a cancel that already went through must not be sent twice, and an order
    that has FILLED is a position now and belongs to the position path, not here.
    """
    with Session() as db:
        placed = db.query(CopyTradeFollower).filter_by(
            follower_id=follower_id, event_type="PLACED", status="executed",
        ).join(CopyTradeMaster,
               CopyTradeFollower.master_trade_id == CopyTradeMaster.id
        ).filter(CopyTradeMaster.external_id == master_ext_id
        ).order_by(CopyTradeFollower.executed_at.desc()).first()
        if not placed:
            return None, None
        cancelled = db.query(CopyTradeFollower).filter_by(
            follower_id=follower_id, event_type="CANCELLED", status="executed",
        ).join(CopyTradeMaster,
               CopyTradeFollower.master_trade_id == CopyTradeMaster.id
        ).filter(CopyTradeMaster.external_id == master_ext_id).count()
        if cancelled:
            return None, None
        return placed.external_id, (float(placed.volume) if placed.volume is not None else None)


async def record_fill_for(follower_id: str, master_trade_id: str, snap, order_key: str) -> bool:
    """This follower's mirror of `order_key` filled by itself. Record it, send NOTHING. True when
    it was handled here; False when this follower has no mirror and the fill is an ordinary entry.

    WHY THIS IS THE SUBTLE ONE. Every other event ends in an instruction to the broker; this one
    ends in silence, and silence is the correct answer. Sending a market order here would open the
    follower a SECOND time, at a price the master never took, and the duplicate would sit alongside
    the mirror that filled a moment earlier.

    ASKED PER FOLLOWER, NOT PER MASTER, and that is the whole reason this is not one call up in
    `dispatch`. Followers do not all have a mirror: one may be on a platform that cannot rest an
    order, another may have had its mirror refused by the risk cap. Answering once for the master
    would leave those followers with nothing at all — neither a mirror nor an entry — on a trade
    the master is now in.

    ⚠ NO GATES RUN HERE, deliberately. The session filter and the risk guard had their say when the
    mirror was PLACED. The follower is already in this trade; refusing to write it down would not
    undo it, it would only lose the record needed to get back out.
    """
    from dispatcher import _log                    # circular at module load — see the note below

    mirror_order_id, volume = find_follower_order_id(follower_id, order_key)
    if mirror_order_id is None:
        return False

    # THE FOLLOWER'S POSITION ID IS LOOKED UP, NOT GUESSED, and now is when it first exists.
    # Without it the CLOSE that follows has no position to name and the copy could never be exited
    # — a copied trade nobody can get out of is worse than one that was never opened.
    pos_id, err = await _resolve_mirror_position(follower_id, order_key)
    with Session() as db:
        db.add(CopyTradeFollower(
            id              = str(uuid4()),
            master_trade_id = master_trade_id,
            follower_id     = follower_id,
            external_id     = pos_id,
            symbol          = snap.symbol,
            action          = snap.action,
            event_type      = "OPEN",
            volume          = float(volume) if volume else 0.0,
            entry_price     = snap.entry_price,
            stop_loss       = snap.stop_loss,
            take_profit     = snap.take_profit,
            status          = "executed",
            executed_at     = datetime.now(timezone.utc),
        ))
        db.commit()
    _log(follower_id, master_trade_id, "INFO", "OPEN",
         f"master order {order_key} filled — mirror order {mirror_order_id} filled by itself at "
         f"{snap.entry_price}; nothing sent, which is correct"
         + (f" (follower position {pos_id})" if pos_id else
            f". ⚠ but its position could not be identified ({err}) — a later close will have to "
            f"be done by hand"))
    return True


async def _resolve_mirror_position(follower_id: str, order_key: str):
    """(follower position id, error). Finds the position the mirrored order became, by its label."""
    from cred_manager import get_creds
    from dispatcher import _get_broker_account, _get_executor   # circular at module load; see above
    try:
        with Session() as db:
            follower = db.get(CopyFollower, follower_id)
        broker_account = _get_broker_account(follower) if follower else None
        if not broker_account:
            return None, "no broker account linked"
        creds = await get_creds(broker_account)
        if not creds:
            return None, "credentials unavailable"
        result = await _get_executor(broker_account, creds).find_position_by_label(
            mirror_label(order_key))
        return (result.external_id, None) if result and result.ok else \
               (None, (result.error if result else "no result"))
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"

