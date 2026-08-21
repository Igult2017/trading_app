"""
THE LIVE SPREAD — the number the platform has never had.

`core/strategy_context_builder.build` has accepted a `spread` argument since it was written and
NOTHING HAS EVER PASSED ONE. So `context.spread` was always None, and `risk/spread_filter.py` — a
whole module with its own threshold and its own log lines — has never once run on real data. This
file fills that slot.

WHY IT MATTERS, measured 2026-08-20. cTrader triggers a BUY stop on the ASK; candles are BID. So a
buy order placed one tick beyond a bid high actually fires when the real price is still a whole
spread BELOW that high — a fill on a break that never happened. Sell stops trigger on the bid, the
same frame the candles are in, so they are untouched. The error is one-sided and the code had no way
to know, because it could not see a spread. Against a median VIX.1 stop of 3.7 pips (EUR/USD), a 1.2
pip spread is a third of the risk.

REQUEST/RESPONSE, NOT A SUBSCRIPTION, AND THAT IS THE WHOLE DESIGN CONSTRAINT. The obvious source is
`ProtoOASubscribeSpotsReq`, but spot events then arrive unsolicited and forever on the SAME stream the
candle fetch reads with `send -> await recv`. Interleaving them risks the platform's lifeblood — a
trendbar reply arriving after a spot event that the reader was not expecting. `ProtoOAGetTickDataReq`
asks for one side at a time and answers once, which composes with the existing pattern exactly.

THE NEWEST TICK IS ABSOLUTE. cTrader returns tick data newest-first, with `tickData[0]` carrying a
full price and everything after it a delta going backwards in time. We want only the newest, so there
is no delta decoding here at all — the one thing about this encoding that most often goes wrong is
simply not done.

CACHED, BECAUSE A SPREAD IS NOT A LEVEL. Two requests per symbol against a ~5/s account-wide budget
shared with the candle fetch would be a real cost on every tick. Spreads move slowly inside a session,
so a few-minute-old spread is fine for sizing a stop; `_TTL` is deliberately far below the timescale
on which they widen (session edges), and a miss simply returns None and the caller carries on.
"""
import asyncio
import logging
import time

from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAGetTickDataReq, ProtoOAGetTickDataRes,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAQuoteType

from data import ctrader_session as _sess
# THE SAME LOCK THE CANDLE FETCH USES, and this is not optional. `_req_lock` serialises every
# request/response pair on the ONE shared TCP stream; a spread request sent without holding it would
# land between a trendbar request and its reply, and the candle fetch would parse the wrong message.
# The whole reason this module is request/response rather than a spot subscription is to be able to
# take this lock — a subscription cannot.
from data.ctrader_client import _load_symbols, _req_lock, _symbols

log = logging.getLogger(__name__)

_DIVISOR = 100_000        # same fixed 1e5 as trendbars — NOT the symbol's display digits
_TTL     = 300.0          # seconds a spread stays usable
_WINDOW  = 10 * 60_000    # ms of history asked for; wide enough that a quiet minute still has a tick
_TYPE_TICK_RES = ProtoOAGetTickDataRes().payloadType

_cache: dict[str, tuple[float, float]] = {}     # symbol -> (spread in PRICE units, expires_at)


async def _newest(reader, writer, sid: int, quote_type: int) -> float | None:
    """The newest price on one side, or None. `tickData[0]` is absolute; the rest are deltas."""
    now_ms = int(time.time() * 1000)
    req = ProtoOAGetTickDataReq(
        ctidTraderAccountId=_sess._account_id, symbolId=sid, type=quote_type,
        fromTimestamp=now_ms - _WINDOW, toTimestamp=now_ms,
    )
    await _sess.send(writer, req.payloadType, req.SerializeToString())
    # recv_expect: the shared socket carries unsolicited pushes, and reading one as the reply leaves
    # the real reply behind to desynchronise every later reader. See ctrader_session.recv_expect.
    resp = await asyncio.wait_for(_sess.recv_expect(reader, _TYPE_TICK_RES), timeout=15)
    if resp.payloadType != _TYPE_TICK_RES:
        return None
    res = ProtoOAGetTickDataRes()
    res.ParseFromString(resp.payload)
    if not res.tickData:
        return None
    return res.tickData[0].tick / _DIVISOR


async def spread_for(symbol: str) -> float | None:
    """Live spread in PRICE units (ask - bid), or None if it cannot be read.

    NEVER RAISES. A spread is an input to sizing, not a trading decision — if it cannot be fetched the
    strategy must carry on with what it had rather than the instrument going silent. The caller treats
    None as "unknown" and falls back to its no-spread behaviour.
    """
    hit = _cache.get(symbol)
    if hit and time.monotonic() < hit[1]:
        return hit[0]
    try:
        async with _req_lock:
            reader, writer = await _sess.get_connection()
            await _load_symbols(reader, writer)
            sid = _symbols.get(symbol.replace("/", ""))   # the broker's form: EUR/USD -> EURUSD
            if sid is None:
                return None
            bid = await _newest(reader, writer, sid, ProtoOAQuoteType.BID)
            ask = await _newest(reader, writer, sid, ProtoOAQuoteType.ASK)
        if bid is None or ask is None or ask <= bid:
            # ask <= bid is not a spread, it is a crossed or stale book — refuse it rather than feed
            # a zero or a negative into a stop calculation.
            return None
        spread = ask - bid
        _cache[symbol] = (spread, time.monotonic() + _TTL)
        return spread
    except Exception as exc:
        log.warning(f"[ctrader_spread] {symbol}: {type(exc).__name__}: {exc} — spread unknown")
        return None


def cached(symbol: str) -> float | None:
    """The last known spread without touching the network — for callers that must not block."""
    hit = _cache.get(symbol)
    return hit[0] if hit else None
