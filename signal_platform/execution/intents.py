"""
What each autotrade order was MEANT to be, and the two reports read off it: the placement DM and the
"FILL vs MODEL" comparison. Moved out of `placer.py` on 15 Nov 2026 (it had passed 390 lines) so the
placer is only placement; the waiting-order watch, the news pull and the fill watch all read this.
"""
import logging
from datetime import datetime

from storage import autotrade_repo
from shared.pip import pip_size, price_digits

log = logging.getLogger(__name__)

# order_id -> what the MODEL said, so the fill can be compared against it later.
#
# THIS IS A CACHE NOW, NOT THE RECORD. It used to be the only copy, so a redeploy between placing an
# order and its fill lost the fill report and the link back to the signal — and nothing said why.
# His instruction, 2026-09-02: *"persist every memory that we might need... I dont want to here that
# we redeployed and the memory was wiped so we cant know what happened."* The durable copy is in
# `autotrade_orders`; this dict just saves a query on the common path.
_intent: dict[str, dict] = {}


def fill_report(order_id: str, fill_price: float, filled_at: datetime | None = None) -> str | None:
    """MODELLED vs ACTUAL for one fill — the diagnostic this whole feature exists to produce.

    Slippage is signed in the trader's favour/against: NEGATIVE means we got a WORSE price than the
    model assumed, which is the direction that matters and the direction a stop order usually goes
    (it triggers into the move, and it pays the spread on entry). Reported in pips AND as a share of
    the trade's own risk, because 0.4 pips means nothing until you know the stop was 9.
    """
    intent = _intent.pop(order_id, None)
    # THE DURABLE COPY IS THE FALLBACK. Before this, a redeploy between placing and filling meant
    # `_intent` was empty and the fill report — the one diagnostic this feature exists to produce —
    # silently never arrived.
    if intent is None:
        intent = autotrade_repo.intent_for(order_id)
    if not intent or not fill_price:
        return None
    if fill_price:
        autotrade_repo.record_filled(order_id, fill_price, filled_at)
    sym  = intent["symbol"]
    pip  = pip_size(sym)
    d    = price_digits(sym)
    buy  = intent["side"] == "BUY"
    # worse for a BUY = filled HIGHER than the stop; worse for a SELL = filled LOWER
    slip_pips = ((intent["entry"] - fill_price) if buy else (fill_price - intent["entry"])) / pip
    risk_pips = intent["stop_pips"] or 0.0
    share     = (abs(slip_pips) / risk_pips * 100) if risk_pips else 0.0
    delay     = ""
    if filled_at:
        secs = (filled_at - intent["placed_at"]).total_seconds()
        delay = f" · rested {int(secs // 60)}m{int(secs % 60):02d}s"
    verdict = "WORSE than modelled" if slip_pips < 0 else ("better" if slip_pips > 0 else "exact")
    return (f"🔬 <b>FILL vs MODEL</b> · {sym} {intent['side']} · {intent['strategy']}\n"
            f"modelled <code>{intent['entry']:.{d}f}</code> → "
            f"filled <code>{fill_price:.{d}f}</code>\n"
            f"slippage <b>{slip_pips:+.1f} pips</b> ({verdict}) — "
            f"{share:.0f}% of the {risk_pips:.1f}p stop{delay}")


def rehydrate_intents() -> int:
    """Load orders still awaiting a fill back into memory. Call ONCE at boot. Returns how many.

    THIS IS WHERE DURABILITY BELONGS — at startup, not on the trading path. A first version had
    `pending_intents()` query the database directly, which was correct but put a DB read inside
    `check_fills`, which runs on EVERY 30-second monitor poll. His rule, 2026-09-02: *"the logic that
    places trades, moves it to BE and locks Rs ... should work regardless because it is the lifeline
    of a trade."* A database that is slow or down would have slowed that loop; the test measured the
    poll going from under a second to 2.7. Reading once at boot gives the same durability and costs
    the poll nothing.
    """
    try:
        rows = autotrade_repo.pending()
    except Exception as exc:                      # never block boot on this
        log.warning(f"[execution] could not restore pending orders: {type(exc).__name__}: {exc}")
        return 0
    restored = 0
    for order_id, intent in rows.items():
        if order_id not in _intent:               # anything already in memory is fresher
            _intent[order_id] = intent
            restored += 1
    if restored:
        log.info(f"[execution] restored {restored} order(s) still awaiting a fill from the last run "
                 f"— their fill reports survive the restart")
    return restored


def pending_intents() -> dict[str, dict]:
    """Orders placed and not yet filled. In-memory ONLY — see `rehydrate_intents` for why."""
    return dict(_intent)


def placement_message(order_id: str) -> str | None:
    """What went to the broker, for his DM — his ask, 2026-08-31: *"make sure those trades placed by
    autotrade are also sent to DM so that I can review them later and see how well they were placed
    to help me improve autotrading."*

    Until now a placement existed ONLY as a line in the container log, which is lost on every
    deploy — so there was no way to review afterwards what autotrade had actually done.

    This is the order as SENT. `fill_report` is the other half and comes later, when it fills.
    """
    i = _intent.get(order_id) or autotrade_repo.intent_for(order_id)
    if not i:
        return None
    d = price_digits(i["symbol"])

    levels = f"entry <code>{i['entry']:.{d}f}</code> · stop <code>{i['sl']:.{d}f}</code>"
    rr = ""
    if i.get("tp"):
        levels += f" · target <code>{i['tp']:.{d}f}</code>"
        risk = abs(i["entry"] - i["sl"])
        if risk:
            rr = f" · {abs(i['tp'] - i['entry']) / risk:.1f}R"

    return (f"🤖 <b>AUTOTRADE PLACED</b> · {i['symbol']} {i['side']} · {i['strategy']}\n"
            f"{levels}\n"
            f"{i['lots']} lots · risking {i['stop_pips']:.1f} pips{rr}\n"
            f"<i>order {order_id} — resting at the broker, not yet filled</i>")
