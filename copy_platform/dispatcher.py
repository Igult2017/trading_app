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
from risk_stop import effective_risk_pct, follower_stop, reduce_lots
from types import SimpleNamespace
from providers.ctrader import PositionSnapshot
import mirror
from linked_copies import hidden_copy as _hidden_copy, every_copy as _every_copy

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
        got = await run_db(_claim_event, master_id, snap, etype, event)
        if got is None:
            return
        master_trade_id, followers, job_ids = got

    if not followers:
        # NOBODY TO COPY TO IS ITSELF AN ANSWER, AND IT HAS TO REACH THE SCREEN. This logged one line
        # naming the master by uuid and wrote NOTHING to the execution log — so a trade that failed to
        # copy because every follower was switched off, or had never accepted the risk terms, left no
        # trace at all in the Activity tab: the master traded and the record was simply blank.
        #
        # One row per LINKED follower now, each naming its own account and the reason it was passed
        # over, because "switched off" and "risk terms not accepted" need different fixes.
        #
        # A DROPPED RELATIONSHIP IS NOT WRITTEN ABOUT (2026-09-29). `dropped_at` means the user took it
        # off the copier, so it appears in no list he can see. Without this filter it would still earn a
        # "Not copied - this copier is switched off" line every single time the master traded: an
        # audit trail filling up with notes about something he was told no longer exists, and no way to
        # act on them. Dropped rows are excluded; PAUSED ones (is_active false, dropped_at null) still
        # get their line, because that one he can fix.
        try:
            with Session() as db:
                linked = (db.query(CopyFollower)
                            .filter(CopyFollower.master_id == master_id,
                                    CopyFollower.dropped_at.is_(None))
                            .all())
        except Exception:
            linked = []
        for f in linked:
            why = ("this copier is switched off (Active subscription)" if not f.is_active else
                   "the risk terms have not been accepted for this copier" if not f.risk_accepted
                   else "not eligible for this event")
            _log(f.id, master_trade_id, "INFO", "SKIP", f"Not copied — {why}")
        if not linked:
            # ⚠ THIS CASE REACHES THE ACTIVITY LOG TOO, and until 25 Oct 2026 it did not. A master
            # with nobody linked wrote one stdout line and NOTHING he could see — so when he asked
            # why his copy log was empty, the three most recent master trades (30 Sep, 12 Oct,
            # 19 Oct) had left no record of any kind. "Nothing was copied" is an answer, and an
            # answer he cannot read is the same as silence.
            #
            # `follower_id` is None because there is no follower to name - the column is nullable
            # precisely so a decision about NOBODY can still be recorded.
            _log(None, master_trade_id, "INFO", "SKIP",
                 f"Not copied — no copier is linked to this master, so this {etype} went nowhere")
            log.info("[dispatch] master %s: no followers are linked to it at all, so this %s "
                     "was not copied anywhere", master_id, etype)
        return

    # BOUNDED FAN-OUT (2026-09-26). This gathered EVERY follower at once. With 500 followers that is
    # 500 simultaneous broker requests, and cTrader allows 50 per second per connection
    # (https://help.ctrader.com/open-api/) — so an unbounded burst does not go faster, it gets the
    # application throttled. The connection pool's pacing enforces the broker's rule; this stops the
    # queue in front of it growing without limit, and keeps memory flat at any follower count.
    #
    # MORE THAN ONE WORKER (plan step 8): each follower ACCOUNT belongs to one worker. This worker runs its own now;
    # the others' jobs are already written, and a NOTIFY wakes their owners (`jobs.run_owned`). One worker = all here.
    from config import COPY_WORKER_INDEX, COPY_WORKER_COUNT
    import jobs as _jobs
    mine = [f for f in followers if COPY_WORKER_COUNT == 1
            or _jobs.owner_of(f.broker_account_id) == COPY_WORKER_INDEX]
    if len(mine) < len(followers):
        await run_db(_notify_jobs)
    await asyncio.gather(*[
        _exec_follower_bounded(master_trade_id, f, snap, etype, event.get("master_order_id"),
                               event.get("fraction"), job_id=job_ids.get(f.id), master_ms=event.get("master_ms"))
        for f in mine
    ], return_exceptions=True)


def _notify_jobs() -> None:
    """Wake the other workers: there are jobs for followers they own."""
    try:
        from sqlalchemy import text
        with Session() as db:
            db.execute(text("SELECT pg_notify('copy_jobs', '')"))
            db.commit()
    except Exception as exc:
        log.warning("[dispatch] could not wake the other workers (%s) — their 5 s check picks the jobs up", exc)


# THE JOB AND THE MASTER'S BROKER TIME OF THE COPY BEING RUN, for `_exec_follower` to stamp the delay (plan step 9).
# A context variable, so concurrent followers each see their own.
import contextvars
_current_job: contextvars.ContextVar = contextvars.ContextVar("copy_job", default=(None, None))

# One slot per concurrent follower execution, for the whole process.
_fanout = asyncio.Semaphore(COPY_MAX_CONCURRENT_FOLLOWERS)


async def _exec_follower_bounded(master_trade_id, follower, snap, etype, master_order_id=None,
                                 fraction=None, job_id=None, force=False, master_ms=None):
    """One follower's copy, inside the fan-out bound — and its job row (`jobs.py`) moved on as it runs."""
    import jobs
    async with _fanout:
        # CLAIMED, not just marked (plan step 8): with two or more workers, or the fan-out and the 5 s check racing,
        # exactly one of them runs it. `force` = a start-up resume of a job that had already started (`jobs.resume`).
        if force:
            await run_db(jobs.mark, job_id, "started")
        elif not await run_db(jobs.claim, job_id):
            return
        _current_job.set((job_id, master_ms))
        try:
            await _exec_follower(master_trade_id, follower, snap, etype, master_order_id, fraction)
        except Exception as exc:
            await run_db(jobs.mark, job_id, "failed", f"{type(exc).__name__}: {exc}")
            raise
        await run_db(jobs.mark, job_id, "done")


def _claim_event(master_id: str, snap, etype: str, event: dict | None = None):
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

        master_trade = _save_master_trade(db, master_id, snap, etype, source,
                                          from_order=(event or {}).get("master_order_id") if etype == "OPEN" else None)
        # `dropped_at IS NULL` is belt as well as braces. is_active=False alone already keeps a dropped
        # relationship out of here, because Drop sets both. But the one outcome worth making
        # STRUCTURALLY impossible is a dropped row that somehow ends up active: it would mirror real
        # trades while every list on screen still hid it. This makes that unreachable no matter how
        # is_active got set.
        followers    = (db.query(CopyFollower)
                          .filter(CopyFollower.master_id == master_id,
                                  CopyFollower.is_active.is_(True),
                                  CopyFollower.risk_accepted.is_(True),
                                  CopyFollower.dropped_at.is_(None))
                          .all())
        # THE JOBS ARE WRITTEN HERE, in this same session, before anything is sent (plan step 6, `jobs.py`): a crash
        # part-way through the fan-out leaves the rest as pending rows that the next start-up finishes.
        import jobs
        job_ids = jobs.create(db, master_id, master_trade.id, followers, event) if (event and followers) else {}
        db.commit()
        return master_trade.id, followers, job_ids


# ── Master trade record ───────────────────────────────────────────────────────

def _save_master_trade(db: DBSession, master_id: str,
                       snap: PositionSnapshot, etype: str,
                       source: str, from_order=None) -> CopyTradeMaster:
    # OPEN always gets a fresh row — dispatch() already guards against a duplicate
    # open, so any OPEN reaching here is a genuine new entry (incl. re-opening a
    # symbol after a prior close). CLOSE/MODIFY dedupe so a synthetic+real duplicate
    # (e.g. the reconcile CLOSE racing the live CLOSE) never creates two rows.
    # AMENDED IS EXEMPT FROM THE DEDUP, because the master can legitimately move one order many
    # times — a trailing entry moves with the market — and every move is a different instruction.
    # Folding them onto one row would leave the mirror resting at the FIRST price for ever.
    # REDUCE is exempt for the same reason: two partial closes of one position are two different
    # instructions, and folding the second onto the first would leave the follower too big.
    if etype not in ("OPEN", "AMENDED", "REDUCE"):
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
                       if hasattr(snap, "order_id") else
                       # `from_order`: the master ORDER this position filled from (23 Nov 2026) — a copy of that order
                       # carries ITS id as a label, so `linked_copies` needs it to find the copy, even after a restart.
                       {"position_id": snap.position_id, **({"from_order": str(from_order)} if from_order else {})}),
        status      = "dispatched",
    )
    db.add(record)
    # FLUSHED, NOT COMMITTED (21 Nov 2026): the caller commits it together with the follower jobs, so the master's
    # row and the record of who still has to receive it are saved as one — never one without the other.
    db.flush() if hasattr(db, "flush") else None
    return record


# ── Per-follower execution ────────────────────────────────────────────────────

async def _exec_follower(master_trade_id: str, follower: CopyFollower,
                         snap: PositionSnapshot, etype: str,
                         master_order_id=None, fraction=None, restore: bool = False, target=None) -> None:
    # `target`: ONE copy found on the follower's account (`linked_copies.Copy`) — set when a stop move / close /
    # part-close is run once per copy of the master trade (23 Nov 2026). None = find them first.
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

        # ⚠ A SIGNED-OUT ACCOUNT IS NOT A BROKEN ONE (2026-10-26). His instruction: *"ctrader
        # should also have memory such that when one logs out ctrader account that was followed or
        # following, when they log back in, the previous settings and setups are restored."*
        #
        # Logging out keeps the account row and every copy setting attached to it, and deliberately
        # clears the stored credentials (`server/services/accountDisconnect.ts`). Without this
        # check the next line finds no credentials and files it as ERROR/FAIL on every mirrored
        # trade — which reads as the copier being broken, and buries the real failures among them.
        #
        # SKIP, NOT FAIL, and nothing is changed: his follower settings are left exactly as they
        # are so that signing back in resumes them untouched.
        if broker_account.is_active is False:
            _log(fid, master_trade_id, "INFO", "SKIP",
                 "this account is signed out — its copy settings are kept and resume when you "
                 "sign back in")
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
        is_ct = platform in ("ctrader", "ct")
        # NEVER A SECOND ENTRY (23 Nov 2026 — the GBP/USD loss). The master's fill came from an order, and no copy of
        # that order is on record — but one may be on the account anyway (that morning a copy job placed it after
        # reporting "failed"). The account is read first; a copy already there is written down, and nothing is sent.
        if is_ct and etype == "OPEN" and master_order_id is not None:
            if await _hidden_copy(_get_executor(broker_account, creds), fid, master_trade_id, snap, master_order_id):
                return
        # EVERY COPY GETS THE STOP MOVE / CLOSE (23 Nov 2026, `linked_copies.py`) — read from the account, not only the
        # one on record. Each found copy is run through the rest of this function on its own.
        if is_ct and etype in ("CLOSE", "MODIFY", "REDUCE") and target is None:
            copies = await _every_copy(lambda: _get_executor(broker_account, creds), follower, snap, etype,
                                       master_order_id)
            if copies:
                for c in copies:
                    await _exec_follower(master_trade_id, follower, snap, etype, master_order_id, fraction,
                                         restore, target=c)
                return
        if target is not None:
            follower_pos_id, open_vol = target.position_id, target.lots
            if not open_vol:                    # the contract spec is not cached: the recorded size, as before
                open_vol = (await run_db(_find_follower_position_id, fid, snap.key))[1]
        elif etype in ("CLOSE", "MODIFY", "REDUCE"):
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
            # RISK MODE WITH NO MASTER STOP (his rule, 15 Nov 2026): there is no stop to size from,
            # so the size is the master's × the multiplier, and the risk-% stop set below is what
            # holds the loss to the follower's %. Before, this trade was simply not copied.
            if lots <= 0 and (follower.lot_mode or "").lower() == "risk" and not sl_pips:
                lots = calc_lots(SimpleNamespace(lot_mode="mult", fixed_lot=follower.fixed_lot,
                                                 lot_multiplier=follower.lot_multiplier),
                                 snap.volume_lots)
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
            # A MOVED STOP KEEPS THE SAME CEILING. The master may move his stop wider later; copied
            # raw, that would undo the risk-% stop set on entry. So a MODIFY's stop goes through the
            # same rule, sized on the follower's recorded lots.
            if etype == "MODIFY":
                try:
                    bal = float(broker_account.balance) if broker_account.balance is not None else None
                except (TypeError, ValueError):
                    bal = None
                new_sl, stop_why, refused = follower_stop(
                    action, snap.entry_price, sl_price, open_vol, bal, effective_risk_pct(follower),
                    pip_size(snap.symbol), pip_value(snap.symbol))
                if refused:
                    _log(fid, master_trade_id, "INFO", "SKIP",
                         f"master moved his stop, not copied — {stop_why}")
                    return
                if new_sl != sl_price:
                    _log(fid, master_trade_id, "INFO", "STOP",
                         f"{snap.symbol}: master's new stop — {stop_why} (stop {new_sl})")
                sl_price = new_sl
                # NOTHING TO CHANGE → NOTHING SENT (21 Nov 2026). An amend to the levels the follower already has was
                # refused by the broker 3 times in a row (XAU/USD 20 Nov 02:12-02:13), each read as "timed out".
                # A RESTORE (23 Nov 2026) skips this: the record says the copier's levels are there, and the follower's
                # hand change is exactly what made that untrue.
                # ONE COPY FOUND AT THE BROKER (23 Nov 2026): its OWN live levels say whether anything would change.
                have = ((target.stop_loss, target.take_profit) if target is not None else
                        None if restore else await run_db(_follower_levels, fid, snap.key))
                if same_levels(have, sl_price, tp_price):
                    _log(fid, master_trade_id, "INFO", "SKIP",
                         f"{snap.symbol}: your stop and target are already there — nothing to change")
                    return
            if etype == "REDUCE":
                lots = reduce_lots(open_vol, fraction)
                if not lots:
                    _log(fid, master_trade_id, "INFO", "SKIP",
                         f"master closed part of {snap.symbol}, but your remaining size cannot be "
                         f"reduced by that share (open {open_vol} lots)")
                    return

        # EVERY COPIED ENTRY CARRIES A STOP THAT HOLDS THE LOSS TO THE FOLLOWER'S RISK % (his rule,
        # 15 Nov 2026 — `risk_stop.py`): the master's stop if it risks no more; otherwise moved closer
        # to where the loss = risk %; a stop at that point if the master had none. Default 1%, never
        # above 3%. A copy whose risk cannot be limited is refused, never sent without a stop.
        if is_entry:
            risk_pct = effective_risk_pct(follower)
            new_sl, stop_why, refused = follower_stop(
                action, snap.entry_price, sl_price, lots, equity, risk_pct,
                pip_size(snap.symbol), pip_value(snap.symbol))
            if refused:
                _log(fid, master_trade_id, "INFO", "SKIP", f"not copied — {stop_why}")
                return
            if new_sl != sl_price:
                _log(fid, master_trade_id, "INFO", "STOP", f"{snap.symbol}: {stop_why} (stop {new_sl})")
            sl_price = new_sl
            sl_pips = abs(float(snap.entry_price) - float(sl_price)) / pip_size(snap.symbol)

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
                    # cTrader takes a market order's stop as a DISTANCE from the fill, measured here
                    # from the master's entry (`risk_stop.relative_levels`); other platforms take prices.
                    extra = ({"ref_price": snap.entry_price} if platform in ("ctrader", "ct") else {})
                    result = await executor.open_position(
                        snap.symbol, action, lots, sl_price, tp_price,
                        # MARK IT AS A COPY. His rule, 2026-09-27: a slave may not pass on a
                        # trade it copied. The mark is what the provider reads to tell a copy
                        # from a trade the account's own owner placed.
                        label=mirror.mirror_label(snap.key), **extra
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
                elif etype == "REDUCE":
                    # A PARTIAL CLOSE: the same close request, for the follower's share only.
                    if platform == "binance":
                        parts = follower_pos_id.split(":") if follower_pos_id else []
                        if len(parts) == 2:
                            result = await executor.close_by_symbol(parts[0], parts[1], lots)
                    else:
                        result = await executor.close_position(int(follower_pos_id), lots,
                                                               symbol=snap.symbol)
                elif etype == "CLOSE":
                    if platform == "binance":
                        parts = follower_pos_id.split(":") if follower_pos_id else []
                        if len(parts) == 2:
                            result = await executor.close_by_symbol(parts[0], parts[1], lots)
                    else:
                        result = await executor.close_position(
                            int(follower_pos_id), lots, symbol=snap.symbol,
                            raw_volume=target.raw_volume if target is not None else None)
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

        # THE DELAY OF THIS COPY, by the broker's own clock at both ends (plan step 9).
        if result is not None and result.ok and getattr(result, "broker_ms", None):
            import jobs as _jobs
            jid, mms = _current_job.get()
            await run_db(_jobs.stamp, jid, mms, result.broker_ms)
        await run_db(_record_follower_trade, master_trade_id, follower, snap, etype, lots, result,
                     action, sl_price, tp_price)
        # NOT CONFIRMED -> CHECKED (22 Nov 2026, plan step 5): a copy that failed or timed out may still have been carried
        # out by the broker; that follower account is read against its masters within seconds, not on the next pass.
        if not (result and result.ok) and creds and creds.get("ctraderId"):
            import sweep
            sweep.request_check(int(creds["ctraderId"]))
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


def _follower_levels(follower_id: str, master_ext_id: str) -> tuple[float | None, float | None] | None:
    """(stop, target) the follower's copy of this master position LAST had — from its newest executed OPEN or MODIFY.
    None when there is no such record. Used to skip a MODIFY that would change nothing (21 Nov 2026): the broker
    refused one such amend three times in a row and each refusal read as "timed out"."""
    with Session() as db:
        row = (db.query(CopyTradeFollower)
                 .join(CopyTradeMaster, CopyTradeFollower.master_trade_id == CopyTradeMaster.id)
                 .filter(CopyTradeFollower.follower_id == follower_id,
                         CopyTradeMaster.external_id == master_ext_id,
                         CopyTradeFollower.event_type.in_(("OPEN", "MODIFY")),
                         CopyTradeFollower.status == "executed")
                 .order_by(CopyTradeFollower.executed_at.desc()).first())
        if row is None:
            return None
        f = lambda v: float(v) if v is not None else None                    # noqa: E731
        return f(row.stop_loss), f(row.take_profit)


def _moved_levels(follower_ids: list[str], master_ext_ids) -> dict:
    """{(follower id, master trade id): (stop, target)} the copier last moved — or last TRIED to move — each copy to:
    the newest MODIFY, carried out or failed, for the master trades open now (23 Nov 2026, the repair check).
    A FAILED one counts on purpose: the follower still has the old stop, it differs, and the check sends the master's
    current levels — a stop move that timed out used to be lost for good. Not the OPEN: a market copy's stop is a
    distance from its own fill, so its recorded price is off by the slippage."""
    if not follower_ids or not master_ext_ids:
        return {}
    with Session() as db:
        rows = (db.query(CopyTradeFollower.follower_id, CopyTradeMaster.external_id,
                         CopyTradeFollower.stop_loss, CopyTradeFollower.take_profit)
                  .join(CopyTradeMaster, CopyTradeFollower.master_trade_id == CopyTradeMaster.id)
                  .filter(CopyTradeFollower.follower_id.in_(list(follower_ids)),
                          CopyTradeMaster.external_id.in_(list(master_ext_ids)),
                          CopyTradeFollower.event_type == "MODIFY",
                          CopyTradeFollower.status.in_(("executed", "failed")))
                  .order_by(CopyTradeFollower.created_at.asc()).all())
    f = lambda v: float(v) if v is not None else None                        # noqa: E731
    return {(fid, ext): (f(sl), f(tp)) for fid, ext, sl, tp in rows}         # ascending: the newest wins


def same_levels(have: tuple | None, sl, tp) -> bool:
    """True when the follower already has exactly this stop and target (to a hundred-thousandth)."""
    if have is None:
        return False
    eq = lambda a, b: (a is None and b is None) or (a is not None and b is not None and abs(float(a) - float(b)) < 1e-6)
    return eq(have[0], sl) and eq(have[1], tp)


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
        vol = float(trade.volume) if trade.volume is not None else None
        # WHAT IS LEFT after partial closes: every executed REDUCE on this follower position since
        # it opened is taken off, so the final CLOSE closes the remainder, not the original size.
        if vol is not None:
            # Matched through the MASTER's position id, exactly as the OPEN above is — a close's
            # own result id is not guaranteed to be the follower's position id.
            reduced = (db.query(CopyTradeFollower)
                         .join(CopyTradeMaster,
                               CopyTradeFollower.master_trade_id == CopyTradeMaster.id)
                         .filter(CopyTradeFollower.follower_id == follower_id,
                                 CopyTradeMaster.external_id == master_ext_id,
                                 CopyTradeFollower.event_type == "REDUCE",
                                 CopyTradeFollower.status == "executed",
                                 CopyTradeFollower.executed_at >= trade.executed_at)
                         .all())
            vol = round(vol - sum(float(r.volume or 0) for r in reduced), 2)
        return trade.external_id, vol


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
    # ⚠ NO FOLLOWER IS A REAL CASE, NOT A BUG TO GUARD AGAINST LATELY. A decision about NOBODY -
    # "no copier is linked to this master" - is recorded with `follower_id = None`, and this used
    # to be reached with `follower_id[:8]`, which raises on None. The line it was about to print
    # would have taken the dispatch down with it.
    if not follower_id:
        return "no copier"
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
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        log.info(f"[{_follower_label(follower_id)}] {level} {event}: {msg}")
        _write_log_row(follower_id, trade_id, level, event, msg)
        return
    # THE NAME IS NEVER LOOKED UP ON THE LOOP (21 Nov 2026, found by `tests/capacity_dispatch.py`). `_follower_label`
    # reads two rows the first time it sees a follower, and this line ran it ON the event loop — so the first trade
    # after a restart, or any new follower, held the whole copier still for two queries per follower mid fan-out.
    # A known name is used at once; an unknown one prints the short id and the name is fetched on a worker for next time.
    if follower_id and follower_id not in _labels:
        log.info(f"[{follower_id[:8]}] {level} {event}: {msg}")
        loop.create_task(run_db(_follower_label, follower_id))
    else:
        log.info(f"[{_follower_label(follower_id)}] {level} {event}: {msg}")
    loop.create_task(run_db(_write_log_row, follower_id, trade_id, level, event, msg))
