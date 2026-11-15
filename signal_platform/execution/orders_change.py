"""
The wire format for CHANGING what is already at the broker — a waiting order's size and levels, and
closing part of an open trade. Beside `orders.py` (which places), for the same reason it exists: one
place owns each message's shape.

⚠ AN AMEND RE-SENDS EVERYTHING THE ORDER HAS. `ProtoOAAmendOrderReq` has every field optional, and
the REST surface is known to DELETE a leg that is omitted (`reference-ctrader-amend`: omitting
`takeProfit` removes it). So the caller passes the order's CURRENT target and expiry, read off the
same reconcile reply, and they go back unchanged. A missing value is left unset only when the order
genuinely has none.
"""
import logging

from shared.pip import price_digits

log = logging.getLogger(__name__)


def build_amend_order(acct: int, order_id: int, symbol: str, volume: int, stop_price: float,
                      sl: float, tp: float | None, expiry_ms: int | None):
    """A waiting STOP order with a new size and/or entry and stop (and its target and expiry kept)."""
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAAmendOrderReq
    d = price_digits(symbol)
    req = ProtoOAAmendOrderReq()
    req.ctidTraderAccountId = acct
    req.orderId = int(order_id)
    req.volume = int(volume)
    req.stopPrice = round(float(stop_price), d)
    req.stopLoss = round(float(sl), d)
    if tp:
        req.takeProfit = round(float(tp), d)
    if expiry_ms:
        req.expirationTimestamp = int(expiry_ms)
    log.info(f"[execution] AMEND order {order_id} {symbol} vol={req.volume} @ {req.stopPrice} "
             f"SL {req.stopLoss} TP {req.takeProfit or 'none'}")
    return req


def build_close(acct: int, position_id: int, volume: int):
    """Close `volume` of an open trade — the rest stays open with its stop and target untouched."""
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAClosePositionReq
    req = ProtoOAClosePositionReq()
    req.ctidTraderAccountId, req.positionId, req.volume = acct, int(position_id), int(volume)
    log.info(f"[execution] CLOSE {volume} of position {position_id}")
    return req
