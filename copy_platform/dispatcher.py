"""
Dispatcher — receives position events from a master provider and fans out
to all active followers: calculates lot size, applies filters, executes,
records everything in the database.
"""
import asyncio
import logging
from datetime import datetime, timezone
from uuid import uuid4

from config import COPY_ENABLED, COPY_DRY_RUN, COPY_MAX_CONCURRENT_FOLLOWERS
from db_io import run_db

from sqlalchemy.orm import Session as DBSession
from db import Session, CopyMaster, CopyFollower, BrokerAccount, \
    CopyTradeMaster, CopyTradeFollower, CopyExecutionLog
from cred_manager import get_creds
from lot_calc import calc_lots, apply_direction, is_symbol_allowed, pip_size, pip_value
from session_filter import is_session_allowed
from risk_guard import check_follower_allowed, check_trade_risk
from providers.ctrader import PositionSnapshot
import mirror

log = logging.getLogger("dispatcher")

# One lock per master so the OPEN duplicate-check + master-row insert is ATOMIC.
# Provider events fire as independent asyncio tasks, so without this two concurrent
# OPENs for the same position could both pass the duplicate guard and place two live
# entries. The lock is held only for the dedup+save critical section, not the (slow)
# follower fan-out, so masters still process concurrently with each other.
_master_locks: dict[str, asyncio.Lock] = {}



async def dispatch(event: dict, master_id: str) -> None:
    """Called by provider on every PLACED / AMENDED / CANCELLED / OPEN / CLOSE / MODIFY event."""
    etype = event["type"]
    # AN ORDER EVENT CARRIES AN `order`, A POSITION EVENT CARRIES A `snap`. Both answer `.key`
    # (the master's id for the thing) and both carry symbol/action/size/stop/target, so everything
    # below — the filters, the sizing, the risk cap, the recording — runs once for both rather
    # than being written a second time for orders and drifting away from this one.
    snap = event.get("snap") or event["order"]

    lock = _master_locks.setdefault(master_id, asyncio.Lock())
    async with lock:                       # atomic dedup + master-row insert per master
        # ON A WORKER THREAD, NOT THE EVENT LOOP. This whole block is 4-5 blocking queries, and it
        # runs under the master's lock — so on the loop it stopped the engine for every event, for
        # every master, one after another. The lock still makes it atomic; it is simply no longer
        # atomic AND blocking.
        got = await run_db(_claim_event, master_id, snap, etype)
        if got is None:
            return
        master_trade_id, followers = got

    if not followers:
        # NOBODY TO COPY TO IS ITSELF AN ANSWER, AND IT HAS TO REACH THE SCREEN. This logged one line
        # naming the master by uuid and wrote NOTHING to the execution log — so a trade that failed to
        # copy because every follower was switched off, or had never accepted the risk terms, left no
        # trace at all in the Activity tab: the master traded and the record was simply blank.
        #
        # One row per LINKED follower now, each naming its own account and the reason it was passed
        # over, because "switched off" and "risk terms not accepted" need different fixes.
        try:
            with Session() as db:
                linked = db.query(CopyFollower).filter_by(master_id=master_id).all()
        except Exception:
            linked = []
        for f in linked:
            why = ("this copier is switched off (Active subscription)" if not f.is_active else
                   "the risk terms have not been accepted for this copier" if not f.risk_accepted
                   else "not eligible for this event")
            _log(f.id, master_trade_id, "INFO", "SKIP", f"Not copied — {why}")
        if not linked:
            log.info("[dispatch] master %s: no followers are linked to it at all, so this %s "
                     "was not copied anywhere", master_id, etype)
        return

    # BOUNDED FAN-OUT (2026-09-26). This gathered EVERY follower at once. With 500 followers that is
    # 500 simultaneous broker requests, and cTrader allows 50 per second per connection
    # (https://help.ctrader.com/open-api/) — so an unbounded burst does not go faster, it gets the
    # application throttled. The gateway's token bucket enforces the broker's rule; this stops the
    # queue in front of it growing without limit, and keeps memory flat at any follower count.
    await asyncio.gather(*[
        _exec_follower_bounded(master_trade_id, f, snap, etype, event.get("master_order_id"))
        for f in followers
    ], return_exceptions=True)


# One slot per concurrent follower execution, for the whole process.
_fanout = asyncio.Semaphore(COPY_MAX_CONCURRENT_FOLLOWERS)


async def _exec_follower_bounded(master_trade_id, follower, snap, etype, master_order_id=None):
    async with _fanout:
        await _exec_follower(master_trade_id, follower, snap, etype, master_order_id)


def _claim_event(master_id: str, snap, etype: str):
    """The dedup + master-row insert + follower read, as ONE blocking unit for `run_db`.

    Returns (master_trade_id, followers), or None when this event must not be copied at all.

    WHY IT IS ONE FUNCTION. These queries have to see the same snapshot of the table as each other
    — the duplicate check is only meaningful if the insert that follows it cannot be raced. Keeping
    them in one session, called once, under the caller's per-master lock, preserves exactly the
    atomicity the lock was added for in the first place.
    """
    with Session() as db:
        master = db.get(CopyMaster, master_id)
        if not master:
            return None
        source = master.source_type or "unknown"

        # Idempotency for OPEN: never mirror an entry for a position/symbol that is already open
        # (Telegram edits/re-posts, or any duplicate OPEN event) — the main double-entry guard. A
        # re-open after a close is allowed because by then opens == closes for the key.
        if etype == "OPEN":
            ext    = snap.key
            opens  = db.query(CopyTradeMaster).filter_by(
                master_id=master_id, external_id=ext, event_type="OPEN").count()
            closes = db.query(CopyTradeMaster).filter_by(
                master_id=master_id, external_id=ext, event_type="CLOSE").count()
            if opens > closes:
                log.info("[dispatch] duplicate OPEN for %s (already open) — skipping", ext)
                return None

        # The same guard for a resting order: a re-sent PLACED must not put a second mirror on the
        # book. An order that was cancelled and placed again is a genuinely new order with a new
        # id, so it is never caught by this.
        if etype == "PLACED":
            placed = db.query(CopyTradeMaster).filter_by(
                master_id=master_id, external_id=snap.key, event_type="PLACED").count()
            if placed:
                log.info("[dispatch] duplicate PLACED for order %s — skipping", snap.key)
                return None

        master_trade = _save_master_trade(db, master_id, snap, etype, source)
        followers    = db.query(CopyFollower).filter_by(
            master_id=master_id, is_active=True, risk_accepted=True).all()
        return master_trade.id, followers


# ── Master trade record ───────────────────────────────────────────────────────

def _save_master_trade(db: DBSession, master_id: str,
                       snap: PositionSnapshot, etype: str,
                       source: str) -> CopyTradeMaster:
    # OPEN always gets a fresh row — dispatch() already guards against a duplicate
    # open, so any OPEN reaching here is a genuine new entry (incl. re-opening a
    # symbol after a prior close). CLOSE/MODIFY dedupe so a synthetic+real duplicate
    # (e.g. the reconcile CLOSE racing the live CLOSE) never creates two rows.
    # AMENDED IS EXEMPT FROM THE DEDUP, because the master can legitimately move one order many
    # times — a trailing entry moves with the market — and every move is a different instruction.
    # Folding them onto one row would leave the mirror resting at the FIRST price for ever.
    if etype not in ("OPEN", "AMENDED"):
        existing = db.query(CopyTradeMaster).filter_by(
            master_id=master_id,
            external_id=snap.key,
            event_type=etype,
        ).first()
        if existing:
            return existing

    record = CopyTradeMaster(
        id          = str(uuid4()),
        master_id   = master_id,
        external_id = snap.key,
        source      = source,
        symbol      = snap.symbol,
        action      = snap.action,
        event_type  = etype,
        volume      = snap.volume_lots,
        entry_price = snap.entry_price,
        stop_loss   = snap.stop_loss,
        take_profit = snap.take_profit,
        closed_price= getattr(snap, "closed_price", None),   # exit price on CLOSE rows
        raw_payload = ({"order_id": snap.order_id, "order_type": snap.order_type}
                       if hasattr(snap, "order_id") else {"position_id": snap.position_id}),
        status      = "dispatched",
    )
    db.add(record)
    db.commit()
    return record


# ── Per-follower execution ────────────────────────────────────────────────────

async def _exec_follower(master_trade_id: str, follower: CopyFollower,
                         snap: PositionSnapshot, etype: str,
                         master_order_id=None) -> None:
    fid = follower.id
    # PUTTING A MIRROR ON THE BOOK IS AN ENTRY, so it faces every gate a fill faces: the session
    # filter, the safety guards, risk-% sizing and the 3% per-trade cap. The alternative — place
    # first and check when it fills — would put an order on the account that the follower's own
    # limits say must never be taken, and by then it is the market's decision, not ours.
    is_entry = etype in ("OPEN", "PLACED")
    # Wrap the WHOLE body: any unexpected error (DB, decrypt, executor construction…)
    # must be logged + recorded, never silently swallowed by the caller's gather().
    try:
        # THE MASTER'S ORDER FILLED AND THIS FOLLOWER MIRRORED IT — so the follower's own order
        # filled by itself and there is nothing to send. Checked FIRST, before any gate: the
        # follower is already in this trade, and a gate that refused now would not undo the
        # position, only lose the record needed to close it.
        if etype == "OPEN" and master_order_id is not None:
            if await mirror.record_fill_for(fid, master_trade_id, snap, str(master_order_id)):
                return

        if not is_symbol_allowed(snap.symbol, follower):
            _log(fid, master_trade_id, "INFO", "SKIP", f"Symbol {snap.symbol} filtered")
            return

        # THE SESSION GATE APPLIES TO ENTRIES ONLY, and that is the whole point of the etype check.
        # Gating a CLOSE would strand him in a live position because London happened to shut — the
        # filter is about when to ENTER a copied trade, never about whether he may get out of one.
        # PLACED counts as an entry: putting the mirror on the book IS the decision to enter.
        # AMENDED and CANCELLED do not — they move or withdraw an order that is already there, and
        # refusing a cancel because the session closed would leave a live order nobody wanted.
        if is_entry:
            in_session, why = is_session_allowed(follower)
            if not in_session:
                _log(fid, master_trade_id, "INFO", "SKIP", why or "outside the allowed sessions")
                return

        broker_account = await run_db(_get_broker_account, follower)
        if not broker_account:
            _log(fid, master_trade_id, "ERROR", "FAIL", "No broker account linked")
            return

        creds = await get_creds(broker_account)
        if not creds:
            _log(fid, master_trade_id, "ERROR", "FAIL", "Could not get credentials")
            return

        # Safety guard (max open trades, daily loss, drawdown) — only gates new entries. It reads
        # the etype itself, so a PLACED is passed as "OPEN": the guard's question is "may this
        # follower take on another trade", and a resting mirror is one being taken on.
        allowed, skip_reason = await run_db(
            check_follower_allowed, follower, snap, "OPEN" if is_entry else etype, broker_account)
        if not allowed:
            _log(fid, master_trade_id, "INFO", "SKIP", skip_reason or "blocked by risk guard")
            return

        # Optional per-follower delay before mirroring a new entry.
        if is_entry and follower.trade_delay_sec:
            try:
                await asyncio.sleep(int(follower.trade_delay_sec))
            except (TypeError, ValueError):
                pass

        platform = (broker_account.platform or "").lower()
        # ONLY cTRADER CAN REST AN ORDER TODAY. The Binance, DXtrade and TradeLocker executors have
        # open/close/modify and nothing else, so calling place_pending on one would raise
        # AttributeError and land in the crash handler as "unexpected error" — a message that says
        # nothing about the real reason. Said plainly here instead, and NOT silently downgraded to
        # a market order: that would enter a trade the master has only placed an order for.
        if etype in ("PLACED", "AMENDED", "CANCELLED") and platform not in ("ctrader", "ct"):
            _log(fid, master_trade_id, "INFO", "SKIP",
                 f"{platform or 'this platform'} cannot mirror a resting order yet — only cTrader "
                 f"can. The master's ORDER was not copied; a fill would still be")
            return

        action   = apply_direction(snap.action, follower.direction or "same")
        if (follower.direction or "").lower() == "hedge" and platform in ("ctrader", "ct"):
            log.warning("[%s] 'hedge' on cTrader (netting account): opens the opposite side, "
                        "which NETS against any existing position rather than hedging it.", fid)

        # On reverse/hedge the side flips, so SL and TP swap to stay on the correct side
        # of the reversed position (master's stop becomes the follower's target).
        sl_price, tp_price = snap.stop_loss, snap.take_profit
        if snap.action and action != snap.action:
            sl_price, tp_price = snap.take_profit, snap.stop_loss

        # Resolve the follower's own id for anything that acts on something already there: a
        # position for CLOSE/MODIFY, a resting order for AMENDED/CANCELLED. Matched by the
        # MASTER's id, never by symbol — a follower can hold several orders on one symbol and
        # "cancel the XAUUSD one" would cancel whichever the query happened to return first.
        follower_pos_id: str | None = None
        open_vol: float | None = None
        if etype in ("CLOSE", "MODIFY"):
            follower_pos_id, open_vol = await run_db(_find_follower_position_id, fid, snap.key)
            if follower_pos_id is None:
                _log(fid, master_trade_id, "INFO", "SKIP",
                     f"No open follower position for master pos {snap.key}")
                return
        elif etype in ("AMENDED", "CANCELLED"):
            follower_pos_id, open_vol = await run_db(mirror.find_follower_order_id, fid, snap.key)
            if follower_pos_id is None:
                # NOT AN ERROR. The mirror may never have been placed — a filter refused it, the
                # session was shut, the risk cap said no. There is simply nothing to act on.
                _log(fid, master_trade_id, "INFO", "SKIP",
                     f"No resting follower order mirrors master order {snap.key} — nothing to "
                     f"{'move' if etype == 'AMENDED' else 'cancel'}")
                return

        if is_entry:
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
            # Proportional mode needs the MASTER's balance too; every other mode ignores it, so it
            # is only read when it is actually going to be used.
            master_equity = (await run_db(_master_balance, follower.master_id)
                             if (follower.lot_mode or "").lower() == "proportional" else None)
            lots = calc_lots(follower, snap.volume_lots, sl_pips=sl_pips,
                             follower_equity=equity, pip_value=pip_value(snap.symbol),
                             master_equity=master_equity)
            if lots <= 0:
                if (follower.lot_mode or "").lower() == "proportional":
                    reason = (
                        "Proportional mode: can't size — "
                        + ("the master's trade carried no size"
                           if not snap.volume_lots else
                           f"a balance is missing (yours={equity}, master's={master_equity}); "
                           f"both accounts must be synced")
                    )
                elif (follower.lot_mode or "").lower() == "risk":
                    # Name the symbol case separately — it is the one a user can act on, by
                    # switching that follower to fixed or mult mode.
                    reason = (
                        f"Risk-% mode: no reliable pip value for {snap.symbol}, so the position "
                        f"cannot be sized by risk — use fixed or multiplier mode for this symbol"
                        if pip_value(snap.symbol) <= 0 else
                        "Risk-% mode: can't size — the trade has no stop-loss, or your account "
                        "balance isn't synced yet (won't copy without a valid % size)"
                    )
                else:
                    reason = "No valid lot size (mult mode with no master/fixed volume)"
                _log(fid, master_trade_id, "INFO", "SKIP", reason)
                return
        else:
            # CLOSE/MODIFY/AMENDED/CANCELLED: use the follower's RECORDED volume so a close fully
            # exits (re-calculating could under/over-fill and strand size), and so a moved order
            # keeps the size it was placed at. Fall back to calc_lots.
            sl_pips = None
            lots = open_vol if (open_vol and open_vol > 0) else calc_lots(
                follower, snap.volume_lots, follower_equity=None)

        # 3% PER-TRADE RISK CAP — checked HERE, not with the other guards, because it needs the
        # FINAL lot size and the stop distance, and both are computed above. A follower may never
        # risk more than 3% of their account on one copied trade; no stop loss is a refusal, since
        # unbounded risk cannot be checked against a cap.
        if is_entry:
            ok_risk, risk_reason = await run_db(
                check_trade_risk, follower, broker_account, lots, sl_pips, pip_value(snap.symbol))
            if not ok_risk:
                _log(fid, master_trade_id, "WARN", "RISK_CAP", risk_reason)
                return

        # ── THE SAFETY CHOKEPOINT ──────────────────────────────────────────────
        # Every event for every platform passes through here, so this is the one place a global
        # stop can be honest. Placed AFTER sizing and the risk guard on purpose: in dry-run we want
        # the whole computation to have happened so the logged order is the real one, not a sketch.
        #
        # ⚠ A CANCEL IS EXEMPT FROM THE KILL SWITCH, AND THAT IS THE SAFE DIRECTION. The switch
        # exists to stop the engine TAKING RISK; refusing to withdraw an order would leave a live
        # order on the account with the engine switched off and nothing left to cancel it when the
        # master's own order died. Turning the engine off must never strand an order on the book.
        if not COPY_ENABLED and etype == "CANCELLED":
            log.warning("[%s] COPY_ENABLED=false, but cancelling order %s anyway — leaving a live "
                        "order resting would be the more dangerous choice", fid, follower_pos_id)
        elif not COPY_ENABLED:
            _log(fid, master_trade_id, "WARN", "DISABLED",
                 f"COPY_ENABLED=false — {etype} {snap.symbol} {lots} lots NOT sent")
            return
        if COPY_DRY_RUN:
            _log(fid, master_trade_id, "INFO", "DRY_RUN",
                 f"WOULD {etype} {snap.symbol} {lots} lots SL={sl_price} TP={tp_price} "
                 f"on {platform} — dry run, nothing sent")
            return

        executor = _get_executor(broker_account, creds)
        result   = None

        # AN ENTRY IS NEVER RETRIED: a retry after an ambiguous failure (e.g. the confirmation lost
        # to a timeout) could place a SECOND live position or a second resting order. A missed entry
        # is far safer than a duplicate one. CLOSE/MODIFY/AMEND/CANCEL are idempotent-ish (cancelling
        # an already-cancelled order just no-ops), so they keep retrying.
        max_attempts = 1 if is_entry else 3
        for attempt in range(1, max_attempts + 1):
            try:
                if etype == "OPEN":
                    result = await executor.open_position(
                        snap.symbol, action, lots, sl_price, tp_price
                    )
                elif etype == "PLACED":
                    result = await executor.place_pending(
                        snap.symbol, action, lots, snap.order_type, snap.price,
                        sl_price, tp_price, label=mirror.mirror_label(snap.key)
                    )
                elif etype == "AMENDED":
                    result = await executor.amend_pending(
                        int(follower_pos_id), snap.order_type, snap.price, sl_price, tp_price
                    )
                elif etype == "CANCELLED":
                    result = await executor.cancel_pending(int(follower_pos_id))
                elif etype == "CLOSE":
                    if platform == "binance":
                        parts = follower_pos_id.split(":") if follower_pos_id else []
                        if len(parts) == 2:
                            result = await executor.close_by_symbol(parts[0], parts[1], lots)
                    else:
                        result = await executor.close_position(int(follower_pos_id), lots,
                                                               symbol=snap.symbol)
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
                      "position; manual flatten may be required.", fid, snap.key)
        # A CANCEL that exhausted its retries leaves a live ORDER the master no longer has. It is
        # not yet a position, so it is less urgent than a failed close — but it is an entry nobody
        # is watching, and it will fill on its own if price reaches it.
        if etype == "CANCELLED" and not (result and result.ok):
            log.error("[%s] CANCEL FAILED for follower order %s (master order %s) — that order is "
                      "STILL RESTING and will fill if price reaches it; cancel it by hand.",
                      fid, follower_pos_id, snap.key)

        await run_db(_record_follower_trade, master_trade_id, follower, snap, etype, lots, result,
                     action, sl_price, tp_price)
    except Exception as e:
        log.exception("[%s] _exec_follower crashed (%s %s)", fid, etype, snap.symbol)
        _log(fid, master_trade_id, "ERROR", "FAIL", f"unexpected error: {e}")
        try:
            _record_follower_trade(master_trade_id, follower, snap, etype, 0.0, None)  # crash path: already off the hot loop
        except Exception:
            pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_broker_account(follower: CopyFollower) -> BrokerAccount | None:
    if not follower.broker_account_id:
        return None
    with Session() as db:
        return db.get(BrokerAccount, follower.broker_account_id)


def _master_balance(master_id: str) -> float | None:
    """The MASTER account's balance, for proportional sizing. None if it cannot be read.

    Read fresh rather than carried on the event: the balance is refreshed by the Node sync service,
    and a stale copy would size every later trade off a number the account no longer has. None is
    returned for every failure, and `calc_lots` treats that as "no size" rather than guessing.
    """
    try:
        with Session() as db:
            master = db.get(CopyMaster, master_id)
            if not master or not master.broker_account_id:
                return None
            acct = db.get(BrokerAccount, master.broker_account_id)
            if not acct or acct.balance is None:
                return None
            return float(acct.balance)
    except (TypeError, ValueError, AttributeError) as exc:
        log.warning("[dispatch] master %s: balance unreadable (%s)", master_id, type(exc).__name__)
        return None


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
            executed_at     = datetime.now(timezone.utc) if ok else None,
        ))
        db.commit()
    level = "INFO" if ok else "ERROR"
    evnt  = etype if ok else "FAIL"
    _log(follower.id, master_trade_id, level, evnt,
         f"{etype} {snap.symbol} {lots} lots — {'ok' if ok else err}")


# follower id -> "TT · 5834793". Resolved once per follower per process: the label is only for
# reading, so one lookup is plenty and a renamed account catching up at the next restart costs
# nothing. It must NEVER be the reason a log line does not get written, hence the broad except and
# the fallback to a short id.
_labels: dict[str, str] = {}


def _follower_label(follower_id: str) -> str:
    """WHICH SLAVE ACCOUNT, in words. His point, 2026-09-20: *"your logs dont say not copied to what
    slave account."* The log line printed a uuid, so reading the deploy logs told you a copy was
    skipped but not whose account it was skipped for — useless the moment there is more than one.
    """
    if follower_id in _labels:
        return _labels[follower_id]
    label = follower_id[:8]
    try:
        with Session() as db:
            f = db.get(CopyFollower, follower_id)
            acct = db.get(BrokerAccount, f.broker_account_id) if f and f.broker_account_id else None
            if acct:
                label = f"{acct.name or 'account'} · {acct.login_id or '?'}"
    except Exception:
        pass
    _labels[follower_id] = label
    return label


def _write_log_row(follower_id: str, trade_id: str, level: str, event: str, msg: str) -> None:
    """The blocking half of `_log` — one INSERT. Never raises: losing an audit row must not lose
    the trade it was describing."""
    try:
        with Session() as db:
            db.add(CopyExecutionLog(
                id=str(uuid4()), follower_id=follower_id, trade_id=trade_id,
                level=level, event=event, message=msg,
            ))
            db.commit()
    except Exception:
        pass


def _log(follower_id: str, trade_id: str, level: str, event: str, msg: str):
    """Record one line of the activity log — the record he actually debugs from.

    CONTEXT-AWARE, AND THAT IS WHY IT LOOKS ODD. `_log` is called from two different worlds: the
    async dispatcher, and the worker threads that `db_io.run_db` uses (via `_record_follower_trade`).
    Writing straight to the database is correct in a thread and catastrophic on the event loop —
    the engine has 15 of these call sites, so blocking each one was a large part of why the whole
    copier ran on a single stopped thread.
    * on the event loop  -> hand the INSERT to a worker and DO NOT wait for it. An audit row is
                            observability, not the trade; nothing downstream reads it back, so
                            making the fan-out wait for it buys nothing.
    * already on a thread -> write it directly. We are off the loop already.
    The stdout line is emitted immediately either way, so the container log keeps its true ordering
    even if two database rows land microseconds apart.
    """
    log.info(f"[{_follower_label(follower_id)}] {level} {event}: {msg}")
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        _write_log_row(follower_id, trade_id, level, event, msg)
        return
    loop.create_task(run_db(_write_log_row, follower_id, trade_id, level, event, msg))
