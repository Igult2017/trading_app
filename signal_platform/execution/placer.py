"""
Turn a confirmed signal into a real pending stop order — and then report how the real world differed.

THE POINT IS THE SECOND HALF. Placing the order is plumbing; the deliverable is `fill_report`, which
puts the MODELLED entry next to the ACTUAL fill so entry quality is measured instead of argued
about. Every backtest figure this platform has produced assumes a fill exactly at the stop price and
charges no spread. Neither is true, and until an order is actually resting at a broker there is no
way to find out by how much.

Everything is refused by default: `guards.check` runs first and its verdict is final.
"""
import logging
from datetime import datetime, timezone

from config.settings import settings
from execution import guards
from execution.sizing import plan_size
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


async def _tell(notify, message: str | None) -> None:
    """Send a diagnostic message, and never let it affect the order.

    A failed Telegram send must not turn a placed order into a reported failure, nor a refusal into
    an exception the caller has to handle — the message is the REPORT, not the trade.

    AND IT MUST NOT BE ABLE TO HOLD THE ORDER PATH UP EITHER. This caught exceptions but had no time
    limit, and `dispatcher._send_text` retries 3 times with 5s sleeps against 5s client timeouts —
    so a dead Telegram could block here for ~25 seconds, inside the scan that produced the signal.
    `safe_notify.tell` caps it at 3s. His rule, 2026-09-02: *"Telegram is only for messages."*
    """
    from notifications import safe_notify
    await safe_notify.tell(notify, message)


async def place_for_signal(signal, creds: dict, account_type: str, equity: float,
                           notify=None) -> str | None:
    """Place the stop order for a signal. Returns the broker order id, or None if not placed.

    Never raises: a fault in placement must not take down the scan that produced the signal. A
    refusal and a failure are both logged, and the caller carries on.
    """
    try:
        symbol    = signal.symbol
        side      = "BUY" if signal.direction.value == "buy" else "SELL"
        entry, sl, tp = signal.entry_price, signal.stop_loss, signal.take_profit
        if not entry or not sl:
            return None

        lots, volume, stop_pips = plan_size(
            equity=equity, entry=entry, stop=sl, symbol=symbol,
            risk_pct=settings.autotrade_risk_pct,
            fixed_lots=settings.autotrade_fixed_lots)

        why = guards.check(symbol, side, signal.strategy_id, account_type, equity, lots)
        if why:
            log.info(f"[execution] NOT placing {symbol} {side} — {why}")
            # SAY IT, don't only log it. A container log dies at the next deploy, so "a signal fired
            # and no order appeared" was previously unanswerable after the fact. One message per
            # signal, never per scan — `guards.check` runs once, at dispatch.
            if notify:
                await _tell(notify, refusal_message(
                    symbol, side, signal.strategy_name or signal.strategy_id, why))
            return None

        expiry_ms = int((signal.expires_at or datetime.now(timezone.utc)).timestamp() * 1000) \
            if signal.expires_at else None

        from execution.broker import StopOrderClient  # noqa: local import keeps ctrader deps lazy
        res = await StopOrderClient(creds, account_type).place_stop(
            symbol=symbol, side=side, volume=volume, lots=lots,
            stop_price=entry, sl=sl, tp=tp, expiry_ms=expiry_ms)

        if not res.ok:
            log.error(f"[execution] {symbol} {side} REJECTED — {res.error}")
            # THE BROKER REFUSING AN ORDER MUST REACH HIM. This path sent nothing, so on 31 Aug the
            # first order autotrade ever attempted was refused — gold priced to 3 decimals when the
            # symbol allows 2 — and the only record was a log line the next deploy destroyed. The
            # guards' refusals and successes were both reported; this, the one that means the
            # platform tried and the BROKER said no, was the silent one.
            if notify:
                await _tell(notify, rejection_message(
                    symbol, side, signal.strategy_name or signal.strategy_id,
                    lots, entry, sl, tp, res.error))
            return None

        guards.record(symbol, side)
        if res.order_id:
            _intent[res.order_id] = dict(symbol=symbol, side=side, entry=entry, sl=sl, tp=tp,
                                         lots=lots, volume=volume, stop_pips=stop_pips,
                                         placed_at=datetime.now(timezone.utc),
                                         strategy=signal.strategy_name or signal.strategy_id)
            # AND DURABLY, so a restart cannot forget it. Never raises: `autotrade_repo` swallows
            # its own failures, because recording the order must not be able to fail the order.
            autotrade_repo.record_placed(
                res.order_id, symbol=symbol, side=side, entry=entry, stop=sl, target=tp,
                lots=lots, volume=volume, stop_pips=stop_pips,
                strategy=signal.strategy_name or signal.strategy_id,
                # `db_id`, NOT `id` — there is no `id` field on Signal at all. The runner stamps
                # the saved row's id onto `db_id` after the insert and before dispatch
                # (orchestrator/strategy_runner.py). Reading `id` returned None every single time,
                # so this link was always null and the journal could never name the strategy that
                # placed a trade.
                signal_id=getattr(signal, "db_id", None) or None)
        log.info(f"[execution] PLACED {symbol} {side} {lots} lots (vol {volume}) stop {entry} "
                 f"order {res.order_id}")
        if notify and res.order_id:
            await _tell(notify, placement_message(res.order_id))
        return res.order_id
    except Exception as exc:                       # never let placement break the scan
        log.error(f"[execution] placement failed for {getattr(signal, 'symbol', '?')}: {exc}")
        return None


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


def rejection_message(symbol: str, side: str, strategy: str, lots: float,
                      entry: float, sl: float, tp: float | None, error: str) -> str:
    """The BROKER refused an order we did send — a different thing from our own guards refusing.

    Reported with the exact levels that were sent, because that is what the broker objected to and
    the refusal is usually about one of them. Gold, 31 Aug: the price carried three decimals and the
    symbol allows two, which is invisible unless the numbers are in front of you.
    """
    d = price_digits(symbol)
    levels = f"entry <code>{entry:.{d}f}</code> · stop <code>{sl:.{d}f}</code>"
    if tp:
        levels += f" · target <code>{tp:.{d}f}</code>"
    return (f"⛔ <b>BROKER REFUSED THE ORDER</b> · {symbol} {side} · {strategy}\n"
            f"{levels}\n"
            f"{lots} lots · <b>{error}</b>\n"
            f"<i>the signal stands — nothing is resting at the broker</i>")


def refusal_message(symbol: str, side: str, strategy: str, why: str) -> str:
    """Why a confirmed signal did NOT become an order.

    ONE PER SIGNAL, never per scan — `guards.check` runs once, when a signal is dispatched. Without
    this a signal simply arrives with no order behind it and nothing says which of the seven gates
    stopped it, which is exactly the question "how do I improve autotrading" runs into first.
    """
    return (f"🤖 <b>AUTOTRADE STOOD DOWN</b> · {symbol} {side} · {strategy}\n"
            f"{why}\n"
            f"<i>the signal stands — this only says no order was placed</i>")
