"""ONE ORDERED LANE PER MASTER TRADE — events about the same order or position run one after another.

WHY (audit 21 Nov 2026). Every master event used to start as its own task (`providers/ctrader.py`,
`asyncio.ensure_future`), and a follower copy takes seconds to place. So the master's NEXT action on the same trade
could be handled first:
  * a move or cancel arriving while the follower's order was still being placed found no mirror and was SKIPPED
    (`dispatcher.py`, "No resting follower order mirrors master order") — a stale or orphan order left resting;
  * a fill arriving then found no mirror either, so it was treated as a NEW entry (`mirror.record_fill_for` False) —
    and when the placement landed too, the follower was in the trade TWICE.

THE RULE. An event names the things it is about — the master's order id and/or position id. It waits for the last
event about ANY of them to finish, and becomes the last one for ALL of them. So PLACED → AMENDED → FILLED (order AND
position) → MODIFY → CLOSE (position) run strictly in that order, while different trades and different masters still
run side by side. Nothing waits on itself, so there is no cycle and no deadlock.
"""
import asyncio
import logging

log = logging.getLogger("copy.lanes")


class Lanes:
    def __init__(self):
        self._tails: dict[str, asyncio.Future] = {}

    def run(self, keys, make_coro) -> asyncio.Future:
        """Start `make_coro()` once every earlier event about any of `keys` has finished. Returns its task."""
        keys = [k for k in dict.fromkeys(keys) if k]
        before = [t for t in {id(t): t for t in (self._tails.get(k) for k in keys) if t is not None}.values()
                  if not t.done()]

        async def _go():
            for t in before:
                try:
                    await t
                except BaseException:            # an earlier failure must not stop the next event about the trade
                    pass
            return await make_coro()

        task = asyncio.ensure_future(_go())
        for k in keys:
            self._tails[k] = task

        def _tidy(t, keys=tuple(keys)):
            for k in keys:
                if self._tails.get(k) is t:
                    del self._tails[k]
            if not t.cancelled() and t.exception() is not None:
                log.error(f"[lanes] an event for {', '.join(keys)} failed: "
                          f"{type(t.exception()).__name__}: {t.exception()}")
        task.add_done_callback(_tidy)
        return task

    def busy(self) -> int:
        return len(self._tails)


def event_keys(event) -> list[str]:
    """The master order and position an execution event is about."""
    keys = []
    if event.HasField("order") and getattr(event.order, "orderId", 0):
        keys.append(f"order:{event.order.orderId}")
    if event.HasField("position") and getattr(event.position, "positionId", 0):
        keys.append(f"pos:{event.position.positionId}")
    return keys
