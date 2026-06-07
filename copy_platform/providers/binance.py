"""
Binance USDM Futures provider — real-time position events via User Data Stream WebSocket.
Fires on_event on OPEN / CLOSE of each position change.
Credentials: { apiKey, secret }
"""
import asyncio, json, logging, time
import aiohttp
from providers.ctrader import PositionSnapshot

log = logging.getLogger("provider.binance")

FUTURES_REST = "https://fapi.binance.com"
FUTURES_WS   = "wss://fstream.binance.com/ws"
KEEPALIVE_S  = 1500   # refresh listenKey every 25 min (they expire in 60 min)


class BinanceProvider:
    def __init__(self, master_id: str, creds: dict, account_type: str, on_event):
        self.master_id = master_id
        self.api_key   = creds.get("apiKey") or creds.get("loginId", "")
        self.secret    = creds.get("secret", "")
        self.on_event  = on_event
        self._running  = False
        self._positions: dict[str, PositionSnapshot] = {}  # symbol:side → snapshot

    def start(self) -> None:
        self._running = True
        asyncio.ensure_future(self._run())
        log.info(f"[{self.master_id}] Binance provider starting")

    def stop(self) -> None:
        self._running = False

    async def _get_listen_key(self, session: aiohttp.ClientSession) -> str:
        headers = {"X-MBX-APIKEY": self.api_key}
        async with session.post(f"{FUTURES_REST}/fapi/v1/listenKey", headers=headers) as r:
            if r.status != 200:
                raise RuntimeError(f"listenKey failed: {r.status}")
            return (await r.json())["listenKey"]

    async def _keepalive(self, session: aiohttp.ClientSession, key: str) -> None:
        headers = {"X-MBX-APIKEY": self.api_key}
        await session.put(f"{FUTURES_REST}/fapi/v1/listenKey",
                          headers=headers, params={"listenKey": key})

    async def _run(self) -> None:
        while self._running:
            try:
                async with aiohttp.ClientSession() as session:
                    key = await self._get_listen_key(session)
                    due = time.monotonic() + KEEPALIVE_S
                    async with session.ws_connect(f"{FUTURES_WS}/{key}") as ws:
                        log.info(f"[{self.master_id}] Binance WS connected")
                        async for msg in ws:
                            if not self._running:
                                return
                            if time.monotonic() > due:
                                await self._keepalive(session, key)
                                due = time.monotonic() + KEEPALIVE_S
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self._on_msg(json.loads(msg.data))
            except Exception as e:
                if self._running:
                    log.warning(f"[{self.master_id}] Binance WS error: {e} — retry in 5s")
                    await asyncio.sleep(5)

    async def _on_msg(self, data: dict) -> None:
        if data.get("e") != "ORDER_TRADE_UPDATE":
            return
        o = data["o"]
        if o.get("x") != "TRADE":   # only actual fill events
            return

        symbol   = o["s"]
        ps       = o.get("ps", "BOTH")   # position side: LONG / SHORT / BOTH
        side     = o["S"]                 # order side: BUY / SELL
        reduce   = o.get("R", False)
        qty      = float(o.get("l") or o.get("q") or 0)   # last filled qty
        price    = float(o.get("L") or o.get("ap") or 0)  # last filled price

        # Position direction: LONG position always BUY, SHORT always SELL
        action   = "BUY" if (ps == "LONG" or (ps == "BOTH" and side == "BUY")) else "SELL"
        pos_key  = f"{symbol}:{ps}"
        pid      = abs(hash(pos_key)) % (2**31)

        snap = PositionSnapshot(
            position_id = pid,
            symbol      = symbol,
            action      = action,
            volume_lots = qty,
            entry_price = price,
            stop_loss   = None,
            take_profit = None,
        )

        if reduce:
            self._positions.pop(pos_key, None)
            await self.on_event({"type": "CLOSE", "snap": snap}, self.master_id)
        else:
            self._positions[pos_key] = snap
            await self.on_event({"type": "OPEN",  "snap": snap}, self.master_id)
