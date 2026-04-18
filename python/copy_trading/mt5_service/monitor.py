"""
MT5 master account monitor.
Polls the MetaTrader 5 terminal via mt5linux to detect OPEN / MODIFY / CLOSE
events on the provider account and converts them to NormalisedSignal objects.

Path B (single terminal): each poll cycle acquires the shared asyncio lock,
logs in as the provider, reads positions, then releases. This yields the
terminal to execution workers between polls.
"""
import asyncio
import logging
from typing import Optional
from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue
from ..config import MT5_POLL_INTERVAL_SEC, MT5_RECONNECT_ATTEMPTS, MT5_RECONNECT_DELAY_SEC
from ..mt5_instance import get_mt5, MT5_AVAILABLE
from ..mt5_lock import get_mt5_lock

log = logging.getLogger(__name__)


def _decrypt_password(enc: str) -> str:
    from ..config import ENCRYPTION_KEY
    if not ENCRYPTION_KEY:
        import base64
        try:
            return base64.b64decode(enc).decode()
        except Exception:
            return enc
    try:
        import base64
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key = bytes.fromhex(ENCRYPTION_KEY)
        raw = base64.b64decode(enc)
        nonce, ct = raw[:12], raw[12:]
        return AESGCM(key).decrypt(nonce, ct, None).decode()
    except Exception as e:
        log.error("[MT5] Password decrypt failed: %s", e)
        return enc


class MT5Monitor:
    """
    Polls the provider's MT5 account and emits NormalisedSignals on
    OPEN / MODIFY / CLOSE events.

    Each poll cycle:
      1. Acquires the shared mt5 lock
      2. Logs in as the provider
      3. Reads positions
      4. Releases the lock (terminal free for execution workers)

    This connect-per-poll design avoids holding the terminal between
    polls and eliminates conflicts with follower execution logins.
    """

    def __init__(self, account_config: dict, master_id: str):
        self.login:     int  = int(account_config["login_id"])
        self.password:  str  = _decrypt_password(account_config["password_enc"])
        self.server:    str  = account_config.get("broker_server", "")
        self.master_id: str  = master_id
        self._snapshot: dict = {}
        self._running:  bool = False

    def _connect(self) -> bool:
        if not MT5_AVAILABLE:
            return False
        mt5 = get_mt5()
        mt5.initialize()
        if not mt5.login(self.login, password=self.password, server=self.server):
            log.error("[MT5] login(%s) failed: %s", self.login, mt5.last_error())
            mt5.shutdown()
            return False
        return True

    def _disconnect(self) -> None:
        if MT5_AVAILABLE:
            get_mt5().shutdown()

    def _get_positions(self) -> dict:
        if not MT5_AVAILABLE:
            return {}
        positions = get_mt5().positions_get()
        if positions is None:
            return {}
        return {p.ticket: p._asdict() for p in positions}

    def _emit(self, signal: NormalisedSignal) -> None:
        enqueue(signal)

    async def run(self) -> None:
        """Main polling loop — connect-per-poll with shared lock."""
        self._running = True
        fail_count = 0

        log.info("[MT5] Monitor started for master=%s login=%s", self.master_id, self.login)

        # Seed initial snapshot
        async with get_mt5_lock():
            if self._connect():
                self._snapshot = self._get_positions()
                self._disconnect()
                log.info("[MT5] Initial snapshot: %d open positions", len(self._snapshot))
            else:
                log.warning("[MT5] Initial connect failed for login=%s", self.login)

        while self._running:
            await asyncio.sleep(MT5_POLL_INTERVAL_SEC)

            async with get_mt5_lock():
                try:
                    if not self._connect():
                        fail_count += 1
                        if fail_count >= MT5_RECONNECT_ATTEMPTS:
                            log.error("[MT5] %d consecutive failures — stopping monitor for login=%s",
                                      fail_count, self.login)
                            break
                        await asyncio.sleep(MT5_RECONNECT_DELAY_SEC * fail_count)
                        continue

                    fail_count = 0
                    current = self._get_positions()
                    self._diff(self._snapshot, current)
                    self._snapshot = current

                except Exception as e:
                    log.error("[MT5] Poll error for login=%s: %s", self.login, e, exc_info=True)
                    fail_count += 1
                finally:
                    self._disconnect()

    def _diff(self, old: dict, new: dict) -> None:
        old_tickets = set(old)
        new_tickets = set(new)

        for ticket in new_tickets - old_tickets:
            p = new[ticket]
            self._emit(NormalisedSignal(
                source="mt5",
                symbol=p["symbol"],
                action="BUY" if p["type"] == 0 else "SELL",
                event_type="OPEN",
                trade_id=str(ticket),
                master_id=self.master_id,
                volume=p["volume"],
                entry_price=p["price_open"],
                stop_loss=p["sl"] or None,
                take_profit=p["tp"] or None,
                raw_payload={"ticket": ticket},
            ))

        for ticket in old_tickets - new_tickets:
            p = old[ticket]
            self._emit(NormalisedSignal(
                source="mt5",
                symbol=p["symbol"],
                action="BUY" if p["type"] == 0 else "SELL",
                event_type="CLOSE",
                trade_id=str(ticket),
                master_id=self.master_id,
                volume=p["volume"],
                entry_price=p["price_open"],
                raw_payload={"ticket": ticket},
            ))

        for ticket in old_tickets & new_tickets:
            o, n = old[ticket], new[ticket]
            if o["sl"] != n["sl"] or o["tp"] != n["tp"]:
                p = n
                self._emit(NormalisedSignal(
                    source="mt5",
                    symbol=p["symbol"],
                    action="BUY" if p["type"] == 0 else "SELL",
                    event_type="MODIFY",
                    trade_id=str(ticket),
                    master_id=self.master_id,
                    volume=p["volume"],
                    entry_price=p["price_open"],
                    stop_loss=p["sl"] or None,
                    take_profit=p["tp"] or None,
                    raw_payload={"ticket": ticket, "old_sl": o["sl"], "old_tp": o["tp"]},
                ))

    def stop(self) -> None:
        self._running = False
