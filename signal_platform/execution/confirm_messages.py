"""
The words and the sending for DM confirmation — the card, the TEST card, the replies under them, and the
reason read out of the placer's own message. Kept apart from `confirmations.py` (the flow) on 16 Nov 2026
so each file has one job.

The buttons carry ONLY a prefix and the offer id (`tc:y:<id>` / `tc:n:<id>`). The website server matches
exactly that pattern (`server/services/tradeConfirmPress.ts`); nothing in a button is ever trusted.
"""
import logging
import re

from shared.pip import price_digits

log = logging.getLogger(__name__)

YES, NO = "tc:y:", "tc:n:"

TEST_CARD = ("🧪 <b>TEST CARD — nothing will be placed</b>\n"
             "Press Confirm or Reject. The answer goes through the same path a real trade does — "
             "Telegram, the website, the database and the trading engine — and the result comes back "
             "under this card.")
TEST_OK = ("🧪 <b>TEST — the chain works.</b> Your Confirm went Telegram → website → database → "
           "trading engine and back. Nothing was placed.")


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


def too_late_by_price(signal, quote) -> str | None:
    """Is the live price already through the entry? `quote` is (bid, ask), or None when not known."""
    if not quote or not quote[0] or not quote[1]:
        return None
    bid, ask = quote
    d = price_digits(signal.symbol)
    if signal.direction.value == "buy" and ask >= signal.entry_price:
        return f"the price ({ask:.{d}f}) had already reached the {signal.entry_price:.{d}f} entry"
    if signal.direction.value == "sell" and bid <= signal.entry_price:
        return f"the price ({bid:.{d}f}) had already reached the {signal.entry_price:.{d}f} entry"
    return None


def refusal_reason(told: list[str]) -> str:
    """The reason out of the placer's own message (audit, 16 Nov 2026). It used to take line 2 of any
    message, which for a BROKER refusal is the prices, not the reason. Our guards' refusal carries it on
    line 2 (`placer_messages.refusal_message`); the broker's, in bold on line 3 (`rejection_message`)."""
    for text in told:
        lines = (text or "").split("\n")
        if "BROKER REFUSED" in text and len(lines) > 2:
            m = re.search(r"<b>(.*?)</b>", lines[2])
            return f"the broker refused it: {m.group(1) if m else lines[2]}"
        if "STOOD DOWN" in text and len(lines) > 1:
            return lines[1]
    return "an autotrade check refused it"


async def send_dm(chat_id, text: str, buttons: str | None = None,
                  reply_to: int | None = None) -> int | None:
    """Send to his DM, with Confirm / Reject when `buttons` is an offer id. Returns the message id, or
    None when it did not go (no chat configured, no bot, or Telegram refused)."""
    if not chat_id:
        log.warning("[confirmations] no WATCHDOG_CHAT_ID — nothing can be sent to his DM")
        return None
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        from notifications.dispatcher import _get_bot
        bot = _get_bot()
        if bot is None:
            return None
        markup = InlineKeyboardMarkup([[InlineKeyboardButton("✅ Confirm", callback_data=YES + buttons),
                                        InlineKeyboardButton("❌ Reject", callback_data=NO + buttons)]]
                                      ) if buttons else None
        msg = await bot.send_message(chat_id=chat_id, text=text, parse_mode="HTML", reply_markup=markup,
                                     reply_to_message_id=reply_to)
        return int(msg.message_id)
    except Exception as exc:
        log.warning(f"[confirmations] Telegram send failed: {type(exc).__name__}: {exc}")
        return None
