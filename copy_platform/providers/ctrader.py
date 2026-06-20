"""
cTrader Open API provider — real-time position events via TCP/protobuf.
One CTraderProvider instance per master broker account.
Position events are pushed by cTrader the moment they occur (no polling).

Auth flow: ApplicationAuth → AccountAuth → subscribe → receive ProtoOAExecutionEvents
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Callable, Awaitable

from ctrader_open_api import Client, Protobuf, TcpProtocol
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
)
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOAReconcileReq, ProtoOAReconcileRes,
    ProtoOAExecutionEvent,
)

from config import CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT, RECONNECT_DELAY, \
    RECONCILE_INTERVAL, CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET

log = logging.getLogger("provider.ctrader")

OnEvent = Callable[[dict, str], Awaitable[None]]   # (event_dict, master_id)


@dataclass
class PositionSnapshot:
    position_id: int
    symbol:      str
    action:      str   # BUY | SELL
    volume_lots: float
    entry_price: float
    stop_loss:   float | None
    take_profit: float | None


class CTraderProvider:
    """Connects to cTrader for one master account and fires on_event callbacks."""

    def __init__(self, master_id: str, creds: dict, account_type: str,
                 on_event: OnEvent):
        self.master_id    = master_id
        self.creds        = creds
        self.account_type = account_type
        self.on_event     = on_event
        self._positions: dict[int, PositionSnapshot] = {}
        self._authed      = False
        self._reconciled  = False
        self._reconcile_scheduled = False
        self._connected   = False
        self._disconnected_since: float | None = None
        self._loop        = asyncio.get_running_loop()

        host = CT_LIVE_HOST if account_type == "live" else CT_DEMO_HOST
        self.client = Client(host, CT_PORT, TcpProtocol)
        self.client.setConnectedCallback(self._on_connected)
        self.client.setDisconnectedCallback(self._on_disconnected)
        self.client.setMessageReceivedCallback(self._on_message)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def start(self) -> None:
        log.info(f"[{self.master_id}] connecting to cTrader Open API")
        self.client.startService()

    def stop(self) -> None:
        self.client.stopService()

    def needs_recycle(self, max_down: float = 300.0) -> bool:
        """True if disconnected longer than max_down — the engine supervisor recycles it."""
        return (not self._connected and self._disconnected_since is not None
                and (time.monotonic() - self._disconnected_since) > max_down)

    def _request_reconcile(self) -> None:
        """Periodic safety net — re-fetch open positions to catch missed closes."""
        if self._authed:
            try:
                req = ProtoOAReconcileReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                self.client.send(req)
            except Exception as e:
                log.warning(f"[{self.master_id}] reconcile request failed: {e}")
        self._loop.call_later(RECONCILE_INTERVAL, self._request_reconcile)

    # ── Twisted callbacks ──────────────────────────────────────────────────────

    def _on_connected(self, client):
        self._connected = True
        self._disconnected_since = None
        req = ProtoOAApplicationAuthReq()
        req.clientId     = CTRADER_CLIENT_ID
        req.clientSecret = CTRADER_CLIENT_SECRET
        client.send(req)

    def _on_disconnected(self, client, reason):
        log.warning(f"[{self.master_id}] disconnected: {reason}. Reconnecting in {RECONNECT_DELAY}s")
        self._authed = False
        self._reconciled = False
        self._connected = False
        if self._disconnected_since is None:
            self._disconnected_since = time.monotonic()
        self._loop.call_later(RECONNECT_DELAY, self.start)

    def _on_message(self, client, message):
        ptype = message.payloadType

        if ptype == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAAccountAuthReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            req.accessToken         = self.creds["accessToken"]
            client.send(req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            self._authed = True
            log.info(f"[{self.master_id}] authenticated — requesting open positions")
            req = ProtoOAReconcileReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            client.send(req)
            if not self._reconcile_scheduled:   # one chain for the provider's lifetime
                self._reconcile_scheduled = True
                self._loop.call_later(RECONCILE_INTERVAL, self._request_reconcile)

        elif ptype == ProtoOAReconcileRes().payloadType:
            res = Protobuf.extract(message, ProtoOAReconcileRes)
            fresh: dict[int, PositionSnapshot] = {}
            for pos in res.position:
                snap = self._snap(pos)
                fresh[snap.position_id] = snap
            if not self._reconciled:
                # Initial load after auth — record, no diff.
                self._positions = fresh
                self._reconciled = True
                log.info(f"[{self.master_id}] loaded {len(self._positions)} open positions")
            else:
                # Periodic safety reconcile — a position that vanished was closed on
                # the master (possibly via a missed event); emit a synthetic CLOSE.
                for pid, prev in list(self._positions.items()):
                    if pid not in fresh:
                        self._positions.pop(pid, None)
                        log.info(f"[{self.master_id}] reconcile: position {pid} closed externally")
                        asyncio.ensure_future(
                            self.on_event({"type": "CLOSE", "snap": prev}, self.master_id))
                # Track newly-seen positions silently — do NOT emit OPEN (the live
                # execution event already handles opens; avoids double-copying).
                for pid, snap in fresh.items():
                    self._positions.setdefault(pid, snap)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message, ProtoOAExecutionEvent)
            asyncio.ensure_future(self._handle_execution(event))

    # ── Event handling ─────────────────────────────────────────────────────────

    async def _handle_execution(self, event) -> None:
        et   = event.executionType  # ORDER_FILLED | POSITION_PARTIAL_CLOSE | POSITION_CLOSE
        pos  = event.position if event.HasField("position") else None
        if pos is None:
            return

        pid  = pos.positionId
        snap = self._snap(pos)
        prev = self._positions.get(pid)

        if et == 2 and prev is None:            # ORDER_FILLED = new position opened
            self._positions[pid] = snap
            await self.on_event({"type": "OPEN",   "snap": snap}, self.master_id)

        elif et in (3, 4):                       # POSITION_PARTIAL_CLOSE / POSITION_CLOSE
            self._positions.pop(pid, None)
            snap.entry_price = pos.price if pos.price else snap.entry_price
            await self.on_event({"type": "CLOSE",  "snap": snap}, self.master_id)

        elif prev and (prev.stop_loss != snap.stop_loss or
                       prev.take_profit != snap.take_profit):
            self._positions[pid] = snap
            await self.on_event({"type": "MODIFY", "snap": snap, "prev": prev}, self.master_id)

    @staticmethod
    def _snap(pos) -> PositionSnapshot:
        td = pos.tradeData
        return PositionSnapshot(
            position_id = pos.positionId,
            symbol      = td.symbolName,
            action      = "BUY" if td.tradeSide == 1 else "SELL",
            volume_lots = td.volume / 100,   # cTrader volume = centilots
            entry_price = float(pos.price) if pos.price else 0.0,
            stop_loss   = float(pos.stopLoss)   if pos.stopLoss   else None,
            take_profit = float(pos.takeProfit) if pos.takeProfit else None,
        )
