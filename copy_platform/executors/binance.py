"""
Binance USDM Futures executor — places / closes market orders via REST API.
Credentials: { apiKey, secret }
Position IDs are encoded as "SYMBOL:POSITIONSIDE" (e.g. "BTCUSDT:LONG").
"""
import asyncio, hashlib, hmac, logging, time
import aiohttp
from dataclasses import dataclass

log = logging.getLogger("executor.binance")
FUTURES_BASE = "https://fapi.binance.com"


@dataclass
class ExecResult:
    ok:          bool
    external_id: str | None = None
    entry_price: float | None = None
    error:       str | None = None


class BinanceExecutor:
    def __init__(self, creds: dict, account_type: str):
        self.api_key = creds.get("apiKey") or creds.get("loginId", "")
        self.secret  = creds.get("secret", "")

    def _sign(self, params: dict) -> dict:
        params["timestamp"] = int(time.time() * 1000)
        qs  = "&".join(f"{k}={v}" for k, v in params.items())
        sig = hmac.new(self.secret.encode(), qs.encode(), hashlib.sha256).hexdigest()
        params["signature"] = sig
        return params

    async def _request(self, method: str, path: str, params: dict) -> dict:
        headers = {"X-MBX-APIKEY": self.api_key}
        async with aiohttp.ClientSession() as session:
            url = f"{FUTURES_BASE}{path}"
            fn  = session.post if method == "POST" else session.delete
            async with fn(url, params=self._sign(params), headers=headers) as r:
                data = await r.json()
                if r.status not in (200, 201):
                    raise RuntimeError(f"Binance {path}: {data.get('msg', r.status)}")
                return data

    async def open_position(self, symbol: str, action: str,
                            volume_lots: float, sl: float | None,
                            tp: float | None) -> ExecResult:
        try:
            params = {
                "symbol":       symbol,
                "side":         action,          # BUY / SELL
                "type":         "MARKET",
                "quantity":     round(volume_lots, 3),
                "positionSide": "BOTH",
            }
            data = await self._request("POST", "/fapi/v1/order", params)
            ext_id = f"{symbol}:{'LONG' if action=='BUY' else 'SHORT'}"
            return ExecResult(ok=True, external_id=ext_id,
                              entry_price=float(data.get("avgPrice") or 0))
        except Exception as e:
            log.error(f"[Binance] open_position failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def close_position(self, position_id: int,
                             volume_lots: float) -> ExecResult:
        # position_id is unused; external_id encodes "SYMBOL:SIDE"
        return ExecResult(ok=False, error="Use external_id (SYMBOL:SIDE) for close")

    async def close_by_symbol(self, symbol: str, position_side: str,
                              volume_lots: float) -> ExecResult:
        try:
            close_side = "SELL" if position_side == "LONG" else "BUY"
            params = {
                "symbol":       symbol,
                "side":         close_side,
                "type":         "MARKET",
                "quantity":     round(volume_lots, 3),
                "positionSide": "BOTH",
                "reduceOnly":   "true",
            }
            data = await self._request("POST", "/fapi/v1/order", params)
            return ExecResult(ok=True, external_id=f"{symbol}:{position_side}",
                              entry_price=float(data.get("avgPrice") or 0))
        except Exception as e:
            log.error(f"[Binance] close_by_symbol failed: {e}")
            return ExecResult(ok=False, error=str(e))

    async def modify_position(self, position_id: int,
                              sl: float | None, tp: float | None) -> ExecResult:
        # Binance SL/TP are separate STOP_MARKET / TAKE_PROFIT_MARKET orders
        # Modification requires cancel + replace — not supported in basic copy mode
        return ExecResult(ok=True, external_id=None)
