"""
cTrader executor — places / closes / modifies orders on follower accounts
via the cTrader Open API (TCP/protobuf).

Each call opens a short-lived authenticated connection, sends the command,
waits for the execution event, then disconnects. This keeps follower
connections idle (not keeping 1 TCP connection per follower open at all times).
"""
import asyncio
import logging
from dataclasses import dataclass

from twisted.internet import defer
from ctrader_open_api import Client, Protobuf, EndPoints, TcpProtocol
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
)
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOANewOrderReq, ProtoOAClosePositionReq,
    ProtoOAAmendPositionSLTPReq, ProtoOAExecutionEvent,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAOrderType

from config import CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT, \
    CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET

log = logging.getLogger("executor.ctrader")


@dataclass
class ExecResult:
    ok:          bool
    external_id: str | None = None
    entry_price: float | None = None
    error:       str | None = None


class CTraderExecutor:
    """One-shot executor for a follower's cTrader account."""

    def __init__(self, creds: dict, account_type: str):
        self.creds        = creds
        self.account_type = account_type
        self._result_future: asyncio.Future | None = None
        self._client: Client | None = None

    def _make_client(self) -> Client:
        host = CT_LIVE_HOST if self.account_type == "live" else CT_DEMO_HOST
        c = Client(host, CT_PORT, TcpProtocol)
        c.setConnectedCallback(self._on_connected)
        c.setMessageReceivedCallback(self._on_message)
        return c

    # ── Public API ─────────────────────────────────────────────────────────────

    async def open_position(self, symbol: str, action: str,
                            volume_lots: float, sl: float | None,
                            tp: float | None) -> ExecResult:
        self._pending_cmd = ("open", symbol, action, volume_lots, sl, tp)
        return await self._run()

    async def close_position(self, position_id: int,
                             volume_lots: float) -> ExecResult:
        self._pending_cmd = ("close", position_id, volume_lots)
        return await self._run()

    async def modify_position(self, position_id: int,
                              sl: float | None, tp: float | None) -> ExecResult:
        self._pending_cmd = ("modify", position_id, sl, tp)
        return await self._run()

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _run(self) -> ExecResult:
        loop = asyncio.get_event_loop()
        self._result_future = loop.create_future()
        self._client = self._make_client()
        self._client.startService()
        try:
            return await asyncio.wait_for(self._result_future, timeout=15)
        except asyncio.TimeoutError:
            return ExecResult(ok=False, error="Execution timed out after 15s")
        finally:
            self._client.stopService()

    def _on_connected(self, client):
        req = ProtoOAApplicationAuthReq()
        req.clientId     = CTRADER_CLIENT_ID
        req.clientSecret = CTRADER_CLIENT_SECRET
        client.send(req)

    def _on_message(self, client, message):
        ptype = message.payloadType

        if ptype == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAAccountAuthReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            req.accessToken         = self.creds["accessToken"]
            client.send(req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            self._send_command(client)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message, ProtoOAExecutionEvent)
            pos   = event.position if event.HasField("position") else None
            result = ExecResult(
                ok          = True,
                external_id = str(pos.positionId) if pos else None,
                entry_price = float(pos.price) if pos and pos.price else None,
            )
            if not self._result_future.done():
                self._result_future.set_result(result)

    def _send_command(self, client):
        cmd = self._pending_cmd
        acct_id = int(self.creds["ctraderId"])

        if cmd[0] == "open":
            _, symbol, action, lots, sl, tp = cmd
            req = ProtoOANewOrderReq()
            req.ctidTraderAccountId = acct_id
            req.symbolName          = symbol
            req.orderType           = ProtoOAOrderType.Value("MARKET")
            req.tradeSide           = 1 if action == "BUY" else 2
            req.volume              = int(lots * 100)   # centilots
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)

        elif cmd[0] == "close":
            _, pos_id, lots = cmd
            req = ProtoOAClosePositionReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = pos_id
            req.volume              = int(lots * 100)
            client.send(req)

        elif cmd[0] == "modify":
            _, pos_id, sl, tp = cmd
            req = ProtoOAAmendPositionSLTPReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = pos_id
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)
