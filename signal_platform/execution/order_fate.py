"""
WHAT HAPPENED TO AN ORDER THE BROKER NO LONGER HAS — asked, never assumed (docs/OPEN.md B29).

THE DEFECT. Autotrade learned that an order had filled only by SEEING the position open during a poll
(`fill_watch`). His GBP/USD sell of 16 Sep filled at 15:03:17.525 and was stopped at 15:03:18.751 — open
for 1.2 seconds, never seen. When the orphan sweep later tried to withdraw it, the broker answered
ORDER_NOT_FOUND and the canceller recorded it as CANCELLED. So his autotrade screen showed "Withdrawn"
for a trade that really lost $125, and the "Withdrawn" count was inflated by a loss.

THE FIX. "Not found" means only that the order is no longer resting. Before calling it withdrawn, the
broker's deal list is asked whether the order FILLED (`data/ctrader_orders.fill_for_order`, verified on
16 Sep: fill 1.34548 at 15:03:17.525). If it did, the row becomes FILLED with the real price and time.

UNKNOWN IS NOT CANCELLED. If the deal list cannot be read, nothing is written: the row stays as it was and
the next sweep asks again. Writing "cancelled" on a failed read is exactly how the loss disappeared.
"""
import asyncio
import logging
from datetime import datetime, timezone

from data import ctrader_orders
from execution import decision_log, withdrawal_notice
from storage import autotrade_repo

log = logging.getLogger(__name__)

FILLED, CANCELLED, UNKNOWN = "filled", "cancelled", "unknown"


async def settle_missing(order_id: str, signal_id: str | None, symbol: str, why: str) -> str:
    """The broker no longer has `order_id`. Record what really happened. Returns the outcome."""
    asked, fill = await ctrader_orders.fill_for_order(str(order_id))
    if not asked:
        log.warning(f"[order_fate] {symbol}: order {order_id} is gone but the deal list could not be "
                    f"read — recording nothing, asking again next sweep")
        return UNKNOWN
    if fill is not None:
        at = datetime.fromtimestamp(fill.filled_at_ms / 1000, timezone.utc)
        autotrade_repo.record_filled(str(order_id), fill.price, at)
        log.info(f"[order_fate] {symbol}: order {order_id} FILLED at {fill.price} ({at:%H:%M:%S} UTC, "
                 f"position {fill.position_id}) before it could be withdrawn — recorded as filled")
        await decision_log.filled_unseen(signal_id, symbol, order_id, fill.price, fill.position_id)
        await withdrawal_notice.announce(order_id, symbol, f"it had already FILLED at {fill.price}",
                                         withdrawal_notice.FILLED_FIRST)
        return FILLED
    autotrade_repo.record_closed(str(order_id), autotrade_repo.STATUS_CANCELLED)
    log.info(f"[order_fate] {symbol}: order {order_id} no longer exists and never filled — "
             f"closing the row ({why})")
    await decision_log.cancelled(signal_id, symbol, order_id, f"the broker no longer had it: {why}")
    await withdrawal_notice.announce(order_id, symbol, why, withdrawal_notice.ALREADY_GONE)
    return CANCELLED


_rechecked = False


def recheck_once_soon() -> None:
    """Start `recheck_withdrawn` ONCE per process, in the background. Called from the monitor's poll,
    not at boot: the broker connection it needs is only up once the platform is serving."""
    global _rechecked
    if _rechecked:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _rechecked = True
    loop.create_task(recheck_withdrawn())


async def recheck_withdrawn(days: int = 14) -> int:
    """Boot pass: every order recorded as withdrawn in the last `days` is asked about again, and any
    that really FILLED is corrected. Returns how many were corrected. Never raises."""
    corrected = unreadable = 0
    try:
        rows = autotrade_repo.cancelled_since(days)
    except Exception as exc:
        log.warning(f"[order_fate] could not list withdrawn orders: {type(exc).__name__}: {exc}")
        return 0
    for order_id in rows:
        try:
            asked, fill = await ctrader_orders.fill_for_order(str(order_id), lookback_days=days)
            unreadable += 0 if asked else 1
            if asked and fill is not None:
                at = datetime.fromtimestamp(fill.filled_at_ms / 1000, timezone.utc)
                autotrade_repo.record_filled(str(order_id), fill.price, at)
                corrected += 1
                log.info(f"[order_fate] order {order_id} was recorded as WITHDRAWN but FILLED at "
                         f"{fill.price} ({at:%d %b %H:%M:%S} UTC) — corrected")
        except Exception as exc:
            unreadable += 1
            log.warning(f"[order_fate] could not recheck order {order_id}: {type(exc).__name__}: {exc}")
    # ALWAYS SAY WHAT IT DID — a silent pass cannot be told apart from one that never ran.
    log.info(f"[order_fate] re-checked {len(rows)} order(s) recorded as withdrawn in the last {days} "
             f"days: {corrected} had really FILLED and were corrected, {unreadable} could not be read "
             f"(ids: {', '.join(map(str, rows)) or 'none'})")
    return corrected
