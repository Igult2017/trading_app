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

from storage import autotrade_repo

log = logging.getLogger(__name__)


async def cancel_for_signal(signal_id: str, symbol: str, why: str) -> bool:
    """Cancel the resting order this platform placed for `signal_id`. True only if it really went.

    Returns False for every "nothing to do" case as well as every failure — there is deliberately no
    distinction, because the caller does the same thing either way and a caller that branches on it
    would be acting on a difference this function cannot honestly report.
    """
    try:
        order_id = autotrade_repo.order_for_signal(signal_id)
        if not order_id:
            return False                    # nothing of ours resting for this signal — the normal case

        from execution.account import load_account
        acct = await load_account()
        if acct is None:
            log.warning(f"[canceller] {symbol}: no usable account, cannot cancel order {order_id}")
            return False

        from execution.broker import StopOrderClient
        res = await StopOrderClient(acct.creds, acct.account_type).cancel(int(order_id))
        if not res.ok:
            log.warning(f"[canceller] {symbol}: broker refused to cancel order {order_id} — "
                        f"{res.error}")
            return False

        # ONLY NOW is the row closed. Marking it cancelled before the broker agreed would leave a
        # real resting order that nothing is watching any more — worse than the defect being fixed.
        autotrade_repo.record_closed(order_id, autotrade_repo.STATUS_CANCELLED)
        # SAY WHICH PRICE KILLED IT. A cancelled order is a trade that will never happen, and without
        # the reason it leaves no trace he could question later.
        log.info(f"[canceller] {symbol}: cancelled resting order {order_id} — {why}")
        return True
    except Exception as exc:
        log.warning(f"[canceller] {symbol}: cancel failed for signal {signal_id}: "
                    f"{type(exc).__name__}: {exc}")
        return False


_swept = False


def sweep_orphans_soon() -> None:
    """Run the orphan sweep ONCE, the first time the monitor polls. Returns immediately.

    WHY NOT AT BOOT, which is where it was first put and where it did not work. The sweep needs an
    account, and `execution.account.load_account` asks the Node app for credentials over HTTP. At
    boot that app is not serving yet, so the very first production run said:

        16:21:27  [canceller] XAU/USD: no usable account, cannot cancel order 359170674
        16:21:36  [boot] scheduler started

    It found the right order — the orphan, correctly identified — and could do nothing with it.

    THE MONITOR'S POLL IS THE HONEST MOMENT: it only runs once the platform is fully up, so there is
    no timing to guess at and no delay to tune. Fired as a task so it never sits on the 30-second
    trading path, the same rule as `cancel_soon`.
    """
    global _swept
    if _swept:
        return
    _swept = True
    try:
        asyncio.get_running_loop().create_task(sweep_orphans())
    except RuntimeError:
        _swept = False              # no loop yet; let the next poll try again


async def sweep_orphans() -> int:
    """Cancel every resting order whose signal is no longer active. Returns how many went.

    WHY THIS EXISTS, and it is a gap in the first version of this fix that HIS ACCOUNT proved.
    `signal_monitor` walks `signal_repo.get_active` — **only signals still marked active** — so the
    cancel added there fires for setups that die from now on and NEVER for one that died earlier.
    On 2026-09-04 a gold BUY stop at 4486.56 was still resting while gold traded at 4414: its signal
    had been marked expired hours before the cancel existed, so nothing would ever look at it again.
    **I predicted in the plan that deploying would clear it. It did not.** That order had to be
    cancelled by hand.

    RUN ONCE AT BOOT, never on the trading path — the same rule as every other rehydrate in
    `main.py`. A restart is exactly when an orphan is most likely: the platform was down while the
    market moved, so the setup died with nobody watching.

    IT CANNOT TOUCH A POSITION OR ONE OF HIS OWN ORDERS. `pending()` returns only rows this platform
    placed that are still at STATUS_PLACED, and `cancel_for_signal` re-checks the same thing.
    """
    try:
        from storage import signal_repo
        resting = autotrade_repo.pending()
        if not resting:
            return 0
        active = {str(r.id) for r in signal_repo.get_active()}
        gone = 0
        for order_id, intent in resting.items():
            sid = intent.get("signal_id") if isinstance(intent, dict) else None
            # NO SIGNAL ID MEANS WE CANNOT PROVE IT IS ORPHANED, so it is left alone. Cancelling on
            # an unknown is a guess, and a wrongly cancelled order is a trade that never happens.
            if not sid or str(sid) in active:
                continue
            if await cancel_for_signal(str(sid), intent.get("symbol") or "?",
                                       "its signal is no longer active — orphaned, found at boot"):
                gone += 1
        if gone:
            log.info(f"[canceller] boot sweep cancelled {gone} orphaned order(s)")
        return gone
    except Exception as exc:
        log.warning(f"[canceller] boot sweep failed: {type(exc).__name__}: {exc}")
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
