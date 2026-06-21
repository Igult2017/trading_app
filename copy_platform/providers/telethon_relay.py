"""
User-session relay (OPTIONAL, advanced) — lets a user authorize their OWN Telegram
account so the engine can read channels the copy-bot can't be an admin of. Fully
separate from the bot provider (providers/telegram.py): different masters
(source_type='telegram_user'), its own per-user MTProto client. Requires
TELEGRAM_API_ID / TELEGRAM_API_HASH and an active, decrypted Telethon session.

Telethon is imported lazily so the engine runs (and the bot path works) even when
telethon isn't installed — the relay just stays off.
"""
import asyncio
import hashlib
import logging

from telegram_parser import parse_signal
from providers.ctrader import PositionSnapshot   # reuse the snapshot contract

log = logging.getLogger("provider.tg_relay")
_RANK = {"high": 3, "medium": 2, "low": 1}


def _symbol_key(symbol: str) -> int:
    """Stable per-symbol id (md5) so OPEN<->CLOSE link — mirrors the bot provider."""
    return int(hashlib.md5(symbol.encode()).hexdigest()[:12], 16) % 1_000_000_000


class TelethonRelay:
    """One MTProto client per user session; routes chosen channels' posts to masters."""

    def __init__(self, session_str: str, api_id: int, api_hash: str,
                 routes: dict, on_event):
        # routes: { channel_key(lowercased, no '@') : (master_id, cfg) }
        self.session_str = session_str
        self.api_id      = api_id
        self.api_hash    = api_hash
        self.routes      = routes
        self.on_event    = on_event
        self._client     = None

    async def start(self) -> None:
        from telethon import TelegramClient, events            # lazy
        from telethon.sessions import StringSession
        self._client = TelegramClient(StringSession(self.session_str), self.api_id, self.api_hash)
        await self._client.connect()
        if not await self._client.is_user_authorized():
            log.warning("[tg-relay] session not authorized — skipping")
            await self._client.disconnect()
            self._client = None
            return

        @self._client.on(events.NewMessage())
        async def _on_new(event):                                # noqa: ANN001
            try:
                self._handle(event)
            except Exception as e:
                log.warning("[tg-relay] handler error: %s", e)

        log.info("[tg-relay] relay started for %d channel(s)", len(self.routes))

    @staticmethod
    def _chat_keys(chat) -> list:
        keys = []
        uname = getattr(chat, "username", None)
        if uname:
            keys.append(uname.lower())
        cid = getattr(chat, "id", None)
        if cid is not None:
            keys.append(str(cid))
            keys.append("-100" + str(cid))   # Bot-API style channel id
        return keys

    def _handle(self, event) -> None:
        chat = getattr(event, "chat", None)
        text = (getattr(event.message, "message", None) or "")
        for key in self._chat_keys(chat):
            route = self.routes.get(key)
            if not route:
                continue
            master_id, cfg = route
            sig = parse_signal(text, cfg)
            if not sig:
                return
            if _RANK.get(sig.confidence, 0) < _RANK.get(cfg.get("min_confidence", "medium"), 2):
                return
            snap = self._to_snapshot(sig)
            if snap:
                asyncio.ensure_future(self.on_event({"type": sig.event_type, "snap": snap}, master_id))
            return

    @staticmethod
    def _to_snapshot(sig):
        if sig.event_type == "OPEN" and (not sig.symbol or not sig.action):
            return None
        if not sig.symbol:
            return None
        return PositionSnapshot(
            position_id = _symbol_key(sig.symbol),
            symbol      = sig.symbol,
            action      = sig.action or "BUY",
            volume_lots = 0.0,                       # follower lot config decides size
            entry_price = sig.entry or 0.0,
            stop_loss   = sig.stop_loss,
            take_profit = sig.take_profits[0] if sig.take_profits else None,
        )

    def stop(self) -> None:
        # Sync stop (engine.stop_provider calls this synchronously) — schedule the
        # async disconnect so we don't block the loop.
        if self._client:
            asyncio.ensure_future(self._client.disconnect())
            self._client = None

    def needs_recycle(self, *_a, **_k) -> bool:
        return False
