"""THE REPAIR SWEEP — every minute, each follower's copies are checked against the master (plan step 7, 21 Nov 2026).

Live events can be missed (a dropped connection, a restart, a job left `unknown` by `jobs.resume`). So once a minute,
one account at a time, the follower's open trades and orders are read from the broker and compared with what the
master has NOW (the master listener's own fresh read, `providers/ctrader.py`: `resting`, `_positions`, `origin`).

WHAT IT MAY DO — ONLY to the copier's own trades (label `cp-<master id>`), and only when sure:
  * a copy ORDER whose master order is gone from a read taken AFTER the copy was placed → CANCEL it;
  * a copy TRADE whose master trade is closed → CLOSE it — only if the master listener was already running when the
    copy opened (otherwise it cannot know which master trade the copy came from, and it leaves it alone);
  * a copy TRADE with NO STOP while its master trade has one → the master's stop sent through the normal stop-change
    path (`dispatcher._exec_follower` MODIFY), so the follower's own risk cap still applies.
It NEVER opens a trade, never touches a trade without the copy label, and writes every repair to the Activity log.
A copy must be at least `MIN_AGE_S` old before it is judged, so a copy placed seconds ago is never mistaken for one
whose master has gone.
"""
import asyncio
import logging
import time

log = logging.getLogger("copy.sweep")

EVERY_S = 60.0
MIN_AGE_S = 120.0
FRESH_S = 90.0                  # the master's read must be at most this old


def _key(label: str) -> int | None:
    try:
        return int(label[3:]) if label.startswith("cp-") else None
    except ValueError:
        return None


def decide(follower_orders, follower_positions, masters: dict, now_wall: float, now_mono: float) -> list[tuple]:
    """What to repair on ONE follower account, judged against EVERY master that account copies. Pure — tests drive it.

    A follower account can copy several masters, so a copy is an orphan only when NONE of them knows it — checking
    against one master would close another master's copy. And every one of them must have a fresh read.
    `masters` = {master id: listener with `resting`, `read_at`, `_positions`, `origin`, `started_at`}.
    Returns [(action, follower order/position id, master key, master id, detail)], action in cancel | close | stop."""
    out = []
    if not masters or any(not m.read_at or now_mono - m.read_at > FRESH_S for m in masters.values()):
        return out                                          # no fresh picture of every master: decide nothing
    read_wall = min(now_wall - (now_mono - m.read_at) for m in masters.values())
    started = max(m.started_at or 0 for m in masters.values())
    resting = set().union(*(m.resting for m in masters.values()))
    where: dict = {}                                        # master position id -> master id
    from_orders: dict = {}                                  # master order id -> (master id, master position id)
    for mid, m in masters.items():
        for pid in m._positions:
            where[pid] = mid
        for pid, oid in m.origin.items():
            from_orders[oid] = (mid, pid)
    for o in follower_orders:
        x = _key(getattr(o.tradeData, "label", "") or "")
        placed_at = (o.tradeData.openTimestamp or 0) / 1000.0
        if x is None or now_wall - placed_at < MIN_AGE_S or placed_at >= read_wall:
            continue
        if x not in resting and x not in from_orders:
            out.append(("cancel", int(o.orderId), x, None, "its master order is no longer resting"))
    for p in follower_positions:
        x = _key(getattr(p.tradeData, "label", "") or "")
        opened_at = (p.tradeData.openTimestamp or 0) / 1000.0
        if x is None or now_wall - opened_at < MIN_AGE_S:
            continue
        if x in where:
            mid, mpid = where[x], x
        elif x in from_orders and from_orders[x][1] in where:
            mid, mpid = from_orders[x]
        else:
            if started and started < opened_at < read_wall:
                out.append(("close", int(p.positionId), x, None, "its master trade is closed"))
            continue
        msnap = masters[mid]._positions[mpid]
        if not (p.stopLoss or 0) and msnap.stop_loss:
            out.append(("stop", int(p.positionId), mpid, mid, f"it has no stop; the master's is {msnap.stop_loss}"))
    return out


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
        await dispatcher._exec_follower(None, f, _masters[mid]._positions[key], "MODIFY")
        dispatcher._log(f.id, None, "WARNING", "REPAIR", f"copy {ident}: {detail} — stop sent")
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


async def run(engine) -> None:
    """For ever: every EVERY_S, each pooled follower account, one after another (one read each)."""
    import pool
    from db import Session, CopyFollower, BrokerAccount
    from db_io import run_db
    from cred_manager import get_creds
    while True:
        await asyncio.sleep(EVERY_S)
        try:
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
            for b, by_master in accounts.values():
                kind = b.account_type or "demo"
                masters = {mid: _masters[mid] for mid in by_master if mid in _masters}
                if len(masters) != len(by_master) or not pool.enabled_for(kind):
                    continue                            # a master not running here: its copies cannot be judged
                creds = await get_creds(b)
                acct = int(creds["ctraderId"]) if creds and creds.get("ctraderId") else None
                if acct is None or acct not in pool.POOL._home:
                    continue
                res = await _read(pool.POOL._home[acct], pool.POOL, acct)
                for action, ident, key, mid, detail in decide(res.order, res.position, masters, time.time(),
                                                              time.monotonic()):
                    log.warning("[sweep] account %s %s %s: %s", acct, action, ident, detail)
                    await repair(action, by_master, creds, kind, ident, key, mid, detail, res)
        except Exception:
            log.exception("[sweep] a pass failed — the next one runs in %ss", EVERY_S)
