"""
IS AN ORDER WE PLACED STILL ALIVE? Resting at the broker, or filled into a trade that is still open.

WHY THIS EXISTS (2026-09-15). The duplicate-order guard (`guards.check`, rule 7) refused any pair and
direction that had an order PLACED in the last 24 hours, and nothing ever took a dead order off its
list. His VIX.1 EUR/USD sell of 14 Sep 07:23 (order 360658076) was withdrawn at 07:26, when price
touched its stop side before its entry. At 13:03 the next EUR/USD sell reached its entry and NO ORDER
WAS SENT. Proven from the broker's own order history: 360658076 never filled, and no order exists for
13:03. The guard has to ask what the broker still has, and this is that question.

ONE MATCHING RULE, SHARED. A `Position` carries no order id, so a fill is recognised by pair + side +
volume, opened after we placed. `fill_watch` already matched fills that way; it now calls
`fill_matches` here, so the fill report and the guard can never disagree about which trade is ours.
"""
from datetime import datetime


def fill_matches(symbol: str, side: str, volume: int | None, placed_at: datetime, pos) -> bool:
    """Is this open position the fill of an order for `symbol`/`side`/`volume` placed at `placed_at`?"""
    if symbol != pos.symbol:
        return False
    if (side == "BUY") != bool(pos.bullish):
        return False
    if int(volume or 0) != int(pos.volume or 0):
        return False
    # It cannot be our fill if it was already open when we placed.
    return pos.opened_at >= int(placed_at.timestamp())


def why_alive(order_id: str | None, symbol: str, side: str, volume: int | None,
              placed_at: datetime, book: tuple[list, set[int]]) -> str | None:
    """A reason the order still counts as live, or None when the broker shows it is gone.

    `book` is (open positions, ids of resting orders) from ONE broker reply
    (`monitor.position_book.snapshot`).

    DOUBT REFUSES, NEVER THE OTHER WAY. An order with no id cannot be looked up, so it is treated as
    live. An order with no recorded volume cannot be matched by size, so any same-pair, same-side trade
    opened after it counts as its fill.
    """
    positions, resting = book
    try:
        oid = int(order_id) if order_id else None
    except (TypeError, ValueError):
        oid = None
    if oid is None:
        return "its order id was never recorded, so the broker cannot confirm it is gone"
    if oid in resting:
        return f"order {order_id} is still resting at the broker"
    for pos in positions:
        if volume is None:
            ours = (pos.symbol == symbol and (side == "BUY") == bool(pos.bullish)
                    and pos.opened_at >= int(placed_at.timestamp()))
        else:
            ours = fill_matches(symbol, side, volume, placed_at, pos)
        if ours:
            return f"order {order_id} filled and that trade is still open"
    return None
