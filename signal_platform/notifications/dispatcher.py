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
from notifications.telegram_tap_alert import format_tap_alert

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
        # WARNING: every message the platform produces is being thrown away. Silent at DEBUG.
        log.warning("[dispatcher] Telegram NOT CONFIGURED — message discarded, nothing will be sent")
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
        log.warning("[dispatcher] no WATCHDOG_CHAT_ID set — system message DROPPED "
                    "(deliberately kept off the public channel, but nobody received it)")
        return False
    return await _send_text(message, chat_id=settings.watchdog_chat_id)


_CAPTION_LIMIT = 1024
"""Telegram allows 4096 characters in a MESSAGE but only 1024 in a photo CAPTION."""


def _fit_caption(text: str) -> str:
    """Trim a card to Telegram's photo-caption limit, on a line boundary.

    Measured on a real BX card: the confirmed card is 729 chars and the setup alert 910 — both fit,
    but 910 is one extra reason line away from the cliff. Over the limit, `send_photo` raises and
    the caller silently falls back to TEXT, which loses the rendered image — i.e. the feature fails
    exactly on the richest signals. Trimming on a line boundary keeps the header and levels (which
    lead the card) and drops trailing reasons, all of which are also drawn ON the image itself.
    """
    if len(text) <= _CAPTION_LIMIT:
        return text
    keep, out = _CAPTION_LIMIT - 2, []
    for line in text.split("\n"):
        if sum(len(x) + 1 for x in out) + len(line) > keep:
            break
        out.append(line)
    log.info("[dispatcher] caption trimmed %d -> %d chars for the photo limit "
             "(full detail is on the image)", len(text), sum(len(x) + 1 for x in out))
    return "\n".join(out) or text[:keep]


async def _send_photo(chart_path: str, caption: str, chat_id: str | None = None) -> bool:
    """Returns whether the card actually went out — by photo or by the text fallback.

    Returned `None` unconditionally until 2026-07-27, so every caller treated a total send failure
    as success. A signal that was never delivered looked exactly like one that was.
    """
    bot = _get_bot()
    target = chat_id or settings.telegram_chat_id
    if not bot or not target:
        log.error("[dispatcher] cannot send chart — %s",
                  "no bot configured" if not bot else "no target chat id")
        return False
    caption = _fit_caption(caption)
    try:
        with open(chart_path, "rb") as f:
            await bot.send_photo(
                chat_id=target,
                photo=f,
                caption=caption,
                parse_mode="HTML",
            )
        log.info("[dispatcher] chart photo sent")
        return True
    except Exception as exc:
        log.warning(f"[dispatcher] photo send failed ({exc}) — falling back to text")
        return await _send_text(caption, chat_id=chat_id)


def _channel_all(strategy_id: str | None) -> bool:
    """Does this strategy send EVERYTHING to the public channel? His rule, 2026-08-25:
    *"Send everything for BX on the channel."*

    The `_watch` suffix is stripped first — the setting names a STRATEGY, not one of its card types,
    the same way `dm_only_exempt` is read on both routing paths.
    """
    sid  = strategy_id or ""
    base = sid[:-len("_watch")] if sid.endswith("_watch") else sid
    return base in {x.strip() for x in settings.channel_all.split(",") if x.strip()}


async def on_setup_alert(signal: Signal) -> None:
    # Setup / pre-signal heads-ups are UNCONFIRMED → admin DM only, never the channel. The channel
    # carries CONFIRMED signals only (a zone mitigated + entry alignment, or MTF alignment + confluence
    # + entry) — those are real signals (alert_only=False) and route via on_signal_confirmed.
    # Opt-in: a strategy may mark an alert `to_channel` to go PUBLIC instead of to the DM heads-up.
    # FIRST AND ONLY CALLER: BX's tap alert (`strategies/bx_sd_tap_alert`) — the pre-pullback "cheeky
    # one". It renders with `format_tap_alert`, NOT `format_signal_confirmed`: that card leads with
    # entry / stop / target and this signal deliberately has none, so it printed three 0.00000 prices
    # under a BUY header — the one thing a not-a-trade card must never look like.
    #
    # This is the documented exception to CHANNEL_ENTRIES_ONLY (which gates `on_signal_confirmed`,
    # not this path). The user asked for it — *"make the signal room look fun, engaging but accurate
    # and informational"* — and the card states outright that it is not an entry. Reverting is one
    # line: drop `to_channel` in bx_sd_tap_alert and it goes to the DM instead.
    # HEADS-UPS ARE IMAGE CARDS TOO. This path was text-only, so when chart rendering was added
    # every alert still went out as text AND leaked its rendered PNG — nothing unlinked it, so the
    # container would accumulate one file per heads-up for its whole life. Both fixed here: send the
    # photo when there is one, and delete it afterwards exactly as `on_signal_confirmed` does.
    chart = signal.chart_path
    has_chart = bool(chart) and os.path.isfile(chart)

    # FORMAT AND DESTINATION ARE TWO DECISIONS, NOT ONE (fixed 2026-08-15).
    #
    # THE BUG, reported by the user as "the cheeky messages component has never worked because I have
    # never received cheeky messages". Both were decided by ONE condition:
    #
    #     if signal.to_channel and not settings.signals_dm_only:  -> format_tap_alert()   (cheeky)
    #     else:                                                    -> format_setup_alert() (generic)
    #
    # Production runs with SIGNALS_DM_ONLY=true, so the first branch could NEVER be taken and
    # `format_tap_alert` was unreachable. Every tap alert that fired went to the DM rendered as an
    # ordinary heads-up — so the feature looked broken when it was really just invisible: nothing
    # ever LOOKED like a cheeky card. A destination switch silently disabled a card design.
    #
    # `to_channel` now chooses the FORMAT (this card was built for the room, so it renders as itself
    # wherever it lands) and `signals_dm_only` chooses only WHERE. A card that says "watching, not
    # trading" and carries no entry, stop or target is safe in either place.
    caption = format_tap_alert(signal) if signal.to_channel else format_setup_alert(signal)
    # DM_ONLY_EXEMPT APPLIES HERE TOO (2026-08-19). `on_signal_confirmed` has always honoured the
    # exemption list — a trusted strategy still reaches the channel while SIGNALS_DM_ONLY holds the
    # rest in the DM — but this path never did, so a `to_channel` alert was silently forced private
    # whenever the kill-switch was on. Production runs with SIGNALS_DM_ONLY=true, so BX's unconfirmed
    # entry would have gone to the DM no matter what the strategy asked for.
    #
    # The `_watch` suffix is stripped before the lookup, exactly as the confirmed path does it — the
    # exemption is a property of the STRATEGY, not of which of its two cards is being sent.
    _sid  = signal.strategy_id or ""
    _base = _sid[:-len("_watch")] if _sid.endswith("_watch") else _sid
    _exempt = _base in {x.strip() for x in settings.dm_only_exempt.split(",") if x.strip()}
    # CHANNEL_ALL forces the channel regardless of `to_channel` or the kill-switch — his
    # *"send everything for BX on the channel"*. It cannot be reached by a strategy that is not
    # named in the setting, so nothing else is republished.
    if _channel_all(_sid) or (signal.to_channel and (not settings.signals_dm_only or _exempt)):
        ok = (await _send_photo(chart, caption) if has_chart          # public signal channel
              else await _send_text(caption))
    else:
        # DM: either an unconfirmed heads-up, or SIGNALS_DM_ONLY holding a channel card back.
        ok = (await _send_photo(chart, caption, chat_id=settings.watchdog_chat_id) if has_chart
              else await _send_private(caption))
    if has_chart:
        try:
            os.unlink(chart)
        except OSError:
            pass
    # At-least-once delivery: commit the producer's dedup key ONLY once the DM actually landed,
    # so a failed send (or crash before send) re-fires next scan instead of being lost forever.
    if ok and signal.dedup_key:
        from core import delivery_ledger
        delivery_ledger.mark_delivered(signal.dedup_key)

    # THE AUDIT TRAIL ENDED AT `built` FOR EVERY SETUP ALERT UNTIL 2026-08-19. `_record_delivery`
    # had exactly one caller — `on_signal_confirmed` — so confirmed entries logged the full chain
    # (built -> validated -> saved -> dispatched -> delivered) while alerts logged `built` and then
    # nothing at all. Not a delivery failure: nobody wrote the row.
    #
    # THE COST WAS REAL AND IMMEDIATE. He asked which BX signal he had been sent; the trail showed
    # 29 alerts built over 35 hours and zero delivered, which reads exactly like a broken dispatcher.
    # It was not broken — the alerts had gone out and were invisible. An audit trail that is silent
    # on the MAJORITY of what a strategy emits (BX's output is almost entirely tap alerts) is worse
    # than none, because it invites precisely that wrong conclusion.
    await _record_delivery(signal, ok, is_watch=not signal.to_channel)


async def _record_delivery(signal: Signal, sent: bool, is_watch: bool) -> None:
    """Write the terminal audit row for a signal card. Best-effort; never breaks a send."""
    import asyncio

    from storage import observability_repo as obs
    stage  = obs.STAGE_DELIVERED if sent else obs.STAGE_DROPPED
    detail = ("telegram send confirmed" if sent
              else "telegram send FAILED or no target — the card never reached the user")
    if is_watch:
        detail += " (watch/DM)"
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(
        None, lambda: obs.record(stage, signal.strategy_id, signal.symbol,
                                 signal.db_id or None, detail))
    if not sent:
        log.error(f"[dispatcher] {signal.symbol} {signal.strategy_id} NOT DELIVERED — "
                  f"the signal exists in the DB but the user never received it")


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
    if _channel_all(signal.strategy_id):
        # EVERYTHING PUBLIC, and this deliberately overrides the `is_watch` rule below. That rule
        # exists so an UNCONFIRMED heads-up never leaks to subscribers; he has now asked for BX's
        # to go public on purpose, so it is an instruction rather than a leak. Only strategies
        # named in CHANNEL_ALL reach this branch.
        target = settings.telegram_chat_id
    elif is_watch:
        target = settings.watchdog_chat_id
    elif settings.channel_entries_only and not exempt:
        # While CHANNEL_ENTRIES_ONLY is on, DM_ONLY_EXEMPT is a positive ALLOWLIST for the channel:
        # an entry reaches subscribers only if its strategy is named there. Deliberately NOT
        # conditional on SIGNALS_DM_ONLY — the user's rule is "only BX entry signals to the channel",
        # and making that hold only while a separate kill-switch happens to be on would mean flipping
        # that switch off silently republishes every other strategy to the channel.
        target = settings.watchdog_chat_id
    elif settings.signals_dm_only and not exempt:
        target = settings.watchdog_chat_id
    else:
        target = settings.telegram_chat_id
    if not target:
        # ERROR, not DEBUG. This branch DISCARDS a fully-formed, already-saved signal because of a
        # missing config value, and at DEBUG it was invisible at production log level — a signal
        # could vanish here without leaving a single line. It is a misconfiguration, and it must be
        # the loudest thing in the log, not the quietest.
        log.error("[dispatcher] NO TARGET CHAT for %s signal %s %s — SIGNAL DISCARDED "
                  "(signals_dm_only=%s, watchdog_chat_id set=%s, telegram_chat_id set=%s)",
                  "watch" if is_watch else "confirmed", signal.symbol, signal.strategy_id,
                  settings.signals_dm_only, bool(settings.watchdog_chat_id),
                  bool(settings.telegram_chat_id))
        sent = False
    elif chart and os.path.isfile(chart):
        sent = await _send_photo(chart, message, chat_id=target)
    else:
        sent = await _send_text(message, chat_id=target)

    # CLOSE THE AUDIT CHAIN. `dispatched` is written by the runner before the emit; this writes
    # `delivered` or `dropped`. A `dispatched` with no matching `delivered` is precisely the 27 Jul
    # failure — saved, handed over, never sent — and it is now one query instead of guesswork.
    await _record_delivery(signal, sent, is_watch)

    if chart and os.path.isfile(chart):
        try:
            os.unlink(chart)
        except OSError:
            pass

    # AUTOTRADE — place the real pending stop order, AFTER the card has gone out. Order:
    # the card is the product and must never be delayed or lost by a broker fault, so placement
    # runs last, in its own try, and its failure is logged rather than raised. A _watch alert is an
    # unconfirmed heads-up and is never traded.
    if not is_watch:
        try:
            await _autotrade(signal)
        except Exception as exc:
            log.error(f"[dispatcher] autotrade failed for {signal.symbol}: {exc}")


async def _autotrade(signal) -> None:
    """Place the stop order for a confirmed signal, if autotrade is on.

    Everything expensive — the credential fetch, the balance call, the broker connection — sits
    BEHIND the kill switch, so with autotrade off this costs one boolean and touches no network.
    """
    from config.settings import settings as _s
    if not _s.autotrade_enabled:
        return
    from execution.placer import place_for_signal
    from execution.account import load_account
    acct = await load_account()
    if acct is None:
        log.warning("[dispatcher] autotrade ON but no usable account — nothing placed")
        return
    # `notify=_send_private` is what puts the order in his DM — placed AND stood-down. Without it
    # a placement existed only in the container log, which the next deploy destroys.
    await place_for_signal(signal, acct.creds, acct.account_type, acct.equity,
                           notify=_send_private)


async def on_scan_started(payload: dict) -> None:
    await _send_private(format_scan_started(payload))   # admin DM, not the channel


async def on_session_open(session_name: str) -> None:
    # Session opens (London/NY/Sydney/Tokyo + overlaps) were public. They are NOT a tradeable entry,
    # so under CHANNEL_ENTRIES_ONLY they go to the admin DM and the channel stays a clean signal feed.
    if settings.channel_entries_only:
        await _send_private(format_session_open(session_name))
    else:
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
                # closed_at is whichever stamp this outcome wrote; opened_at is the fill, which
                # is NULL for a pending order that expired without ever filling.
                closed_at = row.executed_at or row.invalidated_at
                return (row.symbol, row.type, row.status, f(row.entry_price),
                        row.strategy or "", f(row.take_profit), f(row.stop_loss),
                        closed_at, row.triggered_at)

        data = await loop.run_in_executor(None, _load_row)
        if data is None:
            return
        symbol, direction, status, entry, strategy, tp, sl, closed_at, opened_at = data
        message = format_signal_closed(
            symbol=symbol, direction=direction, status=status, entry=entry, strategy=strategy,
            take_profit=tp, stop_loss=sl, closed_at=closed_at, opened_at=opened_at,
        )
        # OUTCOME CARDS GO TO THE DM (user, 2026-07-27: "take those TP HIT and other unnecessary
        # messages to DM for now. Only send BX entry signals to the channel"). The channel is a feed
        # of tradeable entries; a TP/SL notice is a record, not something to act on.
        #
        # The rule below this remains: close cards otherwise follow the SAME routing as the entry
        # card, because before that was fixed a DM-held strategy's outcome leaked to subscribers who
        # had never seen its entry.
        exempt = strategy in {s.strip() for s in settings.dm_only_exempt.split(",") if s.strip()}
        if _channel_all(strategy):
            await _send_text(message)          # his "everything on the channel"
        elif settings.channel_entries_only or (settings.signals_dm_only and not exempt):
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
