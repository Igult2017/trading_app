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
from notifications.telegram_formatter import (
    format_setup_alert, format_signal_confirmed, format_signal_watch, format_signal_closed,
)
from notifications.telegram_system_formatter import format_scan_started, format_session_open

log = logging.getLogger(__name__)

_bot = None
_MAX_RETRIES = 3
_RETRY_DELAY = 5      # seconds
# Per-container marker: present for the life of one container (survives watchdog
# restarts) but gone on a fresh deploy (new image) → announce exactly once per deploy.
_ANNOUNCE_MARKER = "/app/.signal_boot_announced"


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
                parse_mode="HTML",
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
                parse_mode="HTML",
            )
        log.info("[dispatcher] chart photo sent")
    except Exception as exc:
        log.warning(f"[dispatcher] photo send failed ({exc}) — falling back to text")
        await _send_text(caption)


async def on_setup_alert(signal: Signal) -> None:
    await _send_text(format_setup_alert(signal))


async def on_signal_confirmed(signal: Signal) -> None:
    is_watch = signal.strategy_id.endswith("_watch")
    message  = format_signal_watch(signal) if is_watch else format_signal_confirmed(signal)
    chart = signal.chart_path
    if chart and os.path.isfile(chart):
        await _send_photo(chart, message)
        try:
            os.unlink(chart)
        except OSError:
            pass
    else:
        await _send_text(message)


async def on_scan_started(payload: dict) -> None:
    await _send_text(format_scan_started(payload))


async def on_session_open(session_name: str) -> None:
    await _send_text(format_session_open(session_name))


async def announce_status() -> None:
    """Boot heartbeat — sent exactly ONCE PER DEPLOY. _startup sys.exit()s before this
    if cTrader/config fails, so the message firing confirms alive + cTrader-connected;
    its ABSENCE on a deploy means it didn't start/connect.

    Dedup is a marker file on the container filesystem: it survives watchdog restarts
    (same container) but is gone on a fresh deploy (new image). So a restart loop can
    never spam this, yet every deploy announces once."""
    try:
        if os.path.exists(_ANNOUNCE_MARKER):
            log.info("[dispatcher] boot heartbeat already sent this deploy — skipping")
            return
        with open(_ANNOUNCE_MARKER, "w") as _f:
            _f.write("1")
    except Exception as exc:
        log.warning(f"[dispatcher] boot-marker write failed ({exc}) — sending anyway")

    from datetime import datetime, timezone, timedelta
    from data.instrument_filter import is_forex_open
    from scheduler.session_windows import get_current_sessions
    from notifications.telegram_system_formatter import format_platform_status

    now     = datetime.now(timezone.utc)
    is_open = is_forex_open(now)
    sessions = [s.value for s in get_current_sessions(now) if s.value != "all"] if is_open else []
    next_open = None
    if not is_open:
        probe = now.replace(minute=0, second=0, microsecond=0)
        for _ in range(72):                       # search up to 72h ahead for the reopen
            probe += timedelta(hours=1)
            if is_forex_open(probe):
                delta = probe - now
                hrs, mins = int(delta.total_seconds() // 3600), int((delta.total_seconds() % 3600) // 60)
                next_open = probe.strftime("%a %H:%M UTC") + f" (in {hrs}h {mins}m)"
                break
    await _send_text(format_platform_status(is_open, sessions, next_open))


async def on_signal_closed(signal_id: str) -> None:
    try:
        loop = asyncio.get_running_loop()

        def _load_row():
            from storage.db import get_session
            from storage.models import SignalModel
            with get_session() as s:
                row = s.get(SignalModel, signal_id)
                if row is None:
                    return None
                return (
                    row.symbol, row.type, row.status,
                    float(row.entry_price) if row.entry_price else None,
                )

        data = await loop.run_in_executor(None, _load_row)
        if data is None:
            return
        symbol, direction, status, entry = data
        message = format_signal_closed(
            symbol=symbol, direction=direction, status=status, entry=entry,
        )
        await _send_text(message)
    except Exception as exc:
        log.warning(f"[dispatcher] on_signal_closed error: {exc}")


def register() -> None:
    event_bus.subscribe(event_bus.SIGNAL_ALERT,     on_setup_alert)
    event_bus.subscribe(event_bus.SIGNAL_CONFIRMED, on_signal_confirmed)
    event_bus.subscribe(event_bus.SIGNAL_CLOSED,    on_signal_closed)
    event_bus.subscribe(event_bus.SCAN_STARTED,     on_scan_started)
    event_bus.subscribe(event_bus.SESSION_OPEN,     on_session_open)
    log.info("[dispatcher] registered — signals + scan_started + session_open")
