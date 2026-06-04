"""
Notification dispatcher.

Design:
  • Subscribes to signal_confirmed and signal_closed on the event bus.
  • Fires Telegram ONLY when those events are emitted — never polled, never scheduled.
  • One Bot instance is created lazily and reused across all messages.
  • If a chart PNG exists for the signal, it is sent as a photo with caption.
  • If Telegram is not configured, all calls are no-ops (logged at DEBUG level).
  • A failed send is logged but never re-raised — a notification failure must not
    affect the scanner, storage, or any other platform layer.
"""

import logging
import os
from pathlib import Path

from config.settings import settings
from core import event_bus
from core.types import Signal
from notifications.telegram_formatter import format_signal_confirmed, format_signal_closed

log = logging.getLogger(__name__)

# Single Bot instance — created on first use, reused for all subsequent sends.
# None when Telegram is not configured.
_bot = None


def _get_bot():
    """Return the shared Bot instance, creating it if needed."""
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
        log.warning(f"[dispatcher] Failed to create Bot: {exc}")
    return _bot


async def _send_text(message: str) -> None:
    """Send a plain text message. No-op when Telegram is not configured."""
    bot = _get_bot()
    if not bot or not settings.telegram_chat_id:
        log.debug("[dispatcher] Telegram not configured — skipping")
        return
    try:
        await bot.send_message(
            chat_id=settings.telegram_chat_id,
            text=message,
            parse_mode="MarkdownV2",
        )
        log.info("[dispatcher] message sent")
    except Exception as exc:
        log.warning(f"[dispatcher] send failed: {exc}")


async def _send_photo(chart_path: str, caption: str) -> None:
    """Send the chart image with caption. Falls back to text if image send fails."""
    bot = _get_bot()
    if not bot or not settings.telegram_chat_id:
        log.debug("[dispatcher] Telegram not configured — skipping photo")
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
        log.warning(f"[dispatcher] photo send failed ({exc}) — sending text only")
        await _send_text(caption)


# ── Event handlers ─────────────────────────────────────────────────────────────

async def on_signal_confirmed(signal: Signal) -> None:
    """
    Fired by the event bus when a new signal passes all validation.
    Sends a full signal card — with chart image if available.
    """
    message = format_signal_confirmed(signal)

    chart = signal.chart_path
    if chart and os.path.isfile(chart):
        await _send_photo(chart, message)
    else:
        await _send_text(message)


async def on_signal_closed(signal_id: str) -> None:
    """
    Fired by the signal monitor when a signal hits TP, SL, or expires.
    Sends a compact result update.
    """
    try:
        from storage import signal_repo
        from storage.models import SignalModel
        from storage.db import get_session
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


# ── Registration ───────────────────────────────────────────────────────────────

def register() -> None:
    """
    Call once at boot. Wires both handlers into the event bus.
    After this, Telegram fires only when the platform emits signal_confirmed
    or signal_closed — never on a timer, never by polling.
    """
    event_bus.subscribe(event_bus.SIGNAL_CONFIRMED, on_signal_confirmed)
    event_bus.subscribe(event_bus.SIGNAL_CLOSED,    on_signal_closed)
    log.info("[dispatcher] registered — listening for signal_confirmed + signal_closed")
