"""
cTrader Open API — symbol cache + historical bar fetch.

Public API: fetch_bars(symbol, tf, count) → list[dict]

Symbol names: cTrader format without slash — "EURUSD", "USDJPY".
Price encoding: all prices are integers scaled by 10^digits.
  FX (non-JPY): divide by 100,000 (5 decimal places)
  JPY crosses:  divide by 1,000   (3 decimal places)
ProtoOATrendbarPeriod enum: sequential ints 1–14 (M1→MN1), NOT minutes.
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

# ProtoOATrendbarPeriod enum: values are sequential ints, NOT minutes.
_TF_TO_PERIOD: dict[str, int] = {
    "M1": 1, "M2": 2, "M3": 3, "M4": 4, "M5": 5,
    "M10": 6, "M15": 7, "M30": 8,
    "H1": 9, "H4": 10, "H12": 11,
    "D1": 12, "W1": 13, "MN1": 14,
}

_symbols:  dict[str, int] = {}   # "EURUSD" → symbolId
_req_lock  = asyncio.Lock()      # serialize all TCP request/response pairs

# cTrader rate-limits HISTORICAL (trendbar) requests to ~5/s per connection and, when exceeded,
# blocks the payload type ('BLOCKED_PAYLOAD_TYPE — You are being rate limited') for a cooldown.
# Pace every trendbar request at least this far apart so a burst across many symbols/TFs (as we
# add pairs + strategies) stays under the limit and never trips it. Requests just queue on _req_lock.
_MIN_REQ_GAP = 0.30              # seconds between consecutive trendbar requests (~3.3/s, safely < 5/s)
_last_req    = 0.0               # monotonic time of the last trendbar send


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
    _symbols.update({s.symbolName.rstrip("."): s.symbolId for s in res.symbol if s.enabled})
    sample = list(_symbols.keys())[:15]
    log.info(f"[ctrader] {len(_symbols)} symbols cached — first 15: {sample}")


async def fetch_bars(
    symbol: str,
    tf: str,
    count: int = 100,
    to_ms: int | None = None,
) -> list[dict]:
    """
    Fetch up to `count` OHLCV bars for one native cTrader TF.

    symbol  — cTrader symbol name, e.g. 'EURUSD' (no slash)
    tf      — native TF string, e.g. 'H4'. Non-native TFs raise ValueError.
    to_ms   — end of window in Unix ms; defaults to now (used for pagination).
    Returns list of {time (unix s), open, high, low, close, volume} ascending.
    """
    if not is_native(tf):
        raise ValueError(f"[ctrader] '{tf}' is not a native period — caller aggregates")

    digits  = 3 if "JPY" in symbol else 5
    divisor = 10 ** digits
    bar_ms  = to_minutes(tf) * 60_000
    to_ts   = to_ms if to_ms is not None else int(time.time() * 1000)
    from_ts = to_ts - (count + 10) * bar_ms   # +10 bars buffer for edge candle

    async with _req_lock:
        try:
            reader, writer = await _sess.get_connection()
            await _load_symbols(reader, writer)

            sid = _symbols.get(symbol)
            if sid is None:
                raise ValueError(f"[ctrader] '{symbol}' not in symbol list")

            period_val = _TF_TO_PERIOD.get(tf)
            if period_val is None:
                raise ValueError(f"[ctrader] no period enum for TF '{tf}'")
            req = ProtoOAGetTrendbarsReq(
                ctidTraderAccountId=_sess._account_id,
                symbolId=sid,
                period=period_val,
                fromTimestamp=from_ts,
                toTimestamp=to_ts,
                count=count,
            )
            # Rate-limit guard: keep trendbar requests ≥ _MIN_REQ_GAP apart (under cTrader's ~5/s
            # historical cap) so bursts across pairs/TFs never trip BLOCKED_PAYLOAD_TYPE.
            global _last_req
            gap = _MIN_REQ_GAP - (time.monotonic() - _last_req)
            if gap > 0:
                await asyncio.sleep(gap)
            _last_req = time.monotonic()
            await _sess.send(writer, req.payloadType, req.SerializeToString())
            resp = await asyncio.wait_for(_sess.recv(reader), timeout=20)

        except ValueError:
            raise  # symbol not found — logic error, no connection to reset
        except BaseException:
            # CancelledError (outer wait_for timeout), OSError, or any other
            # failure — reset the TCP stream so the next request starts clean
            _sess.reset_connection()
            raise

    if resp.payloadType != TYPE_TRENDBARS_RES:
        # Decode cTrader's REAL error (errorCode + description) — not just the payload type —
        # so a persistent failure like M1 tells us exactly why (rate limit, boundaries, etc.).
        raise RuntimeError(f"[ctrader] {symbol} {tf} fetch failed — {_sess._describe_resp(resp)}")

    res = ProtoOAGetTrendbarsRes()
    res.ParseFromString(resp.payload)

    bars: list[dict] = []
    for tb in res.trendbar:
        ts_ms = tb.utcTimestampInMinutes * 60_000
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
