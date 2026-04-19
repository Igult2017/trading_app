"""
Telegram signal listener using Telethon (user-session, not bot).
One listener instance per telegram_signal_sources row.

Pipeline:
  Channel message → parser.parse_message() → NormalisedSignal → producer.enqueue()

Fixes applied:
  - Automatic reconnect loop with exponential back-off (10 → 60 s cap)
  - Session file must be pre-authenticated; interactive OTP is not possible
    inside a running service — authenticate once via the CLI helper and
    commit the session file before starting.
"""
import asyncio
import logging
import os
from typing import Optional

from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue
from .parser import parse_message
from ..config import TELEGRAM_SESSION_DIR

log = logging.getLogger(__name__)

try:
    from telethon import TelegramClient, events
    TELETHON_AVAILABLE = True
except ImportError:
    TELETHON_AVAILABLE = False
    log.warning("[TG] Telethon not installed — Telegram listener is disabled")


class TelegramListener:
    """
    Connects to Telegram as a user (MTProto) and listens to one or more
    channels for trade signals.  Reconnects automatically on disconnect.
    """

    def __init__(self, source_config: dict):
        self.cfg        = source_config
        self.master_id  = source_config["master_id"]
        self.api_id     = int(source_config["api_id"])
        self.api_hash   = self._decrypt(source_config.get("api_hash_enc", ""))
        self.phone      = source_config.get("phone_number", "")
        self.channel    = source_config.get("channel_name", "")
        self.filter_sender: Optional[str] = source_config.get("filter_sender")
        self._running   = False

        session_file = source_config.get("session_file") or os.path.join(
            TELEGRAM_SESSION_DIR, f"session_{self.master_id}"
        )
        os.makedirs(TELEGRAM_SESSION_DIR, exist_ok=True)
        self._session_file = session_file

    @staticmethod
    def _decrypt(cipher: str) -> str:
        """Decrypt a value stored by the Node.js server.

        Node.js crypto.ts format:  ivHex:tagHex:ciphertextHex  (colon-separated hex)
        Fallback (no key set):     plain base64.
        """
        from ..config import ENCRYPTION_KEY
        if not ENCRYPTION_KEY:
            import base64
            try:
                return base64.b64decode(cipher).decode()
            except Exception:
                return cipher
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            key   = bytes.fromhex(ENCRYPTION_KEY)
            parts = cipher.split(":")
            if len(parts) == 3:
                # Node.js format: ivHex:tagHex:ciphertextHex
                nonce      = bytes.fromhex(parts[0])
                tag        = bytes.fromhex(parts[1])
                ciphertext = bytes.fromhex(parts[2])
                return AESGCM(key).decrypt(nonce, ciphertext + tag, None).decode()
            else:
                # Legacy Python base64(nonce + ciphertext+tag) format
                import base64
                raw = base64.b64decode(cipher)
                return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode()
        except Exception as e:
            log.error("[TG] Decryption failed: %s", e)
            return cipher

    def _make_client(self) -> "TelegramClient":
        return TelegramClient(self._session_file, self.api_id, self.api_hash)

    async def start(self) -> None:
        """Entry point — runs the reconnect loop indefinitely."""
        if not TELETHON_AVAILABLE:
            log.error("[TG] Telethon not installed — cannot start listener for master=%s", self.master_id)
            return

        self._running = True
        log.info("[TG] Starting listener for master=%s channel=%s", self.master_id, self.channel)

        delay = 10
        max_delay = 60

        while self._running:
            try:
                await self._run_once()
                # If run_once returns cleanly, the client disconnected
                if self._running:
                    log.warning("[TG] master=%s disconnected — reconnecting in %ds", self.master_id, delay)
            except Exception as e:
                log.error("[TG] master=%s error: %s — reconnecting in %ds", self.master_id, e, delay)

            if not self._running:
                break

            await asyncio.sleep(delay)
            delay = min(delay * 2, max_delay)   # exponential back-off, capped at 60 s

    async def _run_once(self) -> None:
        """Connect, register handler, and run until disconnected."""
        client = self._make_client()

        # NOTE: client.start() requires an authenticated session file.
        # If the session file does not exist, Telethon will attempt an
        # interactive OTP flow which is impossible inside a running service.
        # Authenticate once via the CLI: python -m python.copy_trading.auth_helper
        await client.start(phone=self.phone)

        @client.on(events.NewMessage(chats=self.channel))
        async def handler(event):
            await self._handle_message(event)

        log.info("[TG] Connected and listening to %s (master=%s)", self.channel, self.master_id)
        await client.run_until_disconnected()

    async def _handle_message(self, event) -> None:
        try:
            msg  = event.message
            text = msg.text or ""
            if not text.strip():
                return

            if self.filter_sender:
                sender   = await event.get_sender()
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

            # SL/TP validation only applies to OPEN signals.
            if parsed.event_type == "OPEN":
                if parsed.sl is None and not self.cfg.get("execute_no_sl", False):
                    log.info("[TG] Skipping OPEN — no SL and execute_no_sl=False")
                    return
                if parsed.tp is None and not self.cfg.get("execute_no_tp", True):
                    log.info("[TG] Skipping OPEN — no TP and execute_no_tp=False")
                    return

            signal = NormalisedSignal(
                source="telegram",
                symbol=parsed.symbol,
                action=parsed.direction,
                event_type=parsed.event_type,
                trade_id=str(msg.id),
                master_id=self.master_id,
                entry_price=parsed.entry,
                stop_loss=parsed.sl,
                take_profit=parsed.tp,
                raw_payload={
                    "text": text,
                    "message_id": msg.id,
                    "confidence": parsed.confidence,
                },
            )
            enqueue(signal)

        except Exception as e:
            log.error("[TG] Error handling message: %s", e, exc_info=True)

    async def stop(self) -> None:
        self._running = False
        log.info("[TG] Listener stopped for master=%s", self.master_id)


async def run_listeners(sources: list[dict]) -> None:
    """Launch one listener per Telegram source config concurrently."""
    listeners = [TelegramListener(src) for src in sources]
    await asyncio.gather(*[l.start() for l in listeners], return_exceptions=True)
