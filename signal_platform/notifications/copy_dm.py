"""HIS DM THROUGH THE COPY BOT (@tandjournal_copybot) — for the strategies in `copy_bot_dm_strategies` (19 Nov 2026).

His words: *"can we direct PIX signals to DM of @tandjournal_copybot for now"*. `notifications/dispatcher.py` asks
`route()` before its own channel rules, for the entry, heads-up and outcome cards alike, and sends through `send()`.
"For now": COPY_BOT_DM_STRATEGIES="" restores the normal routing with no code change.

The copy platform reads channel posts with the same token (`copy_platform/providers/telegram.py`); sending from it does
not touch that. A bot can only message someone who has pressed Start on it — until he has, Telegram answers "chat not
found", and the card goes to his DM through the usual bot instead. A signal is never lost to this route.
"""
import logging

from config.settings import settings

from config import live_settings
log = logging.getLogger(__name__)

_copy_bot = None


def _get_copy_bot():
    """The COPY bot (@tandjournal_copybot), used only to send the cards of `copy_bot_dm_strategies` to his DM
    (his request, 19 Nov 2026). The copy platform reads channel posts with the same token; sending does not touch that."""
    global _copy_bot
    if _copy_bot is not None or not settings.telegram_copy_bot_token:
        return _copy_bot
    try:
        from telegram import Bot
        _copy_bot = Bot(token=settings.telegram_copy_bot_token)
        log.info("[dispatcher] copy bot initialised (for %s cards to his DM)", live_settings.get('copy_bot_dm_strategies'))
    except Exception as exc:
        log.warning(f"[dispatcher] copy bot init failed: {exc}")
    return _copy_bot


def route(strategy_id: str | None) -> bool:
    """Do this strategy's cards go to his DM through the copy bot? (`_watch` stripped — the setting names a strategy.)"""
    sid = strategy_id or ""
    base = sid[:-len("_watch")] if sid.endswith("_watch") else sid
    return base in {x.strip() for x in live_settings.get('copy_bot_dm_strategies').split(",") if x.strip()}


async def send(message: str, chart: str | None = None) -> bool:
    """His DM through the COPY bot; if it cannot deliver (no token, or he has not pressed Start on it — Telegram then
    answers "chat not found"), the SAME card goes to his DM through the usual bot. A signal is never lost to this."""
    from notifications import dispatcher as D        # at call time: the dispatcher imports this module
    target = settings.watchdog_chat_id
    copy = _get_copy_bot()
    if copy and target:
        ok = (await D._send_photo(chart, message, chat_id=target, bot=copy, retries=1) if chart
              else await D._send_text(message, chat_id=target, bot=copy, retries=1))
        if ok:
            log.info("[dispatcher] sent via the copy bot to his DM")
            return True
        log.warning("[dispatcher] the copy bot could not deliver (has he pressed Start on @tandjournal_copybot?) — "
                    "sending the card to his DM through the usual bot instead")
    else:
        log.warning("[dispatcher] copy bot route asked for but %s — usual bot's DM instead",
                    "no TELEGRAM_COPY_BOT_TOKEN" if not copy else "no WATCHDOG_CHAT_ID")
    return (await D._send_photo(chart, message, chat_id=target) if chart
            else await D._send_private(message))
