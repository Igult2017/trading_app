"""THE REPAIR SWEEP — every minute, each follower's copies are checked against the master (plan step 7, 21 Nov 2026).

Live events can be missed (a dropped connection, a restart, a job left `unknown` by `jobs.resume`). So once a minute,
one account at a time, the follower's open trades and orders are read from the broker and compared with what the
master has NOW (the master listener's own fresh read, `providers/ctrader.py`: `resting`, `_positions`, `origin`).

WHAT IT MAY DO — ONLY to the copier's own trades (label `cp-<master id>`), and only when sure:
  * a copy ORDER whose master order is gone from a read taken AFTER the copy was placed → CANCEL it;
  * a copy TRADE whose master trade is closed → CLOSE it — only if the master listener was already running when the
    copy opened (otherwise it cannot know which master trade the copy came from, and it leaves it alone);
  * a copy TRADE with NO STOP while its master trade has one → the master's stop sent through the normal stop-change
    path (`dispatcher._exec_follower` MODIFY), so the follower's own risk cap still applies;
  * a copy TRADE whose stop/target the follower CHANGED BY HAND → the copier's levels put back, through the same
    normal stop path (his decision "A", 23 Nov 2026) — at most once per 10 minutes per trade.
It NEVER opens a trade, never touches a trade without the copy label, and writes every repair to the Activity log.
A copy must be at least `MIN_AGE_S` old before it is judged, so a copy placed seconds ago is never mistaken for one
whose master has gone.
"""
import asyncio
import logging
import time

from sweep_decide import (MIN_AGE_S, FRESH_S, RESTORE_GAP_S, _key, _differs, decide,   # noqa: F401 (callers use sweep.*)
                          _hand, _restored, note_hand_change, restore_due, LIVE_WINDOW_H, live_followers)

log = logging.getLogger("copy.sweep")

EVERY_S = 120.0                 # each LIVE follower is checked once per this, spread evenly (22 Nov; was 60 s for ALL)


async def _read(conn, the_pool, acct: int):
    """The follower's open orders and trades, read on its pool connection (one request)."""
    from ctrader_open_api import Protobuf
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAReconcileReq, ProtoOAReconcileRes
    import ctrader_send
    fut = asyncio.get_event_loop().create_future()

    def on(client, message):
        if message.payloadType == ProtoOAReconcileRes().payloadType and not fut.done():
            fut.set_result(Protobuf.extract(message))
    async with the_pool.account_lock(acct):
        stop = conn.listen(acct, on)
        try:
            from ctrader_protocol import low_priority
            with low_priority():          # a check: never ahead of a copy on this connection
                ctrader_send.send(conn.client, ProtoOAReconcileReq(ctidTraderAccountId=acct))
            return await asyncio.wait_for(fut, 15)
        finally:
            stop()


async def repair(action, followers_by_master: dict, creds, account_type, ident, key, mid, detail, res) -> None:
    import dispatcher
    from executors.ctrader import CTraderExecutor
    import symbol_details
    anyone = next(iter(followers_by_master.values()))
    if action == "stop":
        f = followers_by_master[mid]
        await dispatcher._exec_follower(None, f, _masters[mid]._positions[key], "MODIFY",
                                        master_order_id=_masters[mid].origin.get(key))
        dispatcher._log(f.id, None, "WARNING", "REPAIR", f"copy {ident}: {detail} — stop sent")
        return
    if action == "restore":
        acct = int(creds["ctraderId"])
        _hand.get(acct, set()).discard(int(ident))
        if not restore_due(acct, ident, time.monotonic()):
            return                                  # one was sent under 10 minutes ago — its result is in the log
        _restored[(acct, int(ident))] = time.monotonic()
        f = followers_by_master[mid]
        dispatcher._log(f.id, None, "WARNING", "REPAIR", f"copy {ident}: {detail} — putting the copier's levels back")
        # `restore=True`: the "already there" check compares with the copier's RECORD, which is exactly what the hand
        # change made untrue. Everything else — his risk rule, the stop ceiling — runs as on any copied stop move.
        # EVERY COPY OF THE TRADE IS READ AT THE BROKER (23 Nov 2026, `linked_copies.py`), so the copy inspected here
        # is the one put back — that morning a put-back of a second copy moved the copy on record instead.
        await dispatcher._exec_follower(None, f, _masters[mid]._positions[key], "MODIFY", restore=True,
                                        master_order_id=_masters[mid].origin.get(key))
        return
    ex = CTraderExecutor(creds, account_type)
    if action == "cancel":
        r = await ex.cancel_pending(ident)
    else:
        p = next(x for x in res.position if int(x.positionId) == ident)
        spec = symbol_details.get(int(creds["ctraderId"]), p.tradeData.symbolId)
        if spec is None or not getattr(spec, "lotSize", 0):
            dispatcher._log(anyone.id, None, "WARNING", "REPAIR", f"copy {ident}: {detail}, but its size cannot be "
                            f"read yet — not closed this minute")
            return
        name = next((n for n, i in (symbol_details.symbol_map(int(creds["ctraderId"])) or {}).items()
                     if i == p.tradeData.symbolId), "")
        r = await ex.close_position(ident, p.tradeData.volume / spec.lotSize, name)
    dispatcher._log(anyone.id, None, "WARNING" if r.ok else "ERROR", "REPAIR",
                    f"copy {ident}: {detail} — {'done' if r.ok else 'FAILED: ' + str(r.error)}")


_masters: dict = {}


# ── A CHECK OF ONE ACCOUNT, ON REQUEST (22 Nov 2026, plan step 4) ─────────────────────────────────────────────────────
# The follower listener (`follower_watch.py`) used to only WRITE DOWN a copy that went its own way. It now asks for a
# check of THAT account, run ~2 s later (a burst of news about one account becomes one check), instead of waiting for
# the next full pass. What a check may do is unchanged (`decide`): it never opens a trade.
SETTLE_S = 2.0
_wanted: dict[int, bool] = {}          # cTrader account id -> forced (True) or "only if it holds a live copy" (False)
_wake: asyncio.Event | None = None


def request_check(acct: int, live_only: bool = False) -> None:
    """Ask for a check of this follower account (its cTrader account id) as soon as possible. `live_only`: skip it
    unless it holds a live copy (a follower logging back in — on a restart that is every follower at once)."""
    global _wake
    acct = int(acct)
    _wanted[acct] = _wanted.get(acct, False) or not live_only
    if _wake is None:
        _wake = asyncio.Event()
    _wake.set()


async def run_requested(engine) -> None:
    """For ever: check the accounts asked for, SETTLE_S after the first ask."""
    global _wake
    if _wake is None:
        _wake = asyncio.Event()
    while True:
        await _wake.wait()
        await asyncio.sleep(SETTLE_S)
        _wake.clear()
        only = dict(_wanted)
        _wanted.clear()
        try:
            await _pass(engine, only)
        except Exception:
            log.exception("[sweep] a requested check failed")


async def run(engine) -> None:
    """For ever: each follower holding a live copy, once per EVERY_S, spread evenly across it (one read each)."""
    while True:
        t0 = time.monotonic()
        try:
            await _pass(engine, None)
        except Exception:
            log.exception("[sweep] a pass failed — the next one runs in %ss", EVERY_S)
        await asyncio.sleep(max(1.0, EVERY_S - (time.monotonic() - t0)))


async def _pass(engine, only: dict | None) -> None:
    """One check of the pooled follower accounts holding a live copy (spread over EVERY_S) — or, on request, of those
    in `only` ({cTrader account id: forced}); a non-forced request is skipped unless the account holds a live copy."""
    import pool
    from db import Session, CopyFollower, BrokerAccount
    from db_io import run_db
    from cred_manager import get_creds
    _masters.clear()
    _masters.update(engine._providers)

    def _rows():
        with Session() as db:
            fs = db.query(CopyFollower).filter(CopyFollower.is_active.is_(True),
                                               CopyFollower.dropped_at.is_(None)).all()
            out = []
            for f in fs:
                b = db.get(BrokerAccount, f.broker_account_id) if f.broker_account_id else None
                if b is not None and (b.platform or "").lower() in ("ctrader", "ct"):
                    db.expunge(f); db.expunge(b)
                    out.append((f, b))
            return out
    accounts: dict = {}                       # follower account -> (broker row, {master id: follower})
    for f, b in await run_db(_rows):
        accounts.setdefault(b.id, (b, {}))[1][f.master_id] = f
    holding = {mid for mid, prov in _masters.items()
               if getattr(prov, "_positions", None) or getattr(prov, "_orders", None)}
    live = await run_db(live_followers, holding)
    is_live = {bid for bid, (_, by_master) in accounts.items() if any(f.id in live for f in by_master.values())}
    if only is None:
        accounts = {bid: v for bid, v in accounts.items() if bid in is_live}
    gap = EVERY_S / max(1, len(accounts)) if only is None else 0.0
    for bid, (b, by_master) in accounts.items():
        kind = b.account_type or "demo"
        masters = {mid: _masters[mid] for mid in by_master if mid in _masters}
        if len(masters) != len(by_master) or not pool.enabled_for(kind):
            continue                            # a master not running here: its copies cannot be judged
        creds = await get_creds(b)
        acct = int(creds["ctraderId"]) if creds and creds.get("ctraderId") else None
        if acct is None or acct not in pool.POOL._home:
            continue
        if only is not None and (acct not in only or (not only[acct] and bid not in is_live)):
            continue
        if gap:
            await asyncio.sleep(gap)            # spread evenly — never a burst of reads
        res = await _read(pool.POOL._home[acct], pool.POOL, acct)
        if acct in _hand:                           # a hand-change mark on a trade that is gone: nothing left to put back
            _hand[acct] &= {int(p.positionId) for p in res.position}
        keys = {str(pid) for m in masters.values() for pid in m._positions}
        import dispatcher
        moved = await run_db(dispatcher._moved_levels, [f.id for f in by_master.values()], keys) if keys else {}
        recorded = {(mid, ext): lv for mid, f in by_master.items() for (fid, ext), lv in moved.items() if fid == f.id}
        for action, ident, key, mid, detail in decide(res.order, res.position, masters, time.time(),
                                                      time.monotonic(), recorded, set(_hand.get(acct, ()))):
            log.warning("[sweep] account %s %s %s: %s", acct, action, ident, detail)
            await repair(action, by_master, creds, kind, ident, key, mid, detail, res)
