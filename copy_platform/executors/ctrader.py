"""
cTrader executor — places / closes / modifies orders on follower accounts
via the cTrader Open API (TCP/protobuf).

Each call opens a short-lived authenticated connection, resolves the symbol id
(opens only — cTrader orders use a numeric symbolId, not a name), sends the
command, waits for the fill (or error), then disconnects.
"""
import asyncio
import logging
from dataclasses import dataclass

from ctrader_open_api import Client, Protobuf, TcpProtocol
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOASymbolsListReq, ProtoOASymbolsListRes,
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
        self._pending_cmd = None
        self._symbol_map: dict[str, int] = {}   # symbolName → symbolId

    def _make_client(self) -> Client:
        # Only "demo" uses the demo gateway; live AND funded/prop accounts are live.
        host = CT_DEMO_HOST if self.account_type == "demo" else CT_LIVE_HOST
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
            return await asyncio.wait_for(self._result_future, timeout=20)
        except asyncio.TimeoutError:
            return ExecResult(ok=False, error="Execution timed out")
        finally:
            self._client.stopService()

    def _resolve(self, result: ExecResult) -> None:
        if self._result_future and not self._result_future.done():
            self._result_future.set_result(result)

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
            # Opens need a numeric symbolId → fetch the symbol list first.
            # Close / modify use a positionId → send straight away.
            if self._pending_cmd and self._pending_cmd[0] == "open":
                req = ProtoOASymbolsListReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                client.send(req)
            else:
                self._send_command(client)

        elif ptype == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(message, ProtoOASymbolsListRes)
            self._symbol_map = {s.symbolName: s.symbolId for s in res.symbol}
            self._send_command(client)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message, ProtoOAExecutionEvent)
            # Order rejected / error → fail immediately.
            if event.HasField("errorCode") and event.errorCode:
                self._resolve(ExecResult(ok=False, error=f"cTrader: {event.errorCode}"))
                return
            # A fill carries a position. Intermediate events (ORDER_ACCEPTED) carry
            # no position — ignore them and wait for the fill (or the 20s timeout).
            if event.HasField("position"):
                pos = event.position
                self._resolve(ExecResult(
                    ok          = True,
                    external_id = str(pos.positionId),
                    entry_price = float(pos.price) if pos.price else None,
                ))

    def _send_command(self, client):
        cmd = self._pending_cmd
        acct_id = int(self.creds["ctraderId"])

        if cmd[0] == "open":
            _, symbol, action, lots, sl, tp = cmd
            symbol_id = self._symbol_map.get(symbol)
            if symbol_id is None:
                self._resolve(ExecResult(ok=False, error=f"Symbol {symbol} not on follower account"))
                return
            req = ProtoOANewOrderReq()
            req.ctidTraderAccountId = acct_id
            req.symbolId            = symbol_id
            req.orderType           = ProtoOAOrderType.Value("MARKET")
            req.tradeSide           = 1 if action == "BUY" else 2
            req.volume              = max(1, int(lots * 100))   # centilots, never 0
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)

        elif cmd[0] == "close":
            _, pos_id, lots = cmd
            req = ProtoOAClosePositionReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = int(pos_id)
            req.volume              = max(1, int(lots * 100))
            client.send(req)

        elif cmd[0] == "modify":
            _, pos_id, sl, tp = cmd
            req = ProtoOAAmendPositionSLTPReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = int(pos_id)
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)
