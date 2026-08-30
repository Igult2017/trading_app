"""
Building the order request, and reading the broker's answer.

Split from broker.py so that file stays about the CONNECTION and this one stays about the WIRE
FORMAT — the two things that break for entirely different reasons.

THE FIELD CONVENTIONS, from the `ctrader-mcp-servers` skill rather than from memory:
  orderType    STOP                     — a buy stop sits ABOVE market, a sell stop BELOW
  volume       integer, hundredths of   — execution/sizing.lots_to_volume owns this; 1 lot =
               a unit ("cents")           10,000,000, NOT lots*100
  stopPrice    ABSOLUTE price           — the trigger
  stopLoss     ABSOLUTE price           — NOT a pip distance. Pip distance is the Local-MCP
  takeProfit   ABSOLUTE price             `place_*_order` convention; the raw Open API takes prices,
                                          which is also why nothing here rounds a pip count.
  expiration   epoch MILLISECONDS       — matched to the signal's 24h expiry so an unfilled order
               Timestamp                  dies with the setup instead of resting forever.

Prices are rounded with shared/pip.price_digits: a price at the wrong precision is rejected, or
worse, silently snapped to something you did not ask for.
"""
import logging
from dataclasses import dataclass

from shared.pip import price_digits

log = logging.getLogger(__name__)


@dataclass
class OrderResult:
    ok:         bool
    order_id:   str | None = None
    error:      str | None = None
    filled:     bool = False
    fill_price: float | None = None


def build_stop(acct: int, symbol: str, side: str, volume: int, stop_price: float,
               sl: float, tp: float, expiry_ms: int | None, symbol_map: dict):
    """The ProtoOANewOrderReq for a pending stop — or (None, reason) if it cannot be built."""
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOANewOrderReq
    from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAOrderType
    # THIS PLATFORM'S OWN RESOLVER. copy_platform's handles broker affixes and nicknames but has no
    # rule for a slash — and every symbol here is slashed ("GBP/USD"), so it returned None for all
    # of them and this function refused every order with "not on this account".
    from shared.symbols import resolve_symbol_id

    sid = resolve_symbol_id(symbol, symbol_map)
    if sid is None:
        return None, f"symbol {symbol} not on this account"

    d = price_digits(symbol)
    req = ProtoOANewOrderReq()
    req.ctidTraderAccountId = acct
    req.symbolId  = sid
    req.orderType = ProtoOAOrderType.Value("STOP")
    req.tradeSide = 1 if side.upper() == "BUY" else 2
    req.volume    = int(volume)                    # already in the API's units — see sizing.py
    req.stopPrice = round(float(stop_price), d)
    if sl:
        req.stopLoss = round(float(sl), d)
    if tp:
        req.takeProfit = round(float(tp), d)
    if expiry_ms:
        req.expirationTimestamp = int(expiry_ms)
    log.info(f"[execution] STOP {side} {symbol} vol={req.volume} @ {req.stopPrice} "
             f"SL {req.stopLoss} TP {req.takeProfit}")
    return req, None


def build_cancel(acct: int, order_id: int):
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOACancelOrderReq
    req = ProtoOACancelOrderReq()
    req.ctidTraderAccountId, req.orderId = acct, int(order_id)
    return req


def build_amend(acct: int, position_id: int, symbol: str, sl: float, tp: float | None):
    """Move a live position's stop (and re-state its target).

    BOTH LEGS GO EVERY TIME, and this is the single most important line in the file. cTrader's REST
    surface DELETES a leg that is omitted from an amend (the ctrader-mcp-servers skill flags it as
    critical, `Q-R10`). `ProtoOAAmendPositionSLTPReq` has both fields optional-with-presence, so the
    protobuf API can tell "omitted" from "set" and may well behave the same way. Rather than rely on
    finding out which, the caller reads the position's CURRENT take profit moments before and re-
    passes it here — correct under either behaviour, and the cost is one field.

    A position genuinely without a target is the one case where `tp` is None, and then it is left
    unset because there is nothing to preserve.
    """
    from ctrader_open_api.messages.OpenApiMessages_pb2 import ProtoOAAmendPositionSLTPReq
    d = price_digits(symbol)
    req = ProtoOAAmendPositionSLTPReq()
    req.ctidTraderAccountId = acct
    req.positionId = int(position_id)
    req.stopLoss = round(float(sl), d)
    if tp:
        req.takeProfit = round(float(tp), d)
    log.info(f"[execution] AMEND position {position_id} {symbol} SL -> {req.stopLoss} "
             f"TP {'preserved at ' + str(req.takeProfit) if tp else 'none on this position'}")
    return req


def read_execution(event, is_cancel: bool, is_amend: bool = False) -> OrderResult | None:
    """Interpret an execution event. None = not a verdict yet, keep waiting.

    ACCEPTED IS SUCCESS for a pending order — a stop order that is resting is precisely what was
    asked for. Waiting for a FILL here would time out on every correctly-placed order and then look
    like a failure, which is the trap this function exists to avoid.
    """
    from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAExecutionType
    et = event.executionType

    if event.HasField("errorCode") and event.errorCode:
        return OrderResult(ok=False, error=f"cTrader: {event.errorCode}")

    def is_type(name: str) -> bool:
        return hasattr(ProtoOAExecutionType, name) and et == getattr(ProtoOAExecutionType, name)

    if is_cancel and is_type("ORDER_CANCELLED"):
        return OrderResult(ok=True)
    # AN AMEND IS ACKNOWLEDGED BY A POSITION EVENT, not an order one. cTrader reports the change as
    # a MODIFY on the position; the ORDER_* verdicts below describe pending orders and would never
    # arrive, so without this branch every successful amend would sit until the timeout and then be
    # reported as a failure — the same trap ACCEPTED-is-success exists to avoid for stop orders.
    if is_amend:
        for good in ("POSITION_MODIFY", "ORDER_ACCEPTED", "ORDER_REPLACED"):
            if is_type(good):
                return OrderResult(ok=True)
    for bad in ("ORDER_REJECTED", "ORDER_CANCELLED", "ORDER_EXPIRED"):
        if is_type(bad):
            return OrderResult(ok=False, error=f"cTrader: {bad}")

    oid = str(event.order.orderId) if event.HasField("order") else None
    if is_type("ORDER_ACCEPTED"):
        return OrderResult(ok=True, order_id=oid)
    if is_type("ORDER_FILLED"):
        pos = event.position if event.HasField("position") else None
        return OrderResult(ok=True, filled=True, order_id=oid,
                           fill_price=float(pos.price) if pos and pos.price else None)
    return None                                    # intermediate event — not a verdict
