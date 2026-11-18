"""
The ❌ Cancel trade / ✏️ Adjust SL buttons on the "order placed" and "trade filled" messages (18 Nov 2026).

His ask: *"add a button for cancelling a trade and adjusting SL by entering the price level where SL should reach"* —
on the messages about a live trade (his answer A). The button carries only `ta:c:<id>` / `ta:s:<id>`; the website
server records his press (`server/services/tradeActionPress.ts`) and the engine carries it out
(`execution/trade_actions.py`).

`send` returns False whenever the buttons could not be put on the message — the caller then sends the plain text it
always sent, so a message is never lost because of a button. Bounded: it is called from the 30 s position poll.
"""
import asyncio
import logging

log = logging.getLogger(__name__)

CANCEL, ADJUST = "ta:c:", "ta:s:"
_TIMEOUT_S = 3.0          # the same cap as `safe_notify.tell`: the 30 s poll must never wait on Telegram


def keyboard(aid: str):
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    return InlineKeyboardMarkup([[InlineKeyboardButton("❌ Cancel trade", callback_data=CANCEL + aid),
                                  InlineKeyboardButton("✏️ Adjust SL", callback_data=ADJUST + aid)]])


async def send(text: str | None, *, symbol: str, bullish: bool, order_id=None, position_id=None,
               mark_id: str | None = None) -> bool:
    """`text` to his DM with the two buttons (under the marked card when `mark_id` is given). True iff sent."""
    if not text:
        return False
    try:
        return await asyncio.wait_for(_send(text, symbol, bullish, order_id, position_id, mark_id), _TIMEOUT_S)
    except Exception as exc:
        log.warning(f"[trade_buttons] {symbol}: sent without buttons — {type(exc).__name__}: {exc}")
        return False


async def _send(text, symbol, bullish, order_id, position_id, mark_id) -> bool:
    from config.settings import settings
    from notifications.dispatcher import _get_bot
    from storage import trade_actions
    bot, chat = _get_bot(), settings.watchdog_chat_id
    if bot is None or not chat:
        return False
    aid = trade_actions.create(symbol=symbol, bullish=bullish, order_id=order_id, position_id=position_id)
    if not aid:
        return False
    msg = await bot.send_message(chat_id=chat, text=text, parse_mode="HTML", reply_markup=keyboard(aid),
                                 reply_to_message_id=_card_message(mark_id))
    trade_actions.set_message(aid, chat, msg.message_id)
    return True


def _card_message(mark_id: str | None) -> int | None:
    """The announcement card a marked trade came from, so its messages thread under it (as before)."""
    if not mark_id:
        return None
    try:
        from storage import candle_marks
        from storage.db import get_session
        with get_session() as s:
            row = s.get(candle_marks.CandleMarkModel, mark_id)
            return int(row.message_id) if row is not None and row.message_id else None
    except Exception:
        return None
