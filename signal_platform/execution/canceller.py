"""
Cancel a resting stop order the moment its setup dies.

HIS INSTRUCTION, 2026-09-04, with a live example on his account at the time:

    "once it is clear the market has gone the other direction like the gold case now, the order
     should be canceled as soon as possible not waiting 24HR."

THE GOLD CASE. A BUY stop at 4486.56 with its stop at 4482.44, while gold traded at 4414 — 72 points
below the trigger and far below the stop. The setup was dead and the order was still sitting there.

WHAT WAS ACTUALLY MISSING, and it was not detection. `signal_monitor` already runs every 30 seconds
and already decides this exact thing — its own docstring: *"Price touches the SL side FIRST → the
stop order would never have filled: the signal is CANCELLED"*. It marked that gold signal expired
hours before he asked. **The broker was simply never told.** `broker.cancel()` existed with zero
callers, `record_closed()` had never been called, and `STATUS_CANCELLED` was never written.

AND THE BACKSTOP WAS WIRED BUT NEVER ARMED: `orders.py:99` sets a broker-side expiry from
`signal.expires_at`, which would have the broker drop the order after 24h. `expires_at` defaults to
None (`core/types.py:211`) and nothing ever set it, so `placer.py:96` computed None and the order
went out with no expiry at all.

FOUR RULES THIS FILE EXISTS TO KEEP:

  1. ONLY OUR OWN ORDERS. The order id comes from `autotrade_orders`, every row of which this
     platform placed. Anything he placed by hand is not in that table and can never be matched.
  2. NEVER A FILLED ONE. `order_for_signal` returns only rows still at STATUS_PLACED. A filled order
     is a POSITION, and cancelling is not what closes a position.
  3. NEVER BREAK THE MONITOR. Every failure is swallowed and logged at WARNING. The 30-second poll
     retries on its next pass, so a broker hiccup costs one cycle, not the watcher.
  4. NEVER SLOW THE TRADING PATH. A broker round-trip inside the 30s poll is exactly the shape
     `test_telegram_independence` was written to catch, and it has caught it twice. `cancel_soon`
     hands the work to the loop and returns immediately.
"""

import asyncio
import logging

from execution import decision_log, withdrawal_notice
from storage import autotrade_repo

log = logging.getLogger(__name__)


async def cancel_for_signal(signal_id: str, symbol: str, why: str) -> bool:
    """Cancel the resting order this platform placed for `signal_id`. True only if it really went.

    Returns False for every "nothing to do" case as well as every failure — there is deliberately no
    distinction, because the caller does the same thing either way and a caller that branches on it
    would be acting on a difference this function cannot honestly report.
    """
    order_id = None
    try:
        order_id = autotrade_repo.order_for_signal(signal_id)
        if not order_id:
            return False                    # nothing of ours resting for this signal — the normal case

        from execution.account import load_account
        acct = await load_account()
        if acct is None:
            log.warning(f"[canceller] {symbol}: no usable account, cannot cancel order {order_id}")
            await withdrawal_notice.announce(order_id, symbol, "no usable trading account to cancel it with", withdrawal_notice.NOT_WITHDRAWN)
            return False

        from execution.broker import StopOrderClient
        res = await StopOrderClient(acct.creds, acct.account_type).cancel(int(order_id))
        if not res.ok:
            # "THERE IS NO SUCH ORDER" IS NOT A FAILURE TO RETRY (2026-09-08).
            #
            # The row was left OPEN on every refusal, so an order the broker no longer has was
            # re-cancelled at every boot, refused again, and warned again — order 359170674 on
            # XAU/USD did exactly that across three deploys on 7-8 Sep, and nothing would ever have
            # stopped it.
            #
            # The reason the row is normally kept open is sound and is UNCHANGED for every other
            # error: marking it cancelled before the broker agreed would leave a REAL resting order
            # that nothing is watching, which is worse than the defect. But ORDER_NOT_FOUND says the
            # opposite — the order does not exist, so there is nothing left unwatched, and the only
            # thing keeping the row open is the retry itself.
            #
            # Recorded as CANCELLED rather than a new state: from this platform's side the outcome
            # is identical (it placed an order, that order is gone, it never became a position), and
            # inventing a status would need every reader of the column to learn it.
            if "ORDER_NOT_FOUND" in str(res.error or "").upper():
                autotrade_repo.record_closed(order_id, autotrade_repo.STATUS_CANCELLED)
                log.info(f"[canceller] {symbol}: order {order_id} no longer exists at the broker "
                         f"— closing the row so it stops being re-cancelled every boot ({why})")
                await decision_log.cancelled(signal_id, symbol, order_id,
                                             f"the broker no longer had it: {why}")
                await withdrawal_notice.announce(order_id, symbol, why, withdrawal_notice.ALREADY_GONE)
                return False        # nothing was cancelled BY US; the caller's behaviour is unchanged
            log.warning(f"[canceller] {symbol}: broker refused to cancel order {order_id} — "
                        f"{res.error}")
            await withdrawal_notice.announce(order_id, symbol, f"the broker refused: {res.error}", withdrawal_notice.NOT_WITHDRAWN)
            return False

        # ONLY NOW is the row closed. Marking it cancelled before the broker agreed would leave a
        # real resting order that nothing is watching any more — worse than the defect being fixed.
        autotrade_repo.record_closed(order_id, autotrade_repo.STATUS_CANCELLED)
        # SAY WHICH PRICE KILLED IT. A cancelled order is a trade that will never happen, and without
        # the reason it leaves no trace he could question later.
        log.info(f"[canceller] {symbol}: cancelled resting order {order_id} — {why}")
        await decision_log.cancelled(signal_id, symbol, order_id, why)
        await withdrawal_notice.announce(order_id, symbol, why, withdrawal_notice.WITHDRAWN)
        return True
    except Exception as exc:
        log.warning(f"[canceller] {symbol}: cancel failed for signal {signal_id}: "
                    f"{type(exc).__name__}: {exc}")
        if order_id:
            await withdrawal_notice.announce(order_id, symbol, f"the cancel crashed ({type(exc).__name__})", withdrawal_notice.NOT_WITHDRAWN)
        return False


_sweeping = False


def sweep_orphans_soon() -> None:
    """Run the orphan sweep on this monitor poll, unless one is still running. Returns immediately.

    EVERY POLL, NOT ONCE — changed 2026-09-15. It ran once per process, and `vix1.py` retracts a dead
    setup by expiring its signal (`signal_repo.cancel_active`) without touching the broker order. The
    monitor only walks ACTIVE signals, so that order rested until the next deploy or the broker's 24h
    expiry. His rule, 04 Sep: *"the order should be canceled as soon as possible not waiting 24HR."*

    ON THE POLL, NOT AT BOOT: the sweep needs credentials from the Node app, which is not serving at
    boot (the first production run logged "no usable account" before the scheduler had started).
    Fired as a task so it never sits on the 30-second path, and never two at once.
    """
    global _sweeping
    if _sweeping:
        return                      # the last poll's sweep is still going
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return                      # no loop (a sync context): the next poll tries again
    _sweeping = True

    async def _run():
        global _sweeping
        try:
            await sweep_orphans()
        finally:
            _sweeping = False
    loop.create_task(_run())


async def sweep_orphans() -> int:
    """Cancel every resting order whose signal is no longer active. Returns how many went.

    WHY THIS EXISTS. `signal_monitor` walks only signals still marked active, so its cancel never fires
    for a setup that died another way: while the platform was down (on 2026-09-04 a gold BUY stop at
    4486.56 rested while gold traded at 4414, and had to be cancelled by hand), expired, or retracted by
    the strategy. Runs on every monitor poll (see `sweep_orphans_soon`), never on the stop-moving path.

    IT CANNOT TOUCH A POSITION OR ONE OF HIS OWN ORDERS. `pending()` returns only rows this platform
    placed that are still at STATUS_PLACED, and `cancel_for_signal` re-checks the same thing.
    """
    try:
        from storage import signal_repo
        loop = asyncio.get_running_loop()
        # Every 30s now, so both reads go to a worker thread: a blocking read on the event loop would
        # hold up the half-second trade watcher that shares it.
        resting = await loop.run_in_executor(None, autotrade_repo.pending)
        if not resting:
            return 0
        active = {str(r.id) for r in await loop.run_in_executor(None, signal_repo.get_active)}
        gone = 0
        for order_id, intent in resting.items():
            sid = intent.get("signal_id") if isinstance(intent, dict) else None
            # NO SIGNAL ID MEANS WE CANNOT PROVE IT IS ORPHANED, so it is left alone. Cancelling on
            # an unknown is a guess, and a wrongly cancelled order is a trade that never happens.
            if not sid or str(sid) in active:
                continue
            if await cancel_for_signal(str(sid), intent.get("symbol") or "?",
                                       "its signal is no longer active (the setup died, expired or "
                                       "was retracted)"):
                gone += 1
        if gone:
            log.info(f"[canceller] sweep cancelled {gone} orphaned order(s)")
        return gone
    except Exception as exc:
        log.warning(f"[canceller] orphan sweep failed: {type(exc).__name__}: {exc}")
        return 0


def cancel_soon(signal_id: str, symbol: str, why: str) -> None:
    """Start the cancel and return at once. Nothing waits on it.

    The 30-second signal monitor is on the trading path. A broker round-trip inside it would delay
    every other signal being judged, which is the fault `test_telegram_independence` exists to catch.
    Losing the task on a shutdown costs nothing: the setup is still invalid next poll, and the same
    cancel is attempted again.
    """
    try:
        asyncio.get_running_loop().create_task(cancel_for_signal(signal_id, symbol, why))
    except RuntimeError:
        # No running loop (a test, a sync replay). Silently skip — this is an action, not a decision,
        # and no caller's correctness depends on it having happened.
        pass
