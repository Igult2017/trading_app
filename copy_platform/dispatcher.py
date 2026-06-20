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
from cred_manager import get_creds
from lot_calc import calc_lots, apply_direction, is_symbol_allowed
from risk_guard import check_follower_allowed
from providers.ctrader import PositionSnapshot

log = logging.getLogger("dispatcher")


async def dispatch(event: dict, master_id: str) -> None:
    """Called by provider on every OPEN / CLOSE / MODIFY event."""
    snap: PositionSnapshot = event["snap"]
    etype = event["type"]

    with Session() as db:
        master = db.get(CopyMaster, master_id)
        if not master:
            return
        source    = master.source_type or "unknown"
        master_trade = _save_master_trade(db, master_id, snap, etype, source)
        followers    = db.query(CopyFollower).filter_by(
            master_id=master_id, is_active=True, risk_accepted=True
        ).all()

    await asyncio.gather(*[
        _exec_follower(master_trade.id, f, snap, etype)
        for f in followers
    ], return_exceptions=True)


# ── Master trade record ───────────────────────────────────────────────────────

def _save_master_trade(db: DBSession, master_id: str,
                       snap: PositionSnapshot, etype: str,
                       source: str) -> CopyTradeMaster:
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
        source      = source,
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

    creds = await get_creds(broker_account)
    if not creds:
        _log(fid, master_trade_id, "ERROR", "FAIL", "Could not get credentials")
        return

    # Safety guard (max open trades, drawdown / loss) — only gates new OPENs.
    allowed, skip_reason = check_follower_allowed(follower, snap, etype, broker_account)
    if not allowed:
        _log(fid, master_trade_id, "INFO", "SKIP", skip_reason or "blocked by risk guard")
        return

    # Optional per-follower delay before mirroring a new entry.
    if etype == "OPEN" and follower.trade_delay_sec:
        try:
            await asyncio.sleep(int(follower.trade_delay_sec))
        except (TypeError, ValueError):
            pass

    lots     = calc_lots(follower, snap.volume_lots)
    action   = apply_direction(snap.action, follower.direction or "same")
    platform = (broker_account.platform or "").lower()

    # Resolve follower position ID once outside the retry loop (avoids repeated DB hits)
    follower_pos_id: str | None = None
    if etype in ("CLOSE", "MODIFY"):
        follower_pos_id = _find_follower_position_id(fid, str(snap.position_id))
        if follower_pos_id is None:
            _log(fid, master_trade_id, "INFO", "SKIP",
                 f"No open follower position for master pos {snap.position_id}")
            return

    executor = _get_executor(broker_account, creds)
    result   = None

    for attempt in range(1, 4):
        try:
            if etype == "OPEN":
                result = await executor.open_position(
                    snap.symbol, action, lots, snap.stop_loss, snap.take_profit
                )
            elif etype == "CLOSE":
                if platform == "binance":
                    # Binance encodes pos_id as "SYMBOL:SIDE" — use close_by_symbol
                    parts = follower_pos_id.split(":") if follower_pos_id else []
                    if len(parts) == 2:
                        result = await executor.close_by_symbol(parts[0], parts[1], lots)
                else:
                    result = await executor.close_position(int(follower_pos_id), lots)
            elif etype == "MODIFY":
                if platform != "binance":   # Binance modify not supported
                    result = await executor.modify_position(
                        int(follower_pos_id), snap.stop_loss, snap.take_profit
                    )
                else:
                    result = None   # skip modify silently for Binance
            if result and result.ok:
                break
        except Exception as e:
            _log(fid, master_trade_id, "WARN", "RETRY", f"Attempt {attempt} failed: {e}")
            await asyncio.sleep(2 ** attempt)

    _record_follower_trade(master_trade_id, follower, snap, etype, lots, result)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_broker_account(follower: CopyFollower) -> BrokerAccount | None:
    if not follower.broker_account_id:
        return None
    with Session() as db:
        return db.get(BrokerAccount, follower.broker_account_id)


def _get_executor(broker_account: BrokerAccount, creds: dict):
    platform = (broker_account.platform or "").lower()
    acc_type = broker_account.account_type or "demo"
    if platform in ("ctrader", "ct"):
        from executors.ctrader import CTraderExecutor
        return CTraderExecutor(creds=creds, account_type=acc_type)
    if platform == "binance":
        from executors.binance import BinanceExecutor
        return BinanceExecutor(creds=creds, account_type=acc_type)
    if platform == "dxtrade":
        from executors.dxtrade import DXTradeExecutor
        return DXTradeExecutor(creds=creds, account_type=acc_type)
    if platform == "tradelocker":
        from executors.tradelocker import TradeLockerExecutor
        return TradeLockerExecutor(creds=creds, account_type=acc_type)
    raise ValueError(f"No executor for platform: {platform}")


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
    ok  = result is not None and result.ok
    err = result.error if result is not None else "No result"
    with Session() as db:
        db.add(CopyTradeFollower(
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
            error_message   = None if ok else err,
            executed_at     = datetime.utcnow() if ok else None,
        ))
        db.commit()
    level = "INFO" if ok else "ERROR"
    evnt  = etype if ok else "FAIL"
    _log(follower.id, master_trade_id, level, evnt,
         f"{etype} {snap.symbol} {lots} lots — {'ok' if ok else err}")


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
