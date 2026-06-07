"""
Dispatcher — receives position events from a master provider and fans out
to all active followers: calculates lot size, applies filters, executes,
records everything in the database.
"""
import asyncio
import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session as DBSession
from db import Session, CopyMaster, CopyFollower, BrokerAccount, \
    CopyTradeMaster, CopyTradeFollower, CopyExecutionLog
from token_manager import get_ctrader_creds
from lot_calc import calc_lots, apply_direction, is_symbol_allowed
from providers.ctrader import PositionSnapshot

log = logging.getLogger("dispatcher")

API_EXECUTOR_MAP = {
    "ctrader": "executors.ctrader.CTraderExecutor",
}


async def dispatch(event: dict, master_id: str) -> None:
    """Called by provider on every OPEN / CLOSE / MODIFY event."""
    snap: PositionSnapshot = event["snap"]
    etype = event["type"]

    with Session() as db:
        master = db.get(CopyMaster, master_id)
        if not master:
            return

        master_trade = _save_master_trade(db, master_id, snap, etype)
        followers    = _active_followers(db, master_id)

    await asyncio.gather(*[
        _exec_follower(master_trade.id, f, snap, etype)
        for f in followers
    ], return_exceptions=True)


# ── Master trade record ───────────────────────────────────────────────────────

def _save_master_trade(db: DBSession, master_id: str,
                       snap: PositionSnapshot, etype: str) -> CopyTradeMaster:
    existing = db.query(CopyTradeMaster).filter_by(
        master_id=master_id,
        external_id=str(snap.position_id),
        event_type=etype,
    ).first()
    if existing:
        return existing

    record = CopyTradeMaster(
        id          = str(uuid4()),
        master_id   = master_id,
        external_id = str(snap.position_id),
        source      = "ctrader",
        symbol      = snap.symbol,
        action      = snap.action,
        event_type  = etype,
        volume      = snap.volume_lots,
        entry_price = snap.entry_price,
        stop_loss   = snap.stop_loss,
        take_profit = snap.take_profit,
        raw_payload = {"position_id": snap.position_id},
        status      = "dispatched",
    )
    db.add(record)
    db.commit()
    return record


def _active_followers(db: DBSession, master_id: str) -> list[CopyFollower]:
    return db.query(CopyFollower).filter_by(
        master_id=master_id, is_active=True, risk_accepted=True
    ).all()


# ── Per-follower execution ────────────────────────────────────────────────────

async def _exec_follower(master_trade_id: str, follower: CopyFollower,
                         snap: PositionSnapshot, etype: str) -> None:
    fid = follower.id

    if not is_symbol_allowed(snap.symbol, follower):
        _log(fid, master_trade_id, "INFO", "SKIP", f"Symbol {snap.symbol} filtered")
        return

    broker_account = _get_broker_account(follower)
    if not broker_account:
        _log(fid, master_trade_id, "ERROR", "FAIL", "No broker account linked")
        return

    creds = await get_ctrader_creds(broker_account)
    if not creds:
        _log(fid, master_trade_id, "ERROR", "FAIL", "Could not get credentials")
        return

    lots   = calc_lots(follower, snap.volume_lots)
    action = apply_direction(snap.action, follower.direction or "same")

    executor = _get_executor(broker_account)
    result   = None

    for attempt in range(1, 4):   # up to 3 retries
        try:
            if etype == "OPEN":
                result = await executor.open_position(
                    snap.symbol, action, lots, snap.stop_loss, snap.take_profit
                )
            elif etype == "CLOSE":
                pos_id = _find_follower_position_id(fid, str(snap.position_id))
                if pos_id:
                    result = await executor.close_position(int(pos_id), lots)
            elif etype == "MODIFY":
                pos_id = _find_follower_position_id(fid, str(snap.position_id))
                if pos_id:
                    result = await executor.modify_position(
                        int(pos_id), snap.stop_loss, snap.take_profit
                    )
            if result and result.ok:
                break
        except Exception as e:
            _log(fid, master_trade_id, "WARN", "RETRY",
                 f"Attempt {attempt} failed: {e}")
            await asyncio.sleep(2 ** attempt)

    _record_follower_trade(master_trade_id, follower, snap, etype, lots, result)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_broker_account(follower: CopyFollower) -> BrokerAccount | None:
    if not follower.broker_account_id:
        return None
    with Session() as db:
        return db.get(BrokerAccount, follower.broker_account_id)


def _get_executor(broker_account: BrokerAccount):
    from executors.ctrader import CTraderExecutor
    return CTraderExecutor(
        creds        = {},   # filled in by caller via get_ctrader_creds
        account_type = broker_account.account_type or "demo",
    )


def _find_follower_position_id(follower_id: str, master_ext_id: str) -> str | None:
    with Session() as db:
        trade = db.query(CopyTradeFollower).filter_by(
            follower_id=follower_id,
            event_type="OPEN",
            status="executed",
        ).join(CopyTradeMaster,
               CopyTradeFollower.master_trade_id == CopyTradeMaster.id
        ).filter(CopyTradeMaster.external_id == master_ext_id).first()
        return trade.external_id if trade else None


def _record_follower_trade(master_trade_id: str, follower: CopyFollower,
                           snap: PositionSnapshot, etype: str,
                           lots: float, result) -> None:
    with Session() as db:
        ok = result and result.ok
        record = CopyTradeFollower(
            id              = str(uuid4()),
            master_trade_id = master_trade_id,
            follower_id     = follower.id,
            external_id     = result.external_id if ok else None,
            symbol          = snap.symbol,
            action          = snap.action,
            event_type      = etype,
            volume          = lots,
            entry_price     = result.entry_price if ok else None,
            stop_loss       = snap.stop_loss,
            take_profit     = snap.take_profit,
            status          = "executed" if ok else "failed",
            error_message   = result.error if result else "No result",
            executed_at     = datetime.utcnow() if ok else None,
        )
        db.add(record)
        db.commit()
    level = "INFO" if ok else "ERROR"
    event = etype if ok else "FAIL"
    _log(follower.id, master_trade_id, level, event,
         f"{etype} {snap.symbol} {lots} lots — {'ok' if ok else result.error}")


def _log(follower_id: str, trade_id: str, level: str, event: str, msg: str):
    log.info(f"[{follower_id}] {level} {event}: {msg}")
    try:
        with Session() as db:
            db.add(CopyExecutionLog(
                id=str(uuid4()), follower_id=follower_id, trade_id=trade_id,
                level=level, event=event, message=msg,
            ))
            db.commit()
    except Exception:
        pass
