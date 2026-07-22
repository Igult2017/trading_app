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
from notifications.telegram_formatter import format_setup_alert, format_signal_watch
from notifications.telegram_cards import format_signal_confirmed, format_signal_closed
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


async def _send_text(message: str, chat_id: str | None = None) -> bool:
    """Default target is the public signal channel; pass chat_id to route elsewhere
    (e.g. the admin DM for system telemetry). Returns True iff the message was delivered."""
    bot = _get_bot()
    target = chat_id or settings.telegram_chat_id
    if not bot or not target:
        log.debug("[dispatcher] Telegram not configured — skipping")
        return False

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            await bot.send_message(
                chat_id=target,
                text=message,
                parse_mode="HTML",
            )
            log.info("[dispatcher] message sent")
            return True
        except Exception as exc:
            log.warning(f"[dispatcher] send attempt {attempt}/{_MAX_RETRIES} failed: {exc}")
            if attempt < _MAX_RETRIES:
                await asyncio.sleep(_RETRY_DELAY)

    log.error("[dispatcher] all Telegram retries exhausted — message lost")
    return False


async def _send_private(message: str) -> bool:
    """System/status telemetry → the admin's PRIVATE DM only, never the public signal
    channel. If no private chat is configured we DROP it rather than spam subscribers.
    Returns True iff delivered."""
    if not settings.watchdog_chat_id:
        log.debug("[dispatcher] no WATCHDOG_CHAT_ID set — dropping system message (kept off channel)")
        return False
    return await _send_text(message, chat_id=settings.watchdog_chat_id)


async def _send_photo(chart_path: str, caption: str, chat_id: str | None = None) -> None:
    bot = _get_bot()
    target = chat_id or settings.telegram_chat_id
    if not bot or not target:
        return
    try:
        with open(chart_path, "rb") as f:
            await bot.send_photo(
                chat_id=target,
                photo=f,
                caption=caption,
                parse_mode="HTML",
            )
        log.info("[dispatcher] chart photo sent")
    except Exception as exc:
        log.warning(f"[dispatcher] photo send failed ({exc}) — falling back to text")
        await _send_text(caption, chat_id=chat_id)


async def on_setup_alert(signal: Signal) -> None:
    # Setup / pre-signal heads-ups are UNCONFIRMED → admin DM only, never the channel. The channel
    # carries CONFIRMED signals only (a zone mitigated + entry alignment, or MTF alignment + confluence
    # + entry) — those are real signals (alert_only=False) and route via on_signal_confirmed.
    # Opt-in: a strategy may mark an alert `to_channel` when its OWN cascade already confirmed it, and
    # it goes PUBLIC with the full signal card instead of the DM heads-up. No strategy uses this today.
    if signal.to_channel and not settings.signals_dm_only:
        ok = await _send_text(format_signal_confirmed(signal))     # public signal channel
    else:
        # DM: either an unconfirmed heads-up, or SIGNALS_DM_ONLY holding a confirmed alert back.
        ok = await _send_private(format_setup_alert(signal))
    # At-least-once delivery: commit the producer's dedup key ONLY once the DM actually landed,
    # so a failed send (or crash before send) re-fires next scan instead of being lost forever.
    if ok and signal.dedup_key:
        from core import delivery_ledger
        delivery_ledger.mark_delivered(signal.dedup_key)


async def on_signal_confirmed(signal: Signal) -> None:
    is_watch = signal.strategy_id.endswith("_watch")
    message  = format_signal_watch(signal) if is_watch else format_signal_confirmed(signal)
    chart    = signal.chart_path
    # CONFIRMED signals → public channel. WATCH (unconfirmed) alerts → admin DM only;
    # if no private chat is set the watch is dropped, never leaked to the channel.
    # KILL-SWITCH: SIGNALS_DM_ONLY forces signals to the admin DM, EXCEPT strategies listed in
    # DM_ONLY_EXEMPT — their confirmed signals still go public (a trusted, fixed strategy goes live
    # while a still-in-refinement one stays held). _watch heads-ups always stay in the DM.
    base   = signal.strategy_id[:-len("_watch")] if is_watch else signal.strategy_id
    exempt = base in {s.strip() for s in settings.dm_only_exempt.split(",") if s.strip()}
    if is_watch:
        target = settings.watchdog_chat_id
    elif settings.signals_dm_only and not exempt:
        target = settings.watchdog_chat_id
    else:
        target = settings.telegram_chat_id
    if not target:
        log.debug("[dispatcher] no target for %s signal — skipping", "watch" if is_watch else "confirmed")
    elif chart and os.path.isfile(chart):
        await _send_photo(chart, message, chat_id=target)
    else:
        await _send_text(message, chat_id=target)
    if chart and os.path.isfile(chart):
        try:
            os.unlink(chart)
        except OSError:
            pass


async def on_scan_started(payload: dict) -> None:
    await _send_private(format_scan_started(payload))   # admin DM, not the channel


async def on_session_open(session_name: str) -> None:
    # Session opens (London/NY/Sydney/Tokyo + overlaps) are public → the channel.
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
    await _send_private(format_platform_status(is_open, sessions, next_open))   # admin DM, not the channel


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
                f = lambda v: float(v) if v else None
                return (row.symbol, row.type, row.status, f(row.entry_price),
                        row.strategy or "", f(row.take_profit), f(row.stop_loss))

        data = await loop.run_in_executor(None, _load_row)
        if data is None:
            return
        symbol, direction, status, entry, strategy, tp, sl = data
        message = format_signal_closed(
            symbol=symbol, direction=direction, status=status, entry=entry, strategy=strategy,
            take_profit=tp, stop_loss=sl,
        )
        # Close cards follow the SAME routing as the entry card. Before this, on_signal_closed
        # always sent to the public channel — so a DM-held strategy's outcome leaked to
        # subscribers who never saw its entry.
        exempt = strategy in {s.strip() for s in settings.dm_only_exempt.split(",") if s.strip()}
        if settings.signals_dm_only and not exempt:
            await _send_private(message)
        else:
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
