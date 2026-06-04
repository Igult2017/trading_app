"""
Notification dispatcher.
Subscribes to signal_confirmed on the event bus.
Fires Telegram only on that event — never polled, never scheduled.
"""

import logging
from config.settings import settings
from core import event_bus
from core.types import Signal
from notifications.telegram_formatter import format_signal

log = logging.getLogger(__name__)


async def on_signal_confirmed(signal: Signal) -> None:
    """Handler wired to signal_confirmed event."""
    message = format_signal(signal)
    await _send_telegram(message)


async def _send_telegram(message: str) -> None:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        log.debug("[dispatcher] Telegram not configured — skipping notification")
        return
    try:
        from telegram import Bot
        bot = Bot(token=settings.telegram_bot_token)
        await bot.send_message(
            chat_id=settings.telegram_chat_id,
            text=message,
            parse_mode="Markdown",
        )
        log.info("[dispatcher] Telegram notification sent")
    except Exception as exc:
        log.warning(f"[dispatcher] Telegram send failed: {exc}")


def register() -> None:
    """Call at boot to wire the dispatcher into the event bus."""
    event_bus.subscribe(event_bus.SIGNAL_CONFIRMED, on_signal_confirmed)
    log.info("[dispatcher] registered for signal_confirmed events")
