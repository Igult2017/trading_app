"""Did the order fill, and where — the second half of the autotrade diagnostic.

HIS ASK, 2026-08-31: *"make sure those trades placed by autotrade are also sent to DM so that I can
review them later and see how well they were placed to help me improve autotrading."*

`placer.fill_report` already produced exactly that comparison — modelled entry beside actual fill,
slippage in pips AND as a share of the trade's own risk. **It had never once run: nothing called
it.** Its own docstring calls it *"the deliverable"* and *"the point"* of the feature. So the
measurement the whole autotrade exercise exists to produce was written and then never wired up.

WHY THIS IS THE NUMBER THAT MATTERS. Every backtest figure this platform has produced assumes a fill
exactly at the stop price and charges no spread. A stop order does neither: it triggers INTO the
move and pays the spread on entry. Until an order actually rests at a broker there is no way to know
by how much — and 0.4 pips means nothing until you know the stop was 9.

HOW A POSITION IS MATCHED TO AN ORDER. `Position` carries no order id, so the match is on
**symbol + side + volume**, and the position must have opened AFTER we placed. That is unambiguous
in practice because `guards.check` permits only ONE live order per symbol+direction at a time — but
volume is included deliberately rather than relying on that alone, because the tracker also sees
trades he opened by hand, and reporting his manual fill as autotrade's would corrupt the very
measurement this exists to produce.

SENT ONCE. The `delivery_ledger` is DB-backed, so a redeploy cannot re-send a fill report, and a
failed send retries on the next poll.
"""
import logging

from core import delivery_ledger
from execution.placer import fill_report, pending_intents, _intent

log = logging.getLogger(__name__)

_TTL = 7 * 24 * 3600      # keep the "already reported" marks a week; a fill is reported once

# WHICH STRATEGY OWNS AN OPEN POSITION — position_id -> strategy id.
#
# A `Position` read from the broker carries NO strategy: cTrader does not know what opened it. The
# ladder needs to know, because his 0.4R breakeven is VIX.1's and must not silently re-tune any other
# strategy's trades. The match already exists in `_matches`; what was missing is that it did not
# SURVIVE. `check_fills` pops the intent the moment the fill report is sent, and the ladder then runs
# for the rest of the position's life with nothing left to ask.
#
# So ownership is recorded at the moment of the match and kept until the position closes.
#
# IT IS IN-MEMORY, AND THAT IS SAFE IN THE ONLY DIRECTION THAT MATTERS. After a restart the map is
# empty, so a position opened before it is UNATTRIBUTED — and an unattributed position gets the old
# default ladder, never VIX.1's. Losing attribution costs a slightly later breakeven; inventing it
# would apply one strategy's numbers to another's money.
_owner: dict[int, str] = {}


def owner_of(position_id: int) -> str | None:
    """The strategy that opened this position, or None if we cannot say."""
    return _owner.get(int(position_id))


def _remember_owner(pos, intent: dict) -> None:
    """Note who owns this position. NEVER RAISES — attribution is a convenience, the fill report is
    the deliverable, and the first version of this took the report down with it: it read
    `pos.position_id` unguarded, and one position object without that field aborted the whole poll
    so NO order got its fill report. A secondary feature must not be able to break the primary one.
    """
    try:
        pid = getattr(pos, "position_id", None)
        strategy = (intent.get("strategy") or "").strip()
        if pid is not None and strategy:
            _owner[int(pid)] = strategy
    except Exception:                       # noqa: BLE001 — see above; never worth a failed report
        pass


def _forget_closed(positions) -> None:
    """Drop owners whose position is no longer open, so the map cannot grow forever. Never raises."""
    try:
        live = {int(p.position_id) for p in positions if getattr(p, "position_id", None) is not None}
        for pid in [k for k in _owner if k not in live]:
            _owner.pop(pid, None)
    except Exception:                       # noqa: BLE001
        pass


def _matches(intent: dict, pos) -> bool:
    """Is this open position the fill of that order?"""
    if intent["symbol"] != pos.symbol:
        return False
    if (intent["side"] == "BUY") != bool(pos.bullish):
        return False
    if int(intent.get("volume") or 0) != int(pos.volume or 0):
        return False
    # It cannot be our fill if it was already open when we placed.
    return pos.opened_at >= int(intent["placed_at"].timestamp())


async def check_fills(positions, send) -> None:
    """One poll. `positions` is whatever `open_positions()` returned; `send` is the private DM.

    Never raises: this is a measurement, and a measurement must not be able to disturb the trade
    management running beside it.
    """
    if not positions:
        return
    try:
        for order_id, intent in list(pending_intents().items()):
            match = next((p for p in positions if _matches(intent, p)), None)
            if match is None:
                continue
            # RECORD OWNERSHIP BEFORE THE INTENT IS POPPED. Below, either branch drops the intent
            # (reported, or already reported), and the strategy is only knowable from it. The ladder
            # asks for the rest of the position's life, long after this poll.
            _remember_owner(match, intent)
            key = f"fill:{order_id}"
            if delivery_ledger.is_delivered(key):
                _intent.pop(order_id, None)      # already reported — stop re-checking it
                continue
            from datetime import datetime, timezone
            msg = fill_report(order_id, match.entry,
                              datetime.fromtimestamp(match.opened_at, timezone.utc))
            if not msg:
                continue
            # BOUNDED — this runs inside the 30s poll that also watches every open position for a
            # stop move. A stalled Telegram here would hold that poll up; `tell` caps it at 3s and
            # never raises, and a False still retries below.
            from notifications import safe_notify as _notify
            if await _notify.tell(send, msg):
                delivery_ledger.mark_delivered(key)
            else:
                # The send failed, so put the intent back and try again next poll — `fill_report`
                # POPS it, and dropping it here would lose the only record that this order filled.
                _intent[order_id] = intent
        _forget_closed(positions)
        delivery_ledger.cleanup(_TTL)
    except Exception as exc:
        log.error(f"[fill-watch] {type(exc).__name__}: {exc}", exc_info=True)
