"""
cTrader Open API — symbol cache + historical bar fetch.

Public API: fetch_bars(symbol, tf, count) → list[dict]

Symbol names: cTrader format without slash — "EURUSD", "USDJPY".
Price encoding: all prices are integers scaled by 10^digits.
  FX (non-JPY): divide by 100,000 (5 decimal places)
  JPY crosses:  divide by 1,000   (3 decimal places)
ProtoOATrendbarPeriod enum values equal the TF duration in minutes.
"""

import asyncio
import logging
import time

from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAGetTrendbarsReq, ProtoOAGetTrendbarsRes,
    ProtoOASymbolsListReq, ProtoOASymbolsListRes,
)
from data import ctrader_session as _sess
from shared.mtf_utils import to_minutes, is_native

log = logging.getLogger(__name__)

TYPE_SYMBOLS_RES   = 2115
TYPE_TRENDBARS_RES = 2138
TYPE_ERROR         = 5

_symbols:  dict[str, int] = {}   # "EURUSD" → symbolId
_req_lock  = asyncio.Lock()      # serialize all TCP request/response pairs


async def _load_symbols(reader, writer) -> None:
    if _symbols:
        return
    req = ProtoOASymbolsListReq(ctidTraderAccountId=_sess._account_id)
    await _sess.send(writer, req.payloadType, req.SerializeToString())
    resp = await asyncio.wait_for(_sess.recv(reader), timeout=15)
    if resp.payloadType != TYPE_SYMBOLS_RES:
        raise RuntimeError(f"[ctrader] symbol list failed (type={resp.payloadType})")
    res = ProtoOASymbolsListRes()
    res.ParseFromString(resp.payload)
    _symbols.update({s.symbolName: s.symbolId for s in res.symbol if s.enabled})
    sample = list(_symbols.keys())[:15]
    log.info(f"[ctrader] {len(_symbols)} symbols cached — first 15: {sample}")


async def fetch_bars(symbol: str, tf: str, count: int = 100) -> list[dict]:
    """
    Fetch up to `count` OHLCV bars for one native cTrader TF.

    symbol  — cTrader symbol name, e.g. 'EURUSD' (no slash)
    tf      — native TF string, e.g. 'H4'. Non-native TFs raise ValueError.
    Returns list of {time (unix s), open, high, low, close, volume} ascending.
    """
    if not is_native(tf):
        raise ValueError(f"[ctrader] '{tf}' is not a native period — caller aggregates")

    digits  = 3 if "JPY" in symbol else 5
    divisor = 10 ** digits
    bar_ms  = to_minutes(tf) * 60_000
    to_ts   = int(time.time() * 1000)
    from_ts = to_ts - (count + 10) * bar_ms   # +10 bars buffer for edge candle

    async with _req_lock:
        try:
            reader, writer = await _sess.get_connection()
            await _load_symbols(reader, writer)

            sid = _symbols.get(symbol)
            if sid is None:
                raise ValueError(f"[ctrader] '{symbol}' not in symbol list")

            req = ProtoOAGetTrendbarsReq(
                ctidTraderAccountId=_sess._account_id,
                symbolId=sid,
                period=to_minutes(tf),   # ProtoOATrendbarPeriod values == minutes
                fromTimestamp=from_ts,
                toTimestamp=to_ts,
                count=count,
            )
            await _sess.send(writer, req.payloadType, req.SerializeToString())
            resp = await asyncio.wait_for(_sess.recv(reader), timeout=20)

        except ValueError:
            raise  # symbol not found — logic error, no connection to reset
        except BaseException:
            # CancelledError (outer wait_for timeout), OSError, or any other
            # failure — reset the TCP stream so the next request starts clean
            _sess.reset_connection()
            raise

    if resp.payloadType == TYPE_ERROR:
        raise RuntimeError(f"[ctrader] server error for {symbol} {tf}")
    if resp.payloadType != TYPE_TRENDBARS_RES:
        raise RuntimeError(f"[ctrader] unexpected response type {resp.payloadType}")

    res = ProtoOAGetTrendbarsRes()
    res.ParseFromString(resp.payload)

    bars: list[dict] = []
    for tb in res.trendbar:
        ts_ms = tb.timestamp if tb.timestamp else tb.utcTimestampInMinutes * 60_000
        low   = tb.low
        bars.append({
            "time":   ts_ms // 1000,
            "open":   (low + tb.deltaOpen)  / divisor,
            "high":   (low + tb.deltaHigh)  / divisor,
            "low":    low / divisor,
            "close":  (low + tb.deltaClose) / divisor,
            "volume": float(tb.volume),
        })
    return bars[-count:]
