"""
TradeLocker provider — polls open positions via REST every 2 s and detects opens/closes.
Credentials: { loginId (email), password, server (broker server string), accountType }
Demo base: https://demo.tradelocker.com/backend-service
Live base: https://live.tradelocker.com/backend-service
"""
import asyncio, logging
import aiohttp
from providers.ctrader import PositionSnapshot

log = logging.getLogger("provider.tradelocker")
POLL_INTERVAL = 2
REAUTH_EVERY  = 600   # re-auth every 10 min (tokens last 15 min)


def _base(account_type: str) -> str:
    return ("https://live.tradelocker.com/backend-service"
            if account_type == "live"
            else "https://demo.tradelocker.com/backend-service")


class TradeLockerProvider:
    def __init__(self, master_id: str, creds: dict, account_type: str, on_event):
        self.master_id   = master_id
        self.email       = creds.get("loginId", "")
        self.password    = creds.get("password", "")
        self.tl_server   = creds.get("server", "")
        self.account_type = account_type
        self.base        = _base(account_type)
        self.on_event    = on_event
        self._running    = False
        self._known: dict[str, PositionSnapshot] = {}

    def start(self) -> None:
        self._running = True
        asyncio.ensure_future(self._run())
        log.info(f"[{self.master_id}] TradeLocker provider starting")

    def stop(self) -> None:
        self._running = False

    async def _auth(self, session: aiohttp.ClientSession) -> tuple[str, list[dict]]:
        async with session.post(f"{self.base}/auth/jwt/token", json={
            "email": self.email, "password": self.password, "server": self.tl_server,
        }) as r:
            if r.status != 200:
                raise RuntimeError(f"TradeLocker auth: {r.status}")
            data = await r.json()
            token = data.get("accessToken")
            if not token:
                raise RuntimeError("TradeLocker: no accessToken")
            accounts = data.get("accounts", [])
            return token, accounts

    async def _get_positions(self, session: aiohttp.ClientSession,
                             token: str, acc_id: int) -> list[dict]:
        headers = {"Authorization": f"Bearer {token}", "env-id": "tradelocker"}
        async with session.get(f"{self.base}/trade/accounts/{acc_id}/positions",
                               headers=headers) as r:
            if r.status != 200:
                return []
            data = await r.json()
            return data if isinstance(data, list) else data.get("d", {}).get("positions", [])

    def _snap(self, p: dict) -> PositionSnapshot:
        side = (p.get("side") or p.get("tradeSide") or "buy").lower()
        return PositionSnapshot(
            position_id = abs(hash(str(p.get("id") or p.get("positionId")))) % (2**31),
            symbol      = str(p.get("tradableInstrumentId") or p.get("instrument") or ""),
            action      = "BUY" if side == "buy" else "SELL",
            volume_lots = float(p.get("qty") or p.get("quantity") or 0),
            entry_price = float(p.get("price") or p.get("openPrice") or 0),
            stop_loss   = float(p["stopLoss"])   if p.get("stopLoss")   else None,
            take_profit = float(p["takeProfit"]) if p.get("takeProfit") else None,
        )

    async def _run(self) -> None:
        while self._running:
            try:
                async with aiohttp.ClientSession() as session:
                    token, accounts = await self._auth(session)
                    if not accounts:
                        raise RuntimeError("TradeLocker: no accounts")
                    acc_id = accounts[0]["id"]
                    elapsed = 0
                    log.info(f"[{self.master_id}] TradeLocker polling account {acc_id}")
                    while self._running:
                        if elapsed >= REAUTH_EVERY:
                            token, _ = await self._auth(session)
                            elapsed = 0
                        positions = await self._get_positions(session, token, acc_id)
                        current: dict[str, PositionSnapshot] = {}
                        for p in positions:
                            pid  = str(p.get("id") or p.get("positionId"))
                            snap = self._snap(p)
                            current[pid] = snap
                            if pid not in self._known:
                                await self.on_event({"type": "OPEN", "snap": snap}, self.master_id)
                        for pid, snap in self._known.items():
                            if pid not in current:
                                await self.on_event({"type": "CLOSE", "snap": snap}, self.master_id)
                        self._known = current
                        await asyncio.sleep(POLL_INTERVAL)
                        elapsed += POLL_INTERVAL
            except Exception as e:
                if self._running:
                    log.warning(f"[{self.master_id}] TradeLocker error: {e} — retry in 10s")
                    await asyncio.sleep(10)
