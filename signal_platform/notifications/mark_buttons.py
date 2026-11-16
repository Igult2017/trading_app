"""
The ✅ Tradeable / ⛔ Untradeable buttons on a momentum-candle announcement (16 Nov 2026).

His ask: *"Whenever momentum candle closure is sent it should contain a button that asks if a trade
should be taken there … the button should be tradeable and untradeable."*

A strategy asks for the buttons by setting `Signal.mark_candle` = (symbol, bar_time, bullish) on the
card. The mark row is created HERE, at the moment the card is actually being sent, so a card that is
built on several scans before it lands does not leave a row per scan. The button carries only
`mc:t:<id>` / `mc:u:<id>`; the website server records his press (`server/services/tradeConfirmPress.ts`)
and the strategy reads it back (`strategies/vix1_marked.py`).

Never raises: a card without buttons is still a card.
"""
import logging

log = logging.getLogger(__name__)

TRADEABLE, UNTRADEABLE = "mc:t:", "mc:u:"


def prepare(signal):
    """(reply_markup, mark id) for a card that asked for buttons, else (None, None)."""
    want = getattr(signal, "mark_candle", None)
    if not want:
        return None, None
    try:
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        from storage import candle_marks
        symbol, bar_time, bullish = want
        mid = candle_marks.create(symbol, bar_time, bullish)
        if not mid:
            return None, None
        return InlineKeyboardMarkup([[
            InlineKeyboardButton("✅ Tradeable", callback_data=TRADEABLE + mid),
            InlineKeyboardButton("⛔ Untradeable", callback_data=UNTRADEABLE + mid)]]), mid
    except Exception as exc:
        log.warning(f"[mark_buttons] no buttons on this card: {type(exc).__name__}: {exc}")
        return None, None


def replier(mid: str, fallback):
    """A sender that replies UNDER the announcement card he pressed, for the trade's own messages.
    Falls back to `fallback` (his plain DM) when the card's place is not known or the reply fails."""
    async def send(text: str) -> bool:
        try:
            from storage import candle_marks
            from storage.db import get_session
            with get_session() as s:
                row = s.get(candle_marks.CandleMarkModel, mid)
                chat, msg = (row.chat_id, row.message_id) if row else (None, None)
            if chat and msg:
                from notifications.dispatcher import _get_bot
                bot = _get_bot()
                if bot is not None:
                    await bot.send_message(chat_id=chat, text=text, parse_mode="HTML",
                                           reply_to_message_id=int(msg))
                    return True
        except Exception as exc:
            log.warning(f"[mark_buttons] could not reply under the card: {type(exc).__name__}: {exc}")
        return await fallback(text)
    return send


def remember(mid: str | None, chat_id: str | None, sent_ids: list) -> None:
    """Store where the card landed, so the trade's own message can be replied under it."""
    if mid and chat_id and sent_ids:
        try:
            from storage import candle_marks
            candle_marks.set_message(mid, chat_id, sent_ids[-1])
        except Exception as exc:
            log.warning(f"[mark_buttons] could not store the card's id: {type(exc).__name__}: {exc}")
