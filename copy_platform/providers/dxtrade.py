"""
DXTrade provider — polls open positions via REST every 2 s and detects opens/closes.
Credentials: { loginId (username), password, server (broker API base URL) }
No WebSocket needed — REST poll < 2 s latency is acceptable for copy trading.
"""
import asyncio, logging
import aiohttp
from providers.ctrader import PositionSnapshot

log = logging.getLogger("provider.dxtrade")
POLL_INTERVAL = 2


class DXTradeProvider:
    def __init__(self, master_id: str, creds: dict, account_type: str, on_event):
        self.master_id = master_id
        self.username  = creds.get("loginId", "")
        self.password  = creds.get("password", "")
        self.server    = (creds.get("server") or "").rstrip("/")
        self.on_event  = on_event
        self._running  = False
        self._known: dict[str, PositionSnapshot] = {}  # positionId → snap

    def start(self) -> None:
        self._running = True
        asyncio.ensure_future(self._run())
        log.info(f"[{self.master_id}] DXTrade provider starting")

    def stop(self) -> None:
        self._running = False

    async def _auth(self, session: aiohttp.ClientSession) -> str:
        async with session.post(f"{self.server}/auth/token", json={
            "username": self.username, "password": self.password,
        }) as r:
            if r.status != 200:
                raise RuntimeError(f"DXTrade auth: {r.status}")
            data = await r.json()
            token = data.get("token") or data.get("accessToken") or data.get("access_token")
            if not token:
                raise RuntimeError("DXTrade: no token in auth response")
            return token

    async def _get_account_id(self, session: aiohttp.ClientSession, token: str) -> str:
        async with session.get(f"{self.server}/user/accounts",
                               headers={"Authorization": f"Bearer {token}"}) as r:
            data = await r.json()
            rows = data if isinstance(data, list) else data.get("accounts", [])
            if not rows:
                raise RuntimeError("DXTrade: no accounts found")
            return str(rows[0].get("id") or rows[0].get("accountId"))

    async def _get_positions(self, session: aiohttp.ClientSession,
                             token: str, acc_id: str) -> list[dict]:
        async with session.get(
            f"{self.server}/user/accounts/{acc_id}/positions?status=OPEN",
            headers={"Authorization": f"Bearer {token}"},
        ) as r:
            if r.status != 200:
                return []
            data = await r.json()
            return data if isinstance(data, list) else data.get("positions", [])

    def _snap(self, p: dict) -> PositionSnapshot:
        side = (p.get("side") or p.get("orderSide") or "BUY").upper()
        qty  = float(p.get("qty") or p.get("volume") or 0) / 100_000
        return PositionSnapshot(
            position_id = abs(hash(str(p.get("positionId") or p.get("id")))) % (2**31),
            symbol      = str(p.get("instrument") or p.get("symbol") or ""),
            action      = "BUY" if side == "BUY" else "SELL",
            volume_lots = qty,
            entry_price = float(p.get("openPrice") or p.get("entryPrice") or 0),
            stop_loss   = float(p["stopLoss"])   if p.get("stopLoss")   else None,
            take_profit = float(p["takeProfit"]) if p.get("takeProfit") else None,
        )

    async def _run(self) -> None:
        while self._running:
            try:
                async with aiohttp.ClientSession() as session:
                    token  = await self._auth(session)
                    acc_id = await self._get_account_id(session, token)
                    token_age = 0
                    log.info(f"[{self.master_id}] DXTrade polling account {acc_id}")
                    while self._running:
                        # Re-auth every 30 min
                        if token_age >= 900:
                            token = await self._auth(session)
                            token_age = 0
                        positions = await self._get_positions(session, token, acc_id)
                        current: dict[str, PositionSnapshot] = {}
                        for p in positions:
                            pid  = str(p.get("positionId") or p.get("id"))
                            snap = self._snap(p)
                            current[pid] = snap
                            if pid not in self._known:
                                await self.on_event({"type": "OPEN", "snap": snap}, self.master_id)
                        for pid, snap in self._known.items():
                            if pid not in current:
                                await self.on_event({"type": "CLOSE", "snap": snap}, self.master_id)
                        self._known = current
                        await asyncio.sleep(POLL_INTERVAL)
                        token_age += POLL_INTERVAL
            except Exception as e:
                if self._running:
                    log.warning(f"[{self.master_id}] DXTrade error: {e} — retry in 10s")
                    await asyncio.sleep(10)
