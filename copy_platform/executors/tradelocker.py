"""
TradeLocker executor — places / closes market orders via REST API.
Credentials: { loginId (email), password, server (broker server string), accountType }
"""
import asyncio, logging
import aiohttp
from dataclasses import dataclass

log = logging.getLogger("executor.tradelocker")


@dataclass
class ExecResult:
    ok:          bool
    external_id: str | None = None
    entry_price: float | None = None
    error:       str | None = None


def _base(account_type: str) -> str:
    return ("https://live.tradelocker.com/backend-service"
            if account_type == "live"
            else "https://demo.tradelocker.com/backend-service")


class TradeLockerExecutor:
    def __init__(self, creds: dict, account_type: str):
        self.email       = creds.get("loginId", "")
        self.password    = creds.get("password", "")
        self.tl_server   = creds.get("server", "")
        self.base        = _base(account_type)

    async def _auth(self, session: aiohttp.ClientSession) -> tuple[str, int, int]:
        async with session.post(f"{self.base}/auth/jwt/token", json={
            "email": self.email, "password": self.password, "server": self.tl_server,
        }) as r:
            if r.status != 200:
                raise RuntimeError(f"TradeLocker auth: {r.status}")
            data     = await r.json()
            token    = data.get("accessToken")
            accounts = data.get("accounts", [])
            if not token or not accounts:
                raise RuntimeError("TradeLocker: auth failed")
            acc = accounts[0]
            return token, acc["id"], acc.get("accNum", acc["id"])

    def _headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "env-id": "tradelocked"}

    async def open_position(self, symbol: str, action: str,
                            volume_lots: float, sl: float | None,
                            tp: float | None) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token, acc_id, acc_num = await self._auth(session)
                body = {
                    "qty":        volume_lots,
                    "instrument": symbol,
                    "validity":   "GTC",
                    "side":       "buy" if action == "BUY" else "sell",
                    "type":       "market",
                    "stopLoss":   sl,
                    "takeProfit": tp,
                }
                async with session.post(
                    f"{self.base}/trade/accounts/{acc_id}/{acc_num}/orders",
                    json=body, headers=self._headers(token),
                ) as r:
                    data = await r.json()
                    if r.status not in (200, 201):
                        raise RuntimeError(f"TradeLocker order: {r.status} {data}")
                    pos_id = str(data.get("d", {}).get("orderId") or data.get("orderId") or "")
                    return ExecResult(ok=True, external_id=pos_id)
        except Exception as e:
            log.error(f"[TradeLocker] open_position failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def close_position(self, position_id: int,
                             volume_lots: float) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token, acc_id, acc_num = await self._auth(session)
                async with session.delete(
                    f"{self.base}/trade/accounts/{acc_id}/{acc_num}/positions/{position_id}",
                    params={"qty": volume_lots},
                    headers=self._headers(token),
                ) as r:
                    if r.status not in (200, 204):
                        raise RuntimeError(f"TradeLocker close: {r.status}")
                    return ExecResult(ok=True, external_id=str(position_id))
        except Exception as e:
            log.error(f"[TradeLocker] close_position failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def modify_position(self, position_id: int,
                              sl: float | None, tp: float | None) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token, acc_id, acc_num = await self._auth(session)
                body: dict = {}
                if sl is not None: body["stopLoss"]   = sl
                if tp is not None: body["takeProfit"] = tp
                async with session.patch(
                    f"{self.base}/trade/accounts/{acc_id}/{acc_num}/positions/{position_id}",
                    json=body, headers=self._headers(token),
                ) as r:
                    return ExecResult(ok=r.status in (200, 204), external_id=str(position_id))
        except Exception as e:
            log.error(f"[TradeLocker] modify_position failed: {e}")
            return ExecResult(ok=False, error=str(e))
