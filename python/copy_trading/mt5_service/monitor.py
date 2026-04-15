"""
MT5 master account monitor.
Polls the MetaTrader 5 Python API to detect OPEN / MODIFY / CLOSE events
on the master account and converts them to NormalisedSignal objects.

Pipeline:
  MT5 master account → detect position changes → NormalisedSignal → producer.enqueue()
"""
import asyncio
import logging
import time
from typing import Optional
from ..models import NormalisedSignal
from ..ingestion_service.producer import enqueue
from ..config import MT5_POLL_INTERVAL_SEC, MT5_RECONNECT_ATTEMPTS, MT5_RECONNECT_DELAY_SEC

log = logging.getLogger(__name__)

# ── Optional MT5 import (Windows only / MT5 terminal must be installed) ──────
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    log.warning("[MT5] MetaTrader5 package not installed — monitor is a no-op")


def _decrypt_password(enc: str) -> str:
    """Base64 placeholder — replaced by AES decrypt when ENCRYPTION_KEY is set."""
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
    Connects to an MT5 master terminal and emits NormalisedSignals when
    positions are opened, modified, or closed.
    """

    def __init__(self, account_config: dict, master_id: str):
        """
        account_config: row from copy_accounts joined to copy_masters
        master_id:      UUID from copy_masters
        """
        self.login:       int = int(account_config["login_id"])
        self.password:    str = _decrypt_password(account_config["password_enc"])
        self.server:      str = account_config.get("broker_server", "")
        self.master_id:   str = master_id
        self._snapshot:   dict = {}    # ticket → position snapshot
        self._running:    bool = False

    def _connect(self) -> bool:
        if not MT5_AVAILABLE:
            return False
        if not mt5.initialize():
            log.error("[MT5] initialize() failed: %s", mt5.last_error())
            return False
        if not mt5.login(self.login, password=self.password, server=self.server):
            log.error("[MT5] login(%s) failed: %s", self.login, mt5.last_error())
            mt5.shutdown()
            return False
        info = mt5.account_info()
        log.info("[MT5] Connected: %s balance=%.2f", info.login, info.balance)
        return True

    def _disconnect(self) -> None:
        if MT5_AVAILABLE:
            mt5.shutdown()

    def _get_positions(self) -> dict:
        if not MT5_AVAILABLE:
            return {}
        positions = mt5.positions_get()
        if positions is None:
            return {}
        return {p.ticket: p._asdict() for p in positions}

    def _emit(self, signal: NormalisedSignal) -> None:
        enqueue(signal)

    async def run(self) -> None:
        """Main polling loop. Reconnects on failure with exponential back-off."""
        self._running = True
        attempt = 0

        while self._running:
            if not self._connect():
                attempt += 1
                if attempt > MT5_RECONNECT_ATTEMPTS:
                    log.error("[MT5] Max reconnect attempts reached for login=%s", self.login)
                    break
                delay = MT5_RECONNECT_DELAY_SEC * (2 ** (attempt - 1))
                log.warning("[MT5] Reconnecting in %.0fs (attempt %d)", delay, attempt)
                await asyncio.sleep(delay)
                continue

            attempt = 0
            self._snapshot = self._get_positions()
            log.info("[MT5] Polling started. %d open positions.", len(self._snapshot))

            try:
                while self._running:
                    await asyncio.sleep(MT5_POLL_INTERVAL_SEC)
                    current = self._get_positions()
                    self._diff(self._snapshot, current)
                    self._snapshot = current
            except Exception as e:
                log.error("[MT5] Poll error: %s — reconnecting", e, exc_info=True)
            finally:
                self._disconnect()

    def _diff(self, old: dict, new: dict) -> None:
        """Detect OPEN, MODIFY, CLOSE events by comparing position snapshots."""
        old_tickets = set(old)
        new_tickets = set(new)

        # OPEN — new tickets
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

        # CLOSE — removed tickets
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

        # MODIFY — same ticket but SL/TP changed
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
