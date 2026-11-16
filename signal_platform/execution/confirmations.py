"""
DM CONFIRMATION — what autotrade would place is sent to his DM, and placed only when he confirms.

HIS RULES, 16 Nov 2026:
  * *"The DM confirm is given the signals that would be taken by autotrade."* So the offer is made from
    inside the placer, AFTER every guard and the choosing window (`placer.place_for_signal`) — only
    a signal that would really have been placed is ever offered.
  * *"if i dont confirm or reject, nothing happens"* — an unanswered offer places nothing, ever.
  * *"if i confirm late when price has filled it is rejected with a reason. The wait is as long as the
    trade can still be taken."* So a Confirm is checked again before anything is sent: the saved signal
    must still be active with its entry not yet reached (`saved_signal.load`), and the live price must
    not already be through the entry. Then it goes through the NORMAL placer again — every guard runs a
    second time (session, cut-off, one trade at a time, daily cap, news).

HOW THE PRESS GETS HERE. Telegram lets only one program listen to the bot, and the website server
already does (`server/services/telegramNotification.ts`). So the press is recorded THERE
(`server/services/tradeConfirmPress.ts`: only his account, only a pending offer) and this module picks
it up from the database on the tracker's 2-second clock, started beside the stop-moving poll.

Never raises.
"""
import logging

from execution.confirm_messages import (TEST_CARD, TEST_OK, card, refusal_reason,  # noqa: F401
                                        send_dm as _send, too_late_by_price)

log = logging.getLogger(__name__)


async def offer(signal, lots, stop_pips) -> None:
    """Save the offer, then send it to his DM with Confirm / Reject. Nothing is placed here."""
    try:
        from config.settings import settings
        from execution import decision_log
        from storage import confirm_repo
        side = "BUY" if signal.direction.value == "buy" else "SELL"
        cid = confirm_repo.create(
            signal_id=getattr(signal, "db_id", None) or None,
            strategy=signal.strategy_name or signal.strategy_id, symbol=signal.symbol, side=side,
            entry=signal.entry_price, stop=signal.stop_loss, target=signal.take_profit, lots=lots,
            spread_used=float(getattr(signal, "spread_used", 0) or 0))
        if not cid:
            return                       # not saved → not offered (a press could not be matched)
        chat = settings.watchdog_chat_id
        message_id = await _send(chat, card(signal, lots, stop_pips), buttons=cid)
        if not message_id:
            # NOT SENT IS NOT OFFERED (audit, 16 Nov 2026). This used to record "Sent to your DM" even
            # when Telegram refused, so the Autotrade screen showed an offer he never received. The
            # offer is closed (a press can never match it) and the record says what happened.
            why = "the card could not be sent to your Telegram DM, so the trade was not offered"
            confirm_repo.close_unsent(cid, why)
            await decision_log.failed(signal, why)
            log.warning(f"[confirmations] {signal.symbol} {side}: {why}")
            return
        confirm_repo.set_message(cid, chat, message_id)
        await decision_log.offered(signal, lots, cid)
        log.info(f"[confirmations] {signal.symbol} {side} offered to his DM (offer {cid})")
    except Exception as exc:
        log.error(f"[confirmations] offer failed for {getattr(signal, 'symbol', '?')}: "
                  f"{type(exc).__name__}: {exc}", exc_info=True)


_EXPIRE_EVERY_S = 60.0          # the 24-hour clean-up is a database write: once a minute is plenty
_last_expire = 0.0


async def check(send) -> None:
    """Act on every offer he has confirmed, and send any test card asked for. One pass; started on the
    tracker's clock as its OWN task (`position_tracker._start_confirm_work`), so a Confirm never waits
    behind the news check or an order amendment (audit, 16 Nov 2026)."""
    global _last_expire
    try:
        import asyncio
        import time
        from storage import confirm_repo
        loop = asyncio.get_running_loop()
        for cid in await loop.run_in_executor(None, confirm_repo.test_requests):
            await _send_test(cid)
        for row in await loop.run_in_executor(None, confirm_repo.confirmed):
            await _act(row, send)
        if time.monotonic() - _last_expire >= _EXPIRE_EVERY_S:
            _last_expire = time.monotonic()
            await loop.run_in_executor(None, confirm_repo.expire_unanswered)
    except Exception as exc:
        log.error(f"[confirmations] {type(exc).__name__}: {exc}", exc_info=True)


async def _send_test(cid: str) -> None:
    """The admin page's "Send a test card" (16 Nov 2026): the live end-to-end check."""
    from config.settings import settings
    from storage import confirm_repo
    chat = settings.watchdog_chat_id
    confirm_repo.mark_test_sent(cid, chat, await _send(chat, TEST_CARD, buttons=cid))


async def _act(row: dict, send) -> None:
    import asyncio
    from storage import confirm_repo
    from storage.confirm_models import REFUSED
    loop = asyncio.get_running_loop()
    if not await loop.run_in_executor(None, confirm_repo.claim, row["id"]):
        return                            # another pass has it, or it was already acted on
    if row.get("is_test"):
        # A TEST card is answered HERE, before anything that could place: it carries no signal and is
        # never handed to the placer. Reaching this line is the proof the whole chain works.
        from storage.confirm_models import TESTED
        if confirm_repo.settle(row["id"], TESTED, "test confirmed — the chain works"):
            await _reply(row, TEST_OK)
        return
    try:
        await _act_claimed(row, send, loop)
    except Exception as exc:
        # NEVER LEFT HANGING (audit, 16 Nov 2026). A failure after the claim used to leave the offer
        # "placing" for ever with no reply. Now it is closed and he is told. It is NOT retried: if the
        # failure came after the order was sent, its outcome is unknown, and a retry could place twice.
        log.error(f"[confirmations] offer {row['id']} failed after his Confirm: "
                  f"{type(exc).__name__}: {exc}", exc_info=True)
        why = f"it could not be checked ({type(exc).__name__}) — check the broker before trying again"
        if confirm_repo.settle(row["id"], REFUSED, why):
            await _reply(row, f"⚠️ <b>NOT PLACED</b> — {why}.")


async def _act_claimed(row: dict, send, loop) -> None:
    from data import fix_quotes
    from execution import saved_signal
    from storage import confirm_repo
    from storage.confirm_models import PLACED, REFUSED, TOO_LATE
    sig, why = await loop.run_in_executor(None, saved_signal.load, row["signal_id"], row["spread_used"])
    if sig is not None:
        why = too_late_by_price(sig, fix_quotes.live_quote(sig.symbol))
    if why:
        if confirm_repo.settle(row["id"], TOO_LATE, why):
            await _reply(row, f"⏱ <b>NOT PLACED — too late.</b> {why}.")
        return
    sig.confirmed = True
    told: list[str] = []

    async def capture(text):              # the placer's own refusal message, kept as the reason
        told.append(text or "")
        return await send(text) if send else True

    from execution.account import load_account
    from execution.placer import place_for_signal
    acct = await load_account()
    if acct is None:
        if confirm_repo.settle(row["id"], REFUSED, "no usable trading account"):
            await _reply(row, "⚠️ <b>NOT PLACED</b> — no usable trading account.")
        return
    order_id = await place_for_signal(sig, acct.creds, acct.account_type, acct.equity,
                                      notify=capture, risk_base=acct.risk_base)
    if order_id:
        if confirm_repo.settle(row["id"], PLACED, f"order {order_id}"):
            await _reply(row, f"✅ <b>PLACED</b> — order {order_id}.")
    else:
        reason = refusal_reason(told)
        if confirm_repo.settle(row["id"], REFUSED, reason):
            await _reply(row, f"⛔ <b>NOT PLACED</b> — {reason}")


async def _reply(row: dict, text: str) -> None:
    if row.get("chat_id"):
        await _send(row["chat_id"], text, reply_to=row.get("message_id"))
