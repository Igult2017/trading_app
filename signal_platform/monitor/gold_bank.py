"""GOLD PROFIT BANKING — closes the pieces `gold_bank_plan.schedule` lays out. Gold (XAU/USD) only.

His order, 21 Nov 2026: *"use it on gold only for now. Dont delete the existing trade manager but only make it work on
forex pairs."* The ladder (`monitor/rungs.py`) still gives gold its 0.4R breakeven; the +1R lock, the trail and the
2R -> 4R target move are OFF for gold, because each of them would close the whole trade.

WHY THE ENGINE CLOSES THE PIECES, NOT THE BROKER. The broker library this platform uses carries ONE take profit per
trade (`ProtoOAAmendPositionSLTPReq` has only stopLoss/takeProfit), and a take profit closes everything. So each piece
is a partial close (`execution/broker.close_part`) sent the moment price reaches its level — from both the 0.5 s
watcher and the 2 s poll, which is why a per-trade lock and a fresh-size check stand in front of every close.

THE BROKER TAKE PROFIT. One that sits at the engine's own target (2R, or the 4R it used to be moved to) would close
the whole trade there, so it is moved out to 10R once. A take profit he set himself is never touched.

QUIET WHEN IT WORKS (his rule: only breakeven and the exit speak). Every close is logged `[gold-bank]`; a failure
retries on the next pass and after three in a row he is told once.
"""
import asyncio
import logging
import time

from core import delivery_ledger
from monitor import gold_bank_plan as plan

log = logging.getLogger(__name__)

_STATE_KEY = "gold_bank_start_volumes"
_FAR_TP_R = 10.0
_ESCALATE_AFTER = 3
_STALE_S = 15.0                   # after a close, a read still showing the old size is the cache, not the broker

_starts: dict[int, int] = {}
_loaded = False
_locks: dict[int, asyncio.Lock] = {}
_after_close: dict[int, tuple[int, float]] = {}     # pid -> (size expected after our close, when)
_fails: dict[int, int] = {}


def _enabled() -> bool:
    from config import live_settings
    return bool(live_settings.get('gold_banking_enabled'))


def _sizes(symbol: str) -> tuple[int, int]:
    """(smallest size, size step) on the wire — 0.01 lot each, converted with the symbol's own contract size."""
    from execution.sizing import LOT_STEP, MIN_LOTS, lots_to_volume
    return lots_to_volume(MIN_LOTS, symbol), lots_to_volume(LOT_STEP, symbol)


def _load() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    try:
        from storage import strategy_state_repo
        for pid, v in (strategy_state_repo.load(_STATE_KEY) or {}).items():
            _starts.setdefault(int(pid), int(v))
    except Exception as exc:
        log.warning(f"[gold-bank] could not restore starting sizes: {type(exc).__name__}: {exc}")


def _save() -> None:
    try:
        from storage import strategy_state_repo
        strategy_state_repo.save(_STATE_KEY, {str(k): v for k, v in _starts.items()})
    except Exception as exc:
        log.warning(f"[gold-bank] could not save starting sizes: {type(exc).__name__}: {exc}")


def due(p, r_close: float) -> tuple[plan.Step, int] | None:
    """The piece to close now, or None. `r_close` is R on the price the piece would FILL at."""
    min_vol, step_vol = _sizes(p.symbol)
    start = _starts.get(int(p.position_id), int(p.volume))
    k = plan.cost_in_r(p.entry, p.breakeven(), p.risk())
    nxt = plan.next_step(plan.schedule(start, k, min_vol, step_vol), int(p.volume), min_vol)
    if nxt is None or r_close < nxt[0].level_r - plan.EPS:
        return None
    return nxt


def engine_target(p) -> bool:
    """Is the broker take profit the ENGINE'S own (2R or 4R)? His own target, anywhere else, is never touched."""
    risk = p.risk()
    if not p.target or not risk:
        return False
    tr = ((p.target - p.entry) if p.bullish else (p.entry - p.target)) / risk
    return any(abs(tr - x) <= 0.05 for x in (2.0, 4.0))


async def _move_target_out(p, acct) -> None:
    key = f"goldbank:{p.position_id}:tp_out"
    if delivery_ledger.is_delivered(key) or not engine_target(p) or p.stop is None:
        return
    from execution.broker import StopOrderClient
    from shared.pip import price_digits
    risk = p.risk()
    far = round(p.entry + _FAR_TP_R * risk if p.bullish else p.entry - _FAR_TP_R * risk, price_digits(p.symbol))
    res = await StopOrderClient(acct.creds, acct.account_type).amend_sltp(p.position_id, p.symbol, p.stop, far)
    if res.ok:
        delivery_ledger.mark_delivered(key)
        log.info(f"[gold-bank] {p.symbol} #{p.position_id}: engine target {p.target} moved out to {far} (10R) — "
                 f"the pieces bank the profit")
    else:
        log.warning(f"[gold-bank] {p.symbol} #{p.position_id}: could not move the target out: {res.error}")


async def manage(p, guard: float, send) -> None:
    """One look at one gold position. `guard` is the price a close fills at (bid for a buy, ask for a sell)."""
    if not plan.is_gold(p.symbol) or not _enabled() or p.stop is None:
        return
    r = p.r_at(guard)
    if r is None:
        return
    pid = int(p.position_id)
    lock = _locks.setdefault(pid, asyncio.Lock())
    if lock.locked():
        return                                     # the other loop is already acting on this trade
    async with lock:
        _load()
        seen = _after_close.get(pid)
        if seen and int(p.volume) != seen[0] and time.monotonic() - seen[1] < _STALE_S:
            return                                 # still the size from before our last close: wait for the re-read
        from config.settings import settings
        from execution.account import load_account
        acct = await load_account()
        if acct is None:
            return
        if settings.auto_breakeven_demo_only and (acct.account_type or "").lower() != "demo":
            return
        await _move_target_out(p, acct)
        step = due(p, r)
        if step is None:
            return
        s, cut = step
        if pid not in _starts:
            _starts[pid] = int(p.volume)           # the size the schedule counts from — saved before the first close
            await asyncio.to_thread(_save)
        from execution.broker import StopOrderClient
        from monitor import position_book
        res = await StopOrderClient(acct.creds, acct.account_type).close_part(pid, cut)
        if res.ok:
            _after_close[pid] = (int(p.volume) - cut, time.monotonic())
            _fails.pop(pid, None)
            position_book.invalidate()
            log.info(f"[gold-bank] {p.symbol} #{pid}: {s.level_r:.2f}R step closed {cut} of {p.volume} "
                     f"at {guard} ({r:.2f}R) — {int(p.volume) - cut} still open")
            return
        _fails[pid] = _fails.get(pid, 0) + 1
        log.warning(f"[gold-bank] {p.symbol} #{pid}: close of {cut} at {r:.2f}R refused — {res.error}")
        if _fails[pid] == _ESCALATE_AFTER and send:
            from notifications import safe_notify
            safe_notify.tell_soon(send, f"⚠️ <b>GOLD PROFIT NOT BANKED</b> · {p.symbol} #{pid}\n"
                                        f"the {s.level_r:.1f}R piece ({cut} units) failed {_ESCALATE_AFTER} times: "
                                        f"{res.error}\n<i>it keeps retrying — close it by hand if you can</i>")


def forget_closed(open_ids: set[int]) -> None:
    """Drop the memory of trades that are no longer open."""
    gone = [pid for pid in _starts if pid not in open_ids]
    for pid in gone:
        _starts.pop(pid, None)
        _after_close.pop(pid, None)
        _locks.pop(pid, None)
    if gone:
        _save()
