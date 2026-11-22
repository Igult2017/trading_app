"""WHAT THE REPAIR CHECK WOULD FIX ON ONE FOLLOWER ACCOUNT — the decisions, no broker (split out of
`sweep.py` on 23 Nov 2026, which had grown past the 200-line limit). `sweep.py` reads the broker, calls `decide`, and
carries the repairs out. `live_followers` (which accounts are worth checking) reads the
copier's own records only. The rules of what may be repaired are listed at the top of `sweep.py`.
"""
MIN_AGE_S = 120.0
FRESH_S = 90.0                  # the master's read must be at most this old


def _key(label: str) -> int | None:
    try:
        return int(label[3:]) if label.startswith("cp-") else None
    except ValueError:
        return None


def decide(follower_orders, follower_positions, masters: dict, now_wall: float, now_mono: float,
           recorded: dict | None = None, flagged=None) -> list[tuple]:
    """What to repair on ONE follower account, judged against EVERY master that account copies. Pure — tests drive it.

    A follower account can copy several masters, so a copy is an orphan only when NONE of them knows it — checking
    against one master would close another master's copy. And every one of them must have a fresh read.
    `masters` = {master id: listener with `resting`, `read_at`, `_positions`, `origin`, `started_at`}.
    `recorded` = {(master id, master position id as text): (stop, target) the copier last MOVED that copy to};
    `flagged` = follower position ids the follower listener saw changed by hand.
    Returns [(action, follower order/position id, master key, master id, detail)], action in
    cancel | close | stop | restore."""
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
            continue
        # PUT BACK A STOP/TARGET CHANGED BY HAND (his decision "A", 23 Nov 2026). Two ways to know it was a hand change:
        # the follower listener saw it happen while the copier was not working on the account (`flagged`), or it differs
        # from the stop the copier itself last MOVED it to (`recorded`, MODIFY only — the broker echoes those exactly).
        # Never the OPEN's record: a market copy's stop is a DISTANCE from its own fill, so it differs by the slippage.
        rec = (recorded or {}).get((mid, str(mpid)))
        live = (p.stopLoss or None, p.takeProfit or None)
        if rec is not None and not _differs(rec, live):
            continue                                        # exactly what the copier set: nothing was changed
        if int(p.positionId) in (flagged or ()) or rec is not None:
            why = "changed by hand" if int(p.positionId) in (flagged or ()) else \
                  "not what the copier set (changed by hand, or a stop move that did not go through)"
            out.append(("restore", int(p.positionId), mpid, mid, f"its stop/target are {why} (stop {live[0]}, "
                                                                 f"target {live[1]})"))
    return out


def _differs(rec: tuple, live: tuple) -> bool:
    """Do the follower's live (stop, target) differ from the copier's record? To 1e-7 of the price — the precision the
    copier's own stop move is confirmed at (`executors/ctrader._levels_applied`). An absent level is None (or 0)."""
    for a, b in zip(rec, live):
        a, b = (a or None), (b or None)
        if (a is None) != (b is None):
            return True
        if a is not None and abs(float(a) - float(b)) > 1e-7 * max(1.0, abs(float(a))):
            return True
    return False


# ── HAND CHANGES SEEN BY THE FOLLOWER LISTENER, AND THE ONCE-PER-10-MINUTES GUARD (23 Nov 2026) ──────────────────────
RESTORE_GAP_S = 600.0
_hand: dict[int, set[int]] = {}          # cTrader account id -> follower position ids changed by hand, not yet restored
_restored: dict[tuple, float] = {}       # (account, position id) -> monotonic time of the last restore sent


def note_hand_change(acct: int, position_id: int) -> None:
    _hand.setdefault(acct, set()).add(int(position_id))


def restore_due(acct: int, position_id: int, now_mono: float) -> bool:
    """A restore of this copy may be sent now — at most one per RESTORE_GAP_S. Without it a refused restore (a stop now
    on the wrong side of price) asks for a check, which restores again: every ~2 s, for ever."""
    last = _restored.get((acct, int(position_id)))
    return last is None or now_mono - last >= RESTORE_GAP_S


# ── CHECK ONLY WHAT IS LIVE (22 Nov 2026, plan step 5 — his idea: "give the copier memory … it only focuses on the live
# ones") ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# A follower with nothing copied has nothing that can go wrong, so it is not read. "Live" is NOT only "its master holds
# something now": a master that closed everything while the follower's close failed holds nothing — and that follower
# is exactly the one to check. So a follower is checked when ANY of: a master of it holds an open trade or order now; a
# master of it did anything in the last LIVE_WINDOW; it has an unfinished or failed copy in the last LIVE_WINDOW.
LIVE_WINDOW_H = 24


def live_followers(master_live: set[str]) -> set[str]:
    """Follower ids (copy_followers.id) that hold, or may hold, a live copy. Reads the copier's own records only."""
    from datetime import datetime, timedelta
    from db import Session, CopyFollower, CopyTradeMaster, CopyTradeFollower, CopyJob
    since = datetime.utcnow() - timedelta(hours=LIVE_WINDOW_H)
    with Session() as db:
        busy_masters = {m for (m,) in db.query(CopyTradeMaster.master_id).filter(CopyTradeMaster.created_at >= since)
                        .distinct()} | set(master_live)
        out = {f for (f,) in db.query(CopyFollower.id).filter(CopyFollower.master_id.in_(busy_masters))} \
            if busy_masters else set()
        out |= {f for (f,) in db.query(CopyTradeFollower.follower_id).filter(
            CopyTradeFollower.created_at >= since, CopyTradeFollower.status == "failed").distinct()}
        out |= {f for (f,) in db.query(CopyJob.follower_id).filter(
            CopyJob.created_at >= since, CopyJob.status.in_(("pending", "started", "unknown", "expired"))).distinct()}
    return {f for f in out if f}
