"""
The cTrader connection for autotrade: connect → app auth → account auth → symbols → send → resolve.

Deliberately separate from copy_platform's executor. That one places MARKET orders for followers and
moves real money on its own release cycle; this is a diagnostic instrument for one strategy on one
demo account. Neither should be able to break the other, and neither should have to be regression-
tested because the other changed.

The wire format lives in execution/orders.py — this file only owns the conversation.
"""
import asyncio
import logging

from execution.orders import OrderResult, build_amend, build_cancel, build_stop, read_execution

log = logging.getLogger(__name__)

_TIMEOUT = 20


class StopOrderClient:
    """One connection, one command, then closed. Mirrors the copy executor's proven lifecycle."""

    def __init__(self, creds: dict, account_type: str = "demo"):
        self.creds = creds
        self.account_type = account_type
        self._future: asyncio.Future | None = None
        self._client = None
        self._cmd = None
        self._symbol_map: dict[str, int] = {}

    async def place_stop(self, symbol: str, side: str, volume: int,
                         stop_price: float, sl: float, tp: float,
                         expiry_ms: int | None = None) -> OrderResult:
        self._cmd = ("stop", symbol, side, volume, stop_price, sl, tp, expiry_ms)
        return await self._run()

    async def cancel(self, order_id: int) -> OrderResult:
        self._cmd = ("cancel", int(order_id))
        return await self._run()

    async def amend_sltp(self, position_id: int, symbol: str, sl: float,
                         tp: float | None) -> OrderResult:
        """Move a live position's stop. `tp` is the position's CURRENT target, re-passed so the
        broker cannot read its absence as a removal — see `orders.build_amend`."""
        self._cmd = ("amend", int(position_id), symbol, float(sl), tp)
        return await self._run()

    # ── internals ──────────────────────────────────────────────────────────────

    async def _run(self) -> OrderResult:
        from ctrader_open_api import Client, TcpProtocol
        from copy_platform.executors.ctrader import CT_DEMO_HOST, CT_LIVE_HOST, CT_PORT
        host = CT_DEMO_HOST if self.account_type == "demo" else CT_LIVE_HOST
        self._future = asyncio.get_event_loop().create_future()
        self._client = Client(host, CT_PORT, TcpProtocol)
        self._client.setConnectedCallback(self._on_connected)
        self._client.setMessageReceivedCallback(self._on_message)
        self._client.startService()
        try:
            return await asyncio.wait_for(self._future, timeout=_TIMEOUT)
        except asyncio.TimeoutError:
            # A timeout means the order's state is UNKNOWN, not failed. Say so: "assume it failed"
            # is how one intended order becomes two real ones.
            return OrderResult(ok=False,
                               error="timed out — order state UNKNOWN, reconcile before any retry")
        finally:
            self._client.stopService()

    def _resolve(self, result: OrderResult) -> None:
        if self._future and not self._future.done():
            self._future.set_result(result)

    def _on_connected(self, client):
        from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAApplicationAuthReq
        from config import ctrader_app_creds
        cid, secret = ctrader_app_creds()
        req = ProtoOAApplicationAuthReq()
        req.clientId, req.clientSecret = cid, secret
        client.send(req)

    def _on_message(self, client, message):
        from ctrader_open_api import Protobuf
        from ctrader_open_api.messages.OpenApiMessages_pb2 import (
            ProtoOAApplicationAuthRes, ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
            ProtoOASymbolsListReq, ProtoOASymbolsListRes, ProtoOAExecutionEvent)
        ptype = message.payloadType

        if ptype == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAAccountAuthReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            req.accessToken = self.creds["accessToken"]
            client.send(req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            # A stop order needs symbolId, so fetch the symbol list first. A cancel takes an
            # orderId and can go straight out.
            # Only a NEW order needs the symbol list (it resolves a symbolId). A cancel keys on
            # orderId and an amend on positionId, so both go straight out.
            if self._cmd and self._cmd[0] == "stop":
                req = ProtoOASymbolsListReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                client.send(req)
            else:
                self._send(client)

        elif ptype == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(message, ProtoOASymbolsListRes)
            self._symbol_map = {s.symbolName: s.symbolId for s in res.symbol}
            self._send(client)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message, ProtoOAExecutionEvent)
            verdict = read_execution(event,
                                     is_cancel=bool(self._cmd and self._cmd[0] == "cancel"),
                                     is_amend=bool(self._cmd and self._cmd[0] == "amend"))
            if verdict is not None:
                self._resolve(verdict)

    def _send(self, client):
        acct = int(self.creds["ctraderId"])
        if self._cmd[0] == "cancel":
            client.send(build_cancel(acct, self._cmd[1]))
            return
        if self._cmd[0] == "amend":
            _, position_id, symbol, sl, tp = self._cmd
            client.send(build_amend(acct, position_id, symbol, sl, tp))
            return
        _, symbol, side, volume, stop_price, sl, tp, expiry_ms = self._cmd
        req, err = build_stop(acct, symbol, side, volume, stop_price, sl, tp,
                              expiry_ms, self._symbol_map)
        if err:
            self._resolve(OrderResult(ok=False, error=err))
            return
        client.send(req)
