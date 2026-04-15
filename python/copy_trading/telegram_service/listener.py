"""
Telegram signal listener using Telethon (user-session, not bot).
One listener instance per telegram_signal_sources row.

Pipeline:
  Channel message → parser.parse_message() → NormalisedSignal → producer.enqueue()
"""
import asyncio
import logging
import os
from typing import Optional

from telethon import TelegramClient, events
from telethon.sessions import StringSession

from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue
from .parser import parse_message
from ..config import TELEGRAM_SESSION_DIR

log = logging.getLogger(__name__)


class TelegramListener:
    """
    Connects to Telegram as a user (MTProto) and listens to one or more
    channels for trade signals.
    """

    def __init__(self, source_config: dict):
        """
        source_config is a row from telegram_signal_sources joined to copy_masters.
        Required keys: api_id, api_hash_enc, phone_number, channel_name, master_id
        Optional:      entry_keyword, sl_keyword, tp_keyword, symbol_keyword,
                       execute_no_sl, execute_no_tp, use_first_tp_only,
                       auto_update, filter_sender, session_file
        """
        self.cfg = source_config
        self.master_id:  str = source_config["master_id"]
        self.api_id:     int = int(source_config["api_id"])
        # api_hash is stored encrypted; decrypt here if ENCRYPTION_KEY is set
        self.api_hash:   str = self._decrypt(source_config.get("api_hash_enc", ""))
        self.phone:      str = source_config.get("phone_number", "")
        self.channel:    str = source_config.get("channel_name", "")
        self.filter_sender: Optional[str] = source_config.get("filter_sender")

        session_file = source_config.get("session_file") or os.path.join(
            TELEGRAM_SESSION_DIR, f"session_{self.master_id}"
        )
        os.makedirs(TELEGRAM_SESSION_DIR, exist_ok=True)
        self.client = TelegramClient(session_file, self.api_id, self.api_hash)
        self._running = False

    # ── Decryption stub (replace with AES when ENCRYPTION_KEY is set) ────────
    @staticmethod
    def _decrypt(cipher: str) -> str:
        from ..config import ENCRYPTION_KEY
        if not ENCRYPTION_KEY:
            # Development mode: value stored as plain text or base64
            import base64
            try:
                return base64.b64decode(cipher).decode()
            except Exception:
                return cipher
        # Production: AES-256-GCM via cryptography library
        try:
            import base64
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            key = bytes.fromhex(ENCRYPTION_KEY)
            raw = base64.b64decode(cipher)
            nonce, ct = raw[:12], raw[12:]
            return AESGCM(key).decrypt(nonce, ct, None).decode()
        except Exception as e:
            log.error("[TG] Decryption failed: %s", e)
            return cipher

    async def start(self) -> None:
        log.info("[TG] Starting listener for master=%s channel=%s", self.master_id, self.channel)
        await self.client.start(phone=self.phone)
        self._running = True

        @self.client.on(events.NewMessage(chats=self.channel))
        async def handler(event):
            await self._handle_message(event)

        log.info("[TG] Listening to %s", self.channel)
        await self.client.run_until_disconnected()

    async def _handle_message(self, event) -> None:
        try:
            msg = event.message
            text: str = msg.text or ""
            if not text.strip():
                return

            # Sender filter
            if self.filter_sender:
                sender = await event.get_sender()
                username = getattr(sender, "username", None) or ""
                if username.lstrip("@").lower() != self.filter_sender.lstrip("@").lower():
                    return

            parsed = parse_message(
                text,
                entry_kw=self.cfg.get("entry_keyword", "entry"),
                sl_kw=self.cfg.get("sl_keyword", "sl"),
                tp_kw=self.cfg.get("tp_keyword", "tp"),
                symbol_kw=self.cfg.get("symbol_keyword", ""),
                use_first_tp_only=self.cfg.get("use_first_tp_only", True),
            )
            if not parsed:
                log.debug("[TG] Message skipped (no signal detected): %.60s", text)
                return

            # Reject low-confidence signals with no SL if execute_no_sl is off
            if parsed.sl is None and not self.cfg.get("execute_no_sl", False):
                log.info("[TG] Skipping signal — no SL and execute_no_sl=False")
                return
            if parsed.tp is None and not self.cfg.get("execute_no_tp", True):
                log.info("[TG] Skipping signal — no TP and execute_no_tp=False")
                return

            signal = NormalisedSignal(
                source="telegram",
                symbol=parsed.symbol,
                action=parsed.direction,
                event_type="OPEN",
                trade_id=str(msg.id),
                master_id=self.master_id,
                entry_price=parsed.entry,
                stop_loss=parsed.sl,
                take_profit=parsed.tp,
                raw_payload={"text": text, "message_id": msg.id, "confidence": parsed.confidence},
            )
            enqueue(signal)

        except Exception as e:
            log.error("[TG] Error handling message: %s", e, exc_info=True)

    async def stop(self) -> None:
        self._running = False
        if self.client.is_connected():
            await self.client.disconnect()
        log.info("[TG] Listener stopped for master=%s", self.master_id)


async def run_listeners(sources: list[dict]) -> None:
    """Launch one listener per Telegram source config concurrently."""
    listeners = [TelegramListener(src) for src in sources]
    await asyncio.gather(*[l.start() for l in listeners], return_exceptions=True)
