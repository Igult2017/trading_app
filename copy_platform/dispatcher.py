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
from lot_calc import calc_lots, apply_direction, is_symbol_allowed, pip_size, pip_value
from risk_guard import check_follower_allowed
from providers.ctrader import PositionSnapshot

log = logging.getLogger("dispatcher")

# One lock per master so the OPEN duplicate-check + master-row insert is ATOMIC.
# Provider events fire as independent asyncio tasks, so without this two concurrent
# OPENs for the same position could both pass the duplicate guard and place two live
# entries. The lock is held only for the dedup+save critical section, not the (slow)
# follower fan-out, so masters still process concurrently with each other.
_master_locks: dict[str, asyncio.Lock] = {}


async def dispatch(event: dict, master_id: str) -> None:
    """Called by provider on every OPEN / CLOSE / MODIFY event."""
    snap: PositionSnapshot = event["snap"]
    etype = event["type"]

    lock = _master_locks.setdefault(master_id, asyncio.Lock())
    async with lock:                       # atomic dedup + master-row insert per master
        with Session() as db:
            master = db.get(CopyMaster, master_id)
            if not master:
                return
            source    = master.source_type or "unknown"

            # Idempotency for OPEN: never mirror an entry for a position/symbol that is
            # already open (Telegram edits/re-posts, or any duplicate OPEN event) — the
            # main double-entry guard. A re-open after a close is allowed because by then
            # opens == closes for the key.
            if etype == "OPEN":
                ext    = str(snap.position_id)
                opens  = db.query(CopyTradeMaster).filter_by(
                    master_id=master_id, external_id=ext, event_type="OPEN").count()
                closes = db.query(CopyTradeMaster).filter_by(
                    master_id=master_id, external_id=ext, event_type="CLOSE").count()
                if opens > closes:
                    log.info("[dispatch] duplicate OPEN for %s (already open) — skipping", ext)
                    return

            master_trade    = _save_master_trade(db, master_id, snap, etype, source)
            master_trade_id = master_trade.id      # capture before the session/lock release
            followers       = db.query(CopyFollower).filter_by(
                master_id=master_id, is_active=True, risk_accepted=True
            ).all()

    if not followers:
        log.info("[dispatch] master %s: no active+risk-accepted followers for this %s", master_id, etype)
        return

    await asyncio.gather(*[
        _exec_follower(master_trade_id, f, snap, etype)
        for f in followers
    ], return_exceptions=True)


# ── Master trade record ───────────────────────────────────────────────────────

def _save_master_trade(db: DBSession, master_id: str,
                       snap: PositionSnapshot, etype: str,
                       source: str) -> CopyTradeMaster:
    # OPEN always gets a fresh row — dispatch() already guards against a duplicate
    # open, so any OPEN reaching here is a genuine new entry (incl. re-opening a
    # symbol after a prior close). CLOSE/MODIFY dedupe so a synthetic+real duplicate
    # (e.g. the reconcile CLOSE racing the live CLOSE) never creates two rows.
    if etype != "OPEN":
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
        closed_price= getattr(snap, "closed_price", None),   # exit price on CLOSE rows
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
    # Wrap the WHOLE body: any unexpected error (DB, decrypt, executor construction…)
    # must be logged + recorded, never silently swallowed by the caller's gather().
    try:
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

        # Safety guard (max open trades, daily loss, drawdown) — only gates new OPENs.
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

        platform = (broker_account.platform or "").lower()
        action   = apply_direction(snap.action, follower.direction or "same")
        if (follower.direction or "").lower() == "hedge" and platform in ("ctrader", "ct"):
            log.warning("[%s] 'hedge' on cTrader (netting account): opens the opposite side, "
                        "which NETS against any existing position rather than hedging it.", fid)

        # On reverse/hedge the side flips, so SL and TP swap to stay on the correct side
        # of the reversed position (master's stop becomes the follower's target).
        sl_price, tp_price = snap.stop_loss, snap.take_profit
        if snap.action and action != snap.action:
            sl_price, tp_price = snap.take_profit, snap.stop_loss

        # Resolve the follower's open position (id + recorded volume) for CLOSE/MODIFY.
        follower_pos_id: str | None = None
        open_vol: float | None = None
        if etype in ("CLOSE", "MODIFY"):
            follower_pos_id, open_vol = _find_follower_position_id(fid, str(snap.position_id))
            if follower_pos_id is None:
                _log(fid, master_trade_id, "INFO", "SKIP",
                     f"No open follower position for master pos {snap.position_id}")
                return

        if etype == "OPEN":
            # Risk inputs for risk-% sizing (per-symbol pip value; approximate off USD pairs).
            sl_pips = None
            if snap.entry_price and snap.stop_loss:
                ps = pip_size(snap.symbol)
                if ps > 0:
                    sl_pips = abs(float(snap.entry_price) - float(snap.stop_loss)) / ps
            try:
                equity = float(broker_account.balance) if broker_account.balance is not None else None
            except (TypeError, ValueError):
                equity = None
            lots = calc_lots(follower, snap.volume_lots, sl_pips=sl_pips,
                             follower_equity=equity, pip_value=pip_value(snap.symbol))
            if lots <= 0:
                _log(fid, master_trade_id, "INFO", "SKIP",
                     "No valid lot size (mult mode with no master/fixed volume)")
                return
        else:
            # CLOSE/MODIFY: use the follower's RECORDED open volume so a close fully exits
            # (re-calculating could under/over-fill and strand size). Fall back to calc_lots.
            lots = open_vol if (open_vol and open_vol > 0) else calc_lots(
                follower, snap.volume_lots, follower_equity=None)

        executor = _get_executor(broker_account, creds)
        result   = None

        # OPEN is never retried: a retry after an ambiguous failure (e.g. the fill
        # confirmation lost to a timeout) could place a SECOND live position. A missed
        # entry is far safer than a duplicate one. CLOSE/MODIFY are idempotent-ish
        # (closing an already-closed position just no-ops), so they keep retrying.
        max_attempts = 1 if etype == "OPEN" else 3
        for attempt in range(1, max_attempts + 1):
            try:
                if etype == "OPEN":
                    result = await executor.open_position(
                        snap.symbol, action, lots, sl_price, tp_price
                    )
                elif etype == "CLOSE":
                    if platform == "binance":
                        parts = follower_pos_id.split(":") if follower_pos_id else []
                        if len(parts) == 2:
                            result = await executor.close_by_symbol(parts[0], parts[1], lots)
                    else:
                        result = await executor.close_position(int(follower_pos_id), lots)
                elif etype == "MODIFY":
                    if platform != "binance":   # Binance modify not supported
                        result = await executor.modify_position(
                            int(follower_pos_id), sl_price, tp_price
                        )
                    else:
                        result = None   # skip modify silently for Binance
                if result and result.ok:
                    break
            except Exception as e:
                _log(fid, master_trade_id, "WARN", "RETRY", f"Attempt {attempt} failed: {e}")
                if attempt < max_attempts:
                    await asyncio.sleep(2 ** attempt)

        # A CLOSE that exhausted its retries leaves a live position — surface it loudly.
        if etype == "CLOSE" and not (result and result.ok):
            log.error("[%s] CLOSE FAILED for master pos %s — follower may still hold the "
                      "position; manual flatten may be required.", fid, snap.position_id)

        _record_follower_trade(master_trade_id, follower, snap, etype, lots, result,
                               exec_action=action, exec_sl=sl_price, exec_tp=tp_price)
    except Exception as e:
        log.exception("[%s] _exec_follower crashed (%s %s)", fid, etype, snap.symbol)
        _log(fid, master_trade_id, "ERROR", "FAIL", f"unexpected error: {e}")
        try:
            _record_follower_trade(master_trade_id, follower, snap, etype, 0.0, None)
        except Exception:
            pass


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


def _find_follower_position_id(follower_id: str, master_ext_id: str):
    """Return (follower position external_id, recorded open volume) for the MOST-RECENT
    executed OPEN matching this master position, or (None, None). Ordering by recency
    means a re-opened symbol closes the latest position, not a stale earlier one."""
    with Session() as db:
        trade = db.query(CopyTradeFollower).filter_by(
            follower_id=follower_id,
            event_type="OPEN",
            status="executed",
        ).join(CopyTradeMaster,
               CopyTradeFollower.master_trade_id == CopyTradeMaster.id
        ).filter(CopyTradeMaster.external_id == master_ext_id
        ).order_by(CopyTradeFollower.executed_at.desc()).first()
        if not trade:
            return None, None
        return trade.external_id, (float(trade.volume) if trade.volume is not None else None)


def _record_follower_trade(master_trade_id: str, follower: CopyFollower,
                           snap: PositionSnapshot, etype: str,
                           lots: float, result,
                           exec_action: str | None = None,
                           exec_sl=None, exec_tp=None) -> None:
    ok  = result is not None and result.ok
    err = result.error if result is not None else "No result"
    with Session() as db:
        db.add(CopyTradeFollower(
            id              = str(uuid4()),
            master_trade_id = master_trade_id,
            follower_id     = follower.id,
            external_id     = result.external_id if ok else None,
            symbol          = snap.symbol,
            # Record the side/SL/TP we ACTUALLY placed (these differ from the master's on
            # reverse/hedge followers), not the master's originals.
            action          = exec_action or snap.action,
            event_type      = etype,
            volume          = lots,
            entry_price     = result.entry_price if ok else None,
            stop_loss       = exec_sl if exec_sl is not None else snap.stop_loss,
            take_profit     = exec_tp if exec_tp is not None else snap.take_profit,
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
