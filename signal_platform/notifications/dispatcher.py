"""
Notification dispatcher.

Fires Telegram on signal_confirmed and signal_closed — never polled.
Retry: up to 3 attempts with 5s delay on transient Telegram errors.
Event bus is in-process: if the process crashes between emit and send,
the message is lost. This is acceptable for a single-process deployment;
a message queue would be needed for crash-safety.
"""

import asyncio
import logging
import os

from config.settings import settings
from core import event_bus
from core.types import Signal
from notifications.telegram_formatter import format_signal_confirmed, format_signal_closed

log = logging.getLogger(__name__)

_bot = None
_MAX_RETRIES = 3
_RETRY_DELAY = 5   # seconds


def _get_bot():
    global _bot
    if _bot is not None:
        return _bot
    if not settings.telegram_bot_token:
        return None
    try:
        from telegram import Bot
        _bot = Bot(token=settings.telegram_bot_token)
        log.info("[dispatcher] Telegram Bot initialised")
    except Exception as exc:
        log.warning(f"[dispatcher] Bot init failed: {exc}")
    return _bot


async def _send_text(message: str) -> None:
    bot = _get_bot()
    if not bot or not settings.telegram_chat_id:
        log.debug("[dispatcher] Telegram not configured — skipping")
        return

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            await bot.send_message(
                chat_id=settings.telegram_chat_id,
                text=message,
                parse_mode="MarkdownV2",
            )
            log.info("[dispatcher] message sent")
            return
        except Exception as exc:
            log.warning(f"[dispatcher] send attempt {attempt}/{_MAX_RETRIES} failed: {exc}")
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY)

    log.error("[dispatcher] all Telegram retries exhausted — message lost")


async def _send_photo(chart_path: str, caption: str) -> None:
    bot = _get_bot()
    if not bot or not settings.telegram_chat_id:
        return
    try:
        with open(chart_path, "rb") as f:
            await bot.send_photo(
                chat_id=settings.telegram_chat_id,
                photo=f,
                caption=caption,
                parse_mode="MarkdownV2",
            )
        log.info("[dispatcher] chart photo sent")
    except Exception as exc:
        log.warning(f"[dispatcher] photo send failed ({exc}) — falling back to text")
        await _send_text(caption)


async def on_signal_confirmed(signal: Signal) -> None:
    message = format_signal_confirmed(signal)
    chart = signal.chart_path
    if chart and os.path.isfile(chart):
        await _send_photo(chart, message)
    else:
        await _send_text(message)


async def on_signal_closed(signal_id: str) -> None:
    try:
        from storage.db import get_session
        from storage.models import SignalModel
        with get_session() as s:
            row: SignalModel | None = s.get(SignalModel, signal_id)
            if not row:
                return
            message = format_signal_closed(
                symbol=row.symbol,
                direction=row.type,
                status=row.status,
                entry=float(row.entry_price) if row.entry_price else None,
            )
        await _send_text(message)
    except Exception as exc:
        log.warning(f"[dispatcher] on_signal_closed error: {exc}")


def register() -> None:
    event_bus.subscribe(event_bus.SIGNAL_CONFIRMED, on_signal_confirmed)
    event_bus.subscribe(event_bus.SIGNAL_CLOSED,    on_signal_closed)
    log.info("[dispatcher] registered — signal_confirmed + signal_closed")
