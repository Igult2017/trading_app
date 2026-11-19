"""
WHAT STOOD BEHIND A SIGNAL'S OUTCOME — a real order, a withdrawn one, or none at all (20 Nov 2026).

HIS REPORT: *"The system has no memory of the order that was placed. Sometimes I receive notification that SL hit or
TP hit and the order had been withdrawn long ago or was not placed."*

WHY IT HAPPENED. The outcome message is about the SIGNAL: `signal_monitor` closes it on price alone and
`dispatcher.on_signal_closed` built the card from the signal row only. An order can vanish while its signal runs on —
his ❌ Cancel (`execution/trade_actions`), the pull before news (`execution/news_pull`), the broker no longer having it
(`execution/order_fate`) — and a refused, unconfirmed or trading-off signal never had one. The link was always there
(`autotrade_orders.signal_id`); nothing read it.

`note_for(signal_id)` answers, for a signal that reached its target or stop:
  * None                    a real order stands behind it (filled, or still recorded as placed) — the card as before
  * "No order was placed."  nothing was ever sent for this signal
  * "Your order was withdrawn at HH:MM UTC — <why>."   the newest order for it never became a position
UNKNOWN IS NOT "NO ORDER": if the order table cannot be read, None comes back and the card is the old one. Telling him
"no order was placed" about a trade that is really open is the worse mistake.
"""
import json
import logging
from datetime import timezone

log = logging.getLogger(__name__)

_WITHDRAWN = {"cancelled", "rejected", "news_pulled"}


def note_for(signal_id: str | None) -> str | None:
    if not signal_id:
        return None
    try:
        from storage import autotrade_repo
        order = autotrade_repo.latest_for_signal(signal_id)
    except Exception as exc:
        log.warning(f"[order_memory] could not read the order for signal {signal_id} "
                    f"({type(exc).__name__}) — sending the outcome card unchanged")
        return None
    if order is None:
        return "No order was placed."
    if order["status"] not in _WITHDRAWN:
        return None
    return _withdrawn(signal_id, order)


def _withdrawn(signal_id: str, order: dict) -> str:
    """"Your order was withdrawn at HH:MM UTC — why." The time and reason come from the decision log; either may be
    missing (an older withdrawal), and the sentence is then shorter, never invented."""
    when = why = ""
    try:
        from storage import observability_repo
        from storage.observability_models import STAGE_AUTOTRADE_CANCELLED
        ev = observability_repo.last_event(signal_id, STAGE_AUTOTRADE_CANCELLED)
        if ev:
            at, detail = ev
            if at is not None:
                at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
                when = f" at {at.astimezone(timezone.utc):%d %b %H:%M} UTC"
            why = (json.loads(detail or "{}").get("reason") or "").strip()
    except Exception as exc:
        log.warning(f"[order_memory] could not read when the order for {signal_id} was withdrawn "
                    f"({type(exc).__name__})")
    if order["status"] == "rejected":
        return f"Your order was refused by the broker{when}."
    return f"Your order was withdrawn{when}" + (f" — {why}." if why else ".")
