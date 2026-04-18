"""
Telegram notification service for copy trade events.

Sends bot messages when trades are executed, fail, or are skipped.
Uses the Telegram Bot API via urllib (no extra dependencies).

Per-follower overrides: if a follower row includes a `notify_chat_id` field,
that chat receives the notification instead of the system default.

Config (env vars):
  NOTIFY_BOT_TOKEN  — Telegram bot token (from @BotFather)
  NOTIFY_CHAT_ID    — default admin chat / channel ID
"""
import asyncio
import json
import logging
import urllib.request
from typing import Optional

from ..config import NOTIFY_BOT_TOKEN, NOTIFY_CHAT_ID
from ..models import NormalisedSignal

log = logging.getLogger(__name__)


def _post_telegram(bot_token: str, chat_id: str, text: str) -> bool:
    """Blocking Telegram Bot API call — always run via run_in_executor."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }).encode()
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        log.warning("[Notify] Telegram send failed: %s", e)
        return False


async def _send(bot_token: str, chat_id: str, text: str) -> None:
    if not bot_token or not chat_id:
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _post_telegram, bot_token, chat_id, text)


class CopyTradeNotifier:
    """Sends Telegram notifications for copy trade execution events."""

    def __init__(self, bot_token: str = "", chat_id: str = ""):
        self._bot_token = bot_token or NOTIFY_BOT_TOKEN
        self._default_chat_id = chat_id or NOTIFY_CHAT_ID

    def _chat_id(self, follower: dict) -> str:
        return follower.get("notify_chat_id") or self._default_chat_id

    async def notify_executed(
        self, signal: NormalisedSignal, follower: dict, lot: float
    ) -> None:
        chat_id = self._chat_id(follower)
        if not chat_id:
            return

        icons = {"OPEN": "✅", "CLOSE": "🔒", "MODIFY": "✏️"}
        icon = icons.get(signal.event_type, "ℹ️")
        lines = [f"{icon} <b>{signal.event_type}</b> {signal.action} <b>{signal.symbol}</b>"]

        if signal.event_type == "OPEN":
            lines.append(f"Lot: {lot:.2f}")
            if signal.entry_price:
                lines.append(f"Entry: {signal.entry_price}")
            if signal.stop_loss:
                lines.append(f"SL: {signal.stop_loss}")
            if signal.take_profit:
                lines.append(f"TP: {signal.take_profit}")
        elif signal.event_type == "CLOSE" and signal.closed_price:
            lines.append(f"Close: {signal.closed_price}")
        elif signal.event_type == "MODIFY":
            if signal.stop_loss:
                lines.append(f"New SL: {signal.stop_loss}")
            if signal.take_profit:
                lines.append(f"New TP: {signal.take_profit}")

        lines.append(f"<i>Follower: ...{follower['id'][-6:]}</i>")
        await _send(self._bot_token, chat_id, "\n".join(lines))

    async def notify_failed(
        self, signal: NormalisedSignal, follower: dict, error: str
    ) -> None:
        chat_id = self._chat_id(follower)
        if not chat_id:
            return
        text = (
            f"❌ <b>Trade Failed</b>\n"
            f"{signal.event_type} {signal.action} <b>{signal.symbol}</b>\n"
            f"Error: {error}\n"
            f"<i>Follower: ...{follower['id'][-6:]}</i>"
        )
        await _send(self._bot_token, chat_id, text)

    async def notify_skipped(
        self,
        signal: NormalisedSignal,
        follower: dict,
        open_count: int,
        max_trades: int,
    ) -> None:
        chat_id = self._chat_id(follower)
        if not chat_id:
            return
        text = (
            f"⚠️ <b>Trade Skipped</b>\n"
            f"OPEN {signal.action} <b>{signal.symbol}</b>\n"
            f"Max open trades reached ({open_count}/{max_trades})\n"
            f"<i>Follower: ...{follower['id'][-6:]}</i>"
        )
        await _send(self._bot_token, chat_id, text)


_notifier: Optional[CopyTradeNotifier] = None


def get_notifier() -> CopyTradeNotifier:
    global _notifier
    if _notifier is None:
        _notifier = CopyTradeNotifier()
    return _notifier
