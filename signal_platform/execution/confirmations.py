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

from shared.pip import price_digits

log = logging.getLogger(__name__)

_YES, _NO = "tc:y:", "tc:n:"          # button data: a prefix and the offer id, nothing else


def card(signal, lots, stop_pips) -> str:
    d = price_digits(signal.symbol)
    side = "BUY" if signal.direction.value == "buy" else "SELL"
    strategy = signal.strategy_name or signal.strategy_id
    return (f"🟡 <b>CONFIRM THIS TRADE?</b> · {signal.symbol} {side} · {strategy}\n"
            f"entry <code>{signal.entry_price:.{d}f}</code> · stop <code>{signal.stop_loss:.{d}f}</code>"
            f" · target <code>{signal.take_profit:.{d}f}</code>\n"
            f"{lots} lots · {stop_pips:.1f} pip stop · 1% risk\n"
            f"<i>It passed every autotrade check. Confirm places it; Reject or no answer places nothing. "
            f"A Confirm after the price has reached the entry is refused.</i>")


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
        if message_id:
            confirm_repo.set_message(cid, chat, message_id)
        await decision_log.offered(signal, lots, cid)
        log.info(f"[confirmations] {signal.symbol} {side} offered to his DM (offer {cid})")
    except Exception as exc:
        log.error(f"[confirmations] offer failed for {getattr(signal, 'symbol', '?')}: "
                  f"{type(exc).__name__}: {exc}", exc_info=True)


def too_late_by_price(signal, quote) -> str | None:
    """Is the live price already through the entry? (bid, ask) or None when not known."""
    if not quote or not quote[0] or not quote[1]:
        return None
    bid, ask = quote
    d = price_digits(signal.symbol)
    if signal.direction.value == "buy" and ask >= signal.entry_price:
        return f"the price ({ask:.{d}f}) had already reached the {signal.entry_price:.{d}f} entry"
    if signal.direction.value == "sell" and bid <= signal.entry_price:
        return f"the price ({bid:.{d}f}) had already reached the {signal.entry_price:.{d}f} entry"
    return None


async def check(send) -> None:
    """Act on every offer he has confirmed. One pass; called on the tracker's clock."""
    try:
        import asyncio
        from storage import confirm_repo
        loop = asyncio.get_running_loop()
        for row in await loop.run_in_executor(None, confirm_repo.confirmed):
            await _act(row, send)
        await loop.run_in_executor(None, confirm_repo.expire_unanswered)
    except Exception as exc:
        log.error(f"[confirmations] {type(exc).__name__}: {exc}", exc_info=True)


async def _act(row: dict, send) -> None:
    import asyncio
    from data import fix_quotes
    from execution import saved_signal
    from storage import confirm_repo
    from storage.confirm_models import PLACED, REFUSED, TOO_LATE
    loop = asyncio.get_running_loop()
    if not await loop.run_in_executor(None, confirm_repo.claim, row["id"]):
        return                            # another pass has it, or it was already acted on
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
        reason = next((t.split("\n")[1] for t in told if "\n" in t), "an autotrade check refused it")
        if confirm_repo.settle(row["id"], REFUSED, reason):
            await _reply(row, f"⛔ <b>NOT PLACED</b> — {reason}")


async def _reply(row: dict, text: str) -> None:
    if row.get("chat_id"):
        await _send(row["chat_id"], text, reply_to=row.get("message_id"))


async def _send(chat_id, text: str, buttons: str | None = None, reply_to: int | None = None) -> int | None:
    """Send to his DM, with Confirm / Reject when `buttons` is an offer id. Returns the message id."""
    if not chat_id:
        log.warning("[confirmations] no WATCHDOG_CHAT_ID — the offer cannot be sent")
        return None
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        from notifications.dispatcher import _get_bot
        bot = _get_bot()
        if bot is None:
            return None
        markup = InlineKeyboardMarkup([[InlineKeyboardButton("✅ Confirm", callback_data=_YES + buttons),
                                        InlineKeyboardButton("❌ Reject", callback_data=_NO + buttons)]]
                                      ) if buttons else None
        msg = await bot.send_message(chat_id=chat_id, text=text, parse_mode="HTML", reply_markup=markup,
                                     reply_to_message_id=reply_to)
        return int(msg.message_id)
    except Exception as exc:
        log.warning(f"[confirmations] Telegram send failed: {type(exc).__name__}: {exc}")
        return None
