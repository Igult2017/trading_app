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


def one_trade_live(recent, book, resting_labels: list[str] | None = None) -> str | None:
    """Why a NEW autotrade order must wait, or None when nothing of ours is live anywhere.

    HIS RULE, 15 Nov 2026: *"we only trade 1 signal at a time."* So any autotrade order still resting,
    or any autotrade trade still open, on ANY pair and in EITHER direction, blocks the next one.

    TWO WAYS OF RECOGNISING OUR OWN, because each misses something the other catches:
      * THE MARK — every autotrade order carries an `auto-` label (`orders.order_label`, since 8 Nov)
        and cTrader copies it onto the position. It survives an amend and a partial close, which
        change the SIZE, and it has no 24-hour horizon.
      * THE PLACEMENT LOG — the orders placed in the last 24 h (`recent`), each asked of the broker
        by id and by size (`why_alive`). It catches an order whose mark did not come through.

    DOUBT REFUSES: with the broker unreadable (`book` None) nothing can be confirmed gone.
    """
    from execution.orders import LABEL_PREFIX
    if book is None:
        return "the broker could not be read, so it cannot be confirmed that no autotrade trade is live"
    positions, _resting = book
    mark = f"{LABEL_PREFIX}-"
    for pos in positions:
        if str(getattr(pos, "label", "") or "").startswith(mark):
            side = "BUY" if pos.bullish else "SELL"
            return f"one trade at a time — the {pos.symbol} {side} autotrade trade is still open"
    if any(str(lab or "").startswith(mark) for lab in (resting_labels or [])):
        return "one trade at a time — an autotrade order is still resting at the broker"
    for placed_at, symbol, side, order_id, volume in recent:
        alive = why_alive(order_id, symbol, side, volume, placed_at, book)
        if alive:
            return f"one trade at a time — the {symbol} {side} order is still live: {alive}"
    return None
