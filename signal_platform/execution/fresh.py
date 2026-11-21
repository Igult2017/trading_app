"""THE TRADE AS IT IS NOW — read straight from the broker just before an amend.

WHY (21 Nov 2026, his report: *"it moves target to 4R ... I got telegram messages that it is not working"*). An amend
carries BOTH legs, so whatever we send for the leg we are NOT changing must be what the broker has NOW. Both trade-
manager loops work from `monitor/position_book`, up to 5 s old, so a stop move could re-send a target that had just
been moved to 4R (or that he had just set himself), and the 4R move could re-send a stop the other loop had just moved
to breakeven. One broker read in front of every amend closes that: the other leg is always the current one.

Unreadable is NOT "closed": the caller sends nothing and tries again on the next pass. Never a guess.
"""
from data import ctrader_positions


async def current(position_id: int):
    """(asked, position). asked False = the broker could not be read. position None = it is no longer open."""
    positions = await ctrader_positions.open_positions()
    if positions is None:
        return False, None
    return True, next((x for x in positions if int(x.position_id) == int(position_id)), None)


def same_price(a: float | None, b: float | None, digits: int) -> bool:
    """Equal to the symbol's last decimal — how a price the broker hands back is compared with one we sent."""
    if a is None or b is None:
        return a is b
    return abs(float(a) - float(b)) <= 0.5 * 10 ** -digits
