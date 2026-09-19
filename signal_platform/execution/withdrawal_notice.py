"""
TELL HIM WHEN A RESTING ORDER IS WITHDRAWN — and why, and when it could NOT be.

His answer, 2026-09-15, to "Want me to add a message when a resting order is withdrawn?": *"Yes"*.
Placing an order always sent a DM (`placer.placement_message`); withdrawing one sent nothing, so an
order simply vanished from the account with no word about the price that killed its setup.

THREE OUTCOMES, WORDED SO NONE CLAIMS MORE THAN HAPPENED:
  WITHDRAWN      the broker confirmed the cancel: nothing filled, no trade was opened
  ALREADY_GONE   the broker had no such order (it filled, expired or was cancelled by hand). The
                 platform withdrew nothing, and the message must not say it did.
  NOT_WITHDRAWN  the cancel failed, so the order may STILL be live. Quiet is for routine success,
                 never for failure.

ONCE PER ORDER PER OUTCOME. The key goes into the DB-backed delivery ledger only after Telegram confirms
the send, so a restart cannot repeat a message and a failed send is not recorded as told. The orphan
sweep retries a failed cancel on every poll; this stops that becoming a message every 30 seconds.

NEVER RAISES, NEVER HOLDS ANYTHING UP. The send is capped by `safe_notify.tell`, database reads go to a
worker thread, and the canceller already runs in its own task, off the trading loop.
"""
import asyncio
import html
import logging

from shared.pip import price_digits

log = logging.getLogger(__name__)

WITHDRAWN = "withdrawn"
ALREADY_GONE = "already_gone"
NOT_WITHDRAWN = "not_withdrawn"
FILLED_FIRST = "filled_first"      # gone because it FILLED — a real trade, not a withdrawal (B29)

# The sender. None means the dispatcher's private DM, resolved at call time; tests put a fake here.
_sender = None


def message(outcome: str, order_id, symbol: str, why: str, intent: dict | None) -> str:
    """The DM text. `intent` is the order as placed (`autotrade_repo.intent_for`), None if unknown.
    `why` must already be HTML-escaped: the message is sent with parse_mode HTML."""
    i = intent or {}
    sym = i.get("symbol") or symbol or "?"
    head = " · ".join(str(x) for x in (sym, i.get("side"), i.get("strategy")) if x)
    levels = ""
    if i.get("entry") and i.get("sl"):
        d = price_digits(sym)
        levels = f"entry <code>{i['entry']:.{d}f}</code> · stop <code>{i['sl']:.{d}f}</code>"
        if i.get("tp"):
            levels += f" · target <code>{i['tp']:.{d}f}</code>"
        if i.get("lots"):
            levels += f" · {i['lots']} lots"
        levels += "\n"
    if outcome == WITHDRAWN:
        return (f"🤖 <b>AUTOTRADE ORDER WITHDRAWN</b> · {head}\n{levels}"
                f"why: {why}\n"
                f"<i>order {order_id} — nothing filled, no trade was opened</i>")
    if outcome == FILLED_FIRST:
        return (f"🤖 <b>AUTOTRADE ORDER HAD ALREADY FILLED</b> · {head}\n{levels}"
                f"it could not be withdrawn: {why}\n"
                f"<i>order {order_id} — this was a REAL trade, recorded as filled, not withdrawn</i>")
    if outcome == ALREADY_GONE:
        return (f"🤖 <b>AUTOTRADE ORDER ALREADY GONE</b> · {head}\n{levels}"
                f"the broker no longer had order {order_id}: it filled, expired or was cancelled by hand\n"
                f"<i>the platform withdrew nothing · it was withdrawing it because {why}</i>")
    return (f"⛔ <b>COULD NOT WITHDRAW ORDER</b> · {head}\n{levels}"
            f"{why}\n"
            f"<b>order {order_id} may still be resting at the broker — check the account</b>")


async def announce(order_id, symbol: str, why: str, outcome: str) -> bool:
    """Send the message for one withdrawal attempt, once. True iff he has been told (now or before)."""
    try:
        from core import delivery_ledger
        from notifications import safe_notify
        from storage import autotrade_repo
        send = _sender
        if send is None:
            from notifications.dispatcher import _send_private
            send = _send_private
        loop = asyncio.get_running_loop()
        key = f"withdrawal:{outcome}:{order_id}"
        if await loop.run_in_executor(None, delivery_ledger.is_delivered, key):
            return True
        # A slow broker cancel can overlap the next poll's sweep, which then finds the order gone.
        # He was already told it was WITHDRAWN; a second "already gone" would only confuse.
        if outcome == ALREADY_GONE and await loop.run_in_executor(
                None, delivery_ledger.is_delivered, f"withdrawal:{WITHDRAWN}:{order_id}"):
            return True
        intent = await loop.run_in_executor(None, autotrade_repo.intent_for, str(order_id))
        text = message(outcome, order_id, symbol, html.escape(str(why or "")), intent)
        if await safe_notify.tell(send, text):
            await loop.run_in_executor(None, delivery_ledger.mark_delivered, key)
            return True
        log.warning(f"[withdrawal] {symbol}: the {outcome} message for order {order_id} was not "
                    f"delivered — it will be tried again if the cancel is retried")
        return False
    except Exception as exc:
        log.warning(f"[withdrawal] {symbol}: could not announce {outcome} for order {order_id}: "
                    f"{type(exc).__name__}: {exc}")
        return False
