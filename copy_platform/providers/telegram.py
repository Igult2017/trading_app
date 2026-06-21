"""
Telegram provider — ONE shared Bot-API poll loop for the platform copy-bot reads
channel posts from every provider channel and routes each to the matching master.
Scales to many channels with a single long-poll (no per-channel connection, no
user account, no phone/OTP). The copy-bot must be an admin of each channel.

Telegram signals carry no lot size and no position id, so:
  • volume is 0 — the follower's own lot config (fixed / risk) decides size.
  • position_id is keyed by SYMBOL so a later CLOSE links to the original OPEN.
"""
import asyncio
import hashlib
import logging

import aiohttp

from config import TELEGRAM_COPY_BOT_TOKEN
from telegram_parser import parse_signal
from providers.ctrader import PositionSnapshot   # reuse the snapshot contract

log = logging.getLogger("provider.telegram")

_API = "https://api.telegram.org/bot{token}/getUpdates"
_RANK = {"high": 3, "medium": 2, "low": 1}


def _symbol_key(symbol: str) -> int:
    """Stable per-symbol id (md5, not hash()) so OPEN<->CLOSE link across restarts."""
    return int(hashlib.md5(symbol.encode()).hexdigest()[:12], 16) % 1_000_000_000


class TelegramListener:
    """Singleton: one getUpdates loop, routes channel posts to registered masters."""

    def __init__(self, token: str):
        self._token = token
        self._routes: dict[str, list[tuple]] = {}   # channel_key -> [(master_id, cfg, on_event)]
        self._offset = 0
        self._task: asyncio.Task | None = None

    def register(self, channel: str, master_id: str, cfg: dict, on_event) -> None:
        key = (channel or "").lstrip("@").lower()
        if not key:
            return
        self._routes.setdefault(key, []).append((master_id, cfg, on_event))
        if self._task is None:
            self._task = asyncio.ensure_future(self._poll_loop())
        log.info("[tg] channel '%s' -> master %s", key, master_id)

    def unregister(self, master_id: str) -> None:
        for key in list(self._routes):
            self._routes[key] = [r for r in self._routes[key] if r[0] != master_id]
            if not self._routes[key]:
                del self._routes[key]

    async def _poll_loop(self) -> None:
        url = _API.format(token=self._token)
        async with aiohttp.ClientSession() as session:
            log.info("[tg] copy-bot poll loop started")
            while True:
                try:
                    params = {"timeout": 50, "offset": self._offset,
                              "allowed_updates": '["channel_post","edited_channel_post"]'}
                    async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=65)) as r:
                        data = await r.json()
                    if not data.get("ok"):
                        await asyncio.sleep(5)
                        continue
                    for upd in data.get("result", []):
                        self._offset = upd["update_id"] + 1
                        post = upd.get("channel_post") or upd.get("edited_channel_post")
                        if post:
                            self._handle_post(post)
                except Exception as e:
                    log.warning("[tg] poll error: %s", e)
                    await asyncio.sleep(5)

    def _handle_post(self, post: dict) -> None:
        chat = post.get("chat", {})
        text = post.get("text") or post.get("caption") or ""
        keys = ([chat["username"].lower()] if chat.get("username") else []) + [str(chat.get("id"))]
        for key in keys:
            for (master_id, cfg, on_event) in self._routes.get(key, []):
                sig = parse_signal(text, cfg)
                if not sig:
                    continue
                if _RANK.get(sig.confidence, 0) < _RANK.get(cfg.get("min_confidence", "medium"), 2):
                    log.info("[tg] master %s skipped %s-confidence signal (%s)", master_id, sig.confidence, sig.reason)
                    continue
                snap = self._to_snapshot(sig)
                if snap:
                    asyncio.ensure_future(on_event({"type": sig.event_type, "snap": snap}, master_id))

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


_listener: TelegramListener | None = None


def _get_listener() -> TelegramListener | None:
    global _listener
    if not TELEGRAM_COPY_BOT_TOKEN:
        return None
    if _listener is None:
        _listener = TelegramListener(TELEGRAM_COPY_BOT_TOKEN)
    return _listener


class TelegramProvider:
    """Per-master adapter — registers its channel with the shared listener."""

    def __init__(self, master_id: str, channel: str, cfg: dict, on_event):
        self.master_id = master_id
        self.channel   = channel
        self.cfg       = cfg
        self.on_event  = on_event

    def start(self) -> None:
        listener = _get_listener()
        if not listener:
            log.warning("[tg] TELEGRAM_COPY_BOT_TOKEN not set — master %s cannot listen", self.master_id)
            return
        listener.register(self.channel, self.master_id, self.cfg, self.on_event)

    def stop(self) -> None:
        listener = _get_listener()
        if listener:
            listener.unregister(self.master_id)

    def needs_recycle(self, *_a, **_k) -> bool:
        return False   # the shared poll loop self-heals; nothing per-master to recycle
