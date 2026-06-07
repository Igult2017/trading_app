"""
DXTrade executor — places / closes market orders via REST API.
Credentials: { loginId (username), password, server (broker API base URL) }
"""
import asyncio, logging
import aiohttp
from dataclasses import dataclass

log = logging.getLogger("executor.dxtrade")


@dataclass
class ExecResult:
    ok:          bool
    external_id: str | None = None
    entry_price: float | None = None
    error:       str | None = None


class DXTradeExecutor:
    def __init__(self, creds: dict, account_type: str):
        self.username = creds.get("loginId", "")
        self.password = creds.get("password", "")
        self.server   = (creds.get("server") or "").rstrip("/")

    async def _auth(self, session: aiohttp.ClientSession) -> tuple[str, str]:
        async with session.post(f"{self.server}/auth/token",
                                json={"username": self.username, "password": self.password}) as r:
            if r.status != 200:
                raise RuntimeError(f"DXTrade auth: {r.status}")
            data  = await r.json()
            token = data.get("token") or data.get("accessToken") or data.get("access_token")
            if not token:
                raise RuntimeError("DXTrade: no token")
            return token

    async def _get_account_id(self, session: aiohttp.ClientSession, token: str) -> str:
        async with session.get(f"{self.server}/user/accounts",
                               headers={"Authorization": f"Bearer {token}"}) as r:
            data = await r.json()
            rows = data if isinstance(data, list) else data.get("accounts", [])
            if not rows:
                raise RuntimeError("DXTrade: no accounts")
            return str(rows[0].get("id") or rows[0].get("accountId"))

    async def open_position(self, symbol: str, action: str,
                            volume_lots: float, sl: float | None,
                            tp: float | None) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token  = await self._auth(session)
                acc_id = await self._get_account_id(session, token)
                body = {
                    "orderCode":  symbol,
                    "orderQty":   int(volume_lots * 100_000),
                    "orderSide":  action,    # BUY / SELL
                    "orderType":  "MARKET",
                }
                if sl: body["stopLoss"]   = sl
                if tp: body["takeProfit"] = tp
                async with session.post(
                    f"{self.server}/user/accounts/{acc_id}/orders",
                    json=body,
                    headers={"Authorization": f"Bearer {token}"},
                ) as r:
                    data = await r.json()
                    if r.status not in (200, 201):
                        raise RuntimeError(f"DXTrade order: {r.status} {data}")
                    pos_id = str(data.get("positionId") or data.get("orderId") or "")
                    return ExecResult(ok=True, external_id=pos_id,
                                      entry_price=float(data.get("price") or 0))
        except Exception as e:
            log.error(f"[DXTrade] open_position failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def close_position(self, position_id: int,
                             volume_lots: float) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token  = await self._auth(session)
                acc_id = await self._get_account_id(session, token)
                async with session.post(
                    f"{self.server}/user/accounts/{acc_id}/positions/{position_id}/close",
                    json={"qty": int(volume_lots * 100_000)},
                    headers={"Authorization": f"Bearer {token}"},
                ) as r:
                    data = await r.json()
                    if r.status not in (200, 201):
                        raise RuntimeError(f"DXTrade close: {r.status} {data}")
                    return ExecResult(ok=True, external_id=str(position_id),
                                      entry_price=float(data.get("closePrice") or 0))
        except Exception as e:
            log.error(f"[DXTrade] close_position failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def modify_position(self, position_id: int,
                              sl: float | None, tp: float | None) -> ExecResult:
        try:
            async with aiohttp.ClientSession() as session:
                token  = await self._auth(session)
                acc_id = await self._get_account_id(session, token)
                body: dict = {}
                if sl is not None: body["stopLoss"]   = sl
                if tp is not None: body["takeProfit"] = tp
                async with session.patch(
                    f"{self.server}/user/accounts/{acc_id}/positions/{position_id}",
                    json=body,
                    headers={"Authorization": f"Bearer {token}"},
                ) as r:
                    return ExecResult(ok=r.status in (200, 204), external_id=str(position_id))
        except Exception as e:
            log.error(f"[DXTrade] modify_position failed: {e}")
            return ExecResult(ok=False, error=str(e))
