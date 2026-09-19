"""
WHAT THE BROKER REMEMBERS ABOUT ORDERS — two facts the platform used to infer instead of asking.

1. THE STOP A TRADE STARTED WITH (`opening_stop`). The profit ladder counts R as a multiple of the
   trade's risk. It used to rebuild that risk from the stop the position carries NOW — so after the
   ladder's own first move (breakeven) the risk read zero, R read "unknown", and every later step was
   skipped. Proved 19 Sep 2026 on his EUR/USD sell of 18 Sep: it ran to 2.85R and closed at $0
   (docs/OPEN.md B27). The broker keeps the ORIGINAL stop on the order that opened the position even
   after the position's stop is moved (02 Sep GBP/USD: opening order 1.34939, closing order 1.3488),
   so the answer is to ask it, once per position.

2. WHETHER AN ORDER FILLED (`fill_for_order`). Autotrade only learned about a fill by SEEING the
   position open during a poll. His 16 Sep GBP/USD sell filled at 15:03:17.525 and was stopped 1.2
   seconds later — never seen open, so when the order later came back "not found" it was recorded as
   withdrawn and a real -$125 loss vanished from his autotrade screen (B29). The deal list says what
   actually happened.

SAME SOCKET RULES AS `ctrader_positions`: every request/response pair holds `_req_lock` and reads its
reply with `recv_expect`, never a bare `recv`, or an unsolicited push is taken for the reply and the
shared stream desynchronises for every other reader.

NEVER RAISES. A caller that cannot get an answer must be able to tell "the broker said no stop" from
"I could not ask" — see `opening_stop`'s return.
"""
import asyncio
import logging
import time
from dataclasses import dataclass

from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOADealListReq, ProtoOADealListRes,
    ProtoOAOrderListByPositionIdReq, ProtoOAOrderListByPositionIdRes,
)

from data import ctrader_session as _sess
from data.ctrader_client import _req_lock

log = logging.getLogger(__name__)

_RELATIVE_DIVISOR = 100_000.0     # relative stop distances are 1/100000 of a price unit
_TYPE_ORDERS = ProtoOAOrderListByPositionIdRes().payloadType
_TYPE_DEALS = ProtoOADealListRes().payloadType
_FILLED = (2, 3)                  # ProtoOADealStatus FILLED, PARTIALLY_FILLED
_WEEK_MS = 7 * 24 * 3600 * 1000   # the deal list is asked for one week at a time


async def _ask(req, want: int):
    async with _req_lock:
        reader, writer = await _sess.get_connection()
        await _sess.send(writer, req.payloadType, req.SerializeToString())
        return await asyncio.wait_for(_sess.recv_expect(reader, want), timeout=15)


def starting_stop_from(orders, bullish: bool) -> float | None:
    """The stop on the ORDER THAT OPENED the position, from its order list. Pure, so it is testable.

    The opening order is the one that is not a closing order; if there were several, the earliest.
    A market order may carry its stop as a DISTANCE from the fill (`relativeStopLoss`) instead of a
    price, so that is converted. None means the opening order carried no stop at all.
    """
    opening = [o for o in orders if not getattr(o, "closingOrder", False)]
    if not opening:
        return None
    o = min(opening, key=lambda x: (x.tradeData.openTimestamp or x.utcLastUpdateTimestamp or 0))
    if getattr(o, "stopLoss", 0):
        return float(o.stopLoss)
    rel, fill = getattr(o, "relativeStopLoss", 0), getattr(o, "executionPrice", 0)
    if rel and fill:
        return fill - rel / _RELATIVE_DIVISOR if bullish else fill + rel / _RELATIVE_DIVISOR
    return None


async def opening_stop(position_id: int, bullish: bool) -> tuple[bool, float | None]:
    """(asked, stop). `asked` False = the broker could not be read — try again later, never guess.
    (True, None) = the broker answered and the opening order carried no stop."""
    try:
        req = ProtoOAOrderListByPositionIdReq(ctidTraderAccountId=_sess._account_id,
                                              positionId=int(position_id))
        resp = await _ask(req, _TYPE_ORDERS)
        if resp.payloadType != _TYPE_ORDERS:
            log.warning(f"[ctrader_orders] position {position_id}: the broker answered "
                        f"{_sess._describe_resp(resp)} instead of its order list")
            return False, None
        res = ProtoOAOrderListByPositionIdRes()
        res.ParseFromString(resp.payload)
        return True, starting_stop_from(list(res.order), bullish)
    except Exception as exc:
        log.warning(f"[ctrader_orders] could not read the orders of position {position_id}: "
                    f"{type(exc).__name__}: {exc}")
        return False, None


@dataclass(frozen=True)
class Fill:
    order_id: str
    position_id: int
    price: float
    filled_at_ms: int


async def fill_for_order(order_id: str, lookback_days: int = 14) -> tuple[bool, Fill | None]:
    """(asked, fill). The deal that FILLED this order, or (True, None) if the broker has none.
    `asked` False = could not read the broker; the caller must not conclude anything from it."""
    now_ms = int(time.time() * 1000)
    found: list = []
    try:
        start = now_ms - lookback_days * 24 * 3600 * 1000
        for frm in range(start, now_ms, _WEEK_MS):
            req = ProtoOADealListReq(ctidTraderAccountId=_sess._account_id, fromTimestamp=frm,
                                     toTimestamp=min(frm + _WEEK_MS, now_ms), maxRows=1000)
            resp = await _ask(req, _TYPE_DEALS)
            if resp.payloadType != _TYPE_DEALS:
                log.warning(f"[ctrader_orders] order {order_id}: the broker answered "
                            f"{_sess._describe_resp(resp)} instead of the deal list")
                return False, None
            res = ProtoOADealListRes()
            res.ParseFromString(resp.payload)
            found += [d for d in res.deal
                      if str(d.orderId) == str(order_id) and int(d.dealStatus) in _FILLED]
    except Exception as exc:
        log.warning(f"[ctrader_orders] could not read the deals for order {order_id}: "
                    f"{type(exc).__name__}: {exc}")
        return False, None
    if not found:
        return True, None
    d = min(found, key=lambda x: int(x.executionTimestamp or 0))
    return True, Fill(str(order_id), int(d.positionId), float(d.executionPrice),
                      int(d.executionTimestamp))
