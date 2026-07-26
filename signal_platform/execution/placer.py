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
from shared.pip import pip_size, price_digits

log = logging.getLogger(__name__)

# order_id -> what the MODEL said, so the fill can be compared against it later
_intent: dict[str, dict] = {}


async def place_for_signal(signal, creds: dict, account_type: str, equity: float) -> str | None:
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
            return None

        expiry_ms = int((signal.expires_at or datetime.now(timezone.utc)).timestamp() * 1000) \
            if signal.expires_at else None

        from execution.broker import StopOrderClient  # noqa: local import keeps ctrader deps lazy
        res = await StopOrderClient(creds, account_type).place_stop(
            symbol=symbol, side=side, volume=volume,
            stop_price=entry, sl=sl, tp=tp, expiry_ms=expiry_ms)

        if not res.ok:
            log.error(f"[execution] {symbol} {side} REJECTED — {res.error}")
            return None

        guards.record(symbol, side)
        if res.order_id:
            _intent[res.order_id] = dict(symbol=symbol, side=side, entry=entry, sl=sl, tp=tp,
                                         lots=lots, volume=volume, stop_pips=stop_pips,
                                         placed_at=datetime.now(timezone.utc),
                                         strategy=signal.strategy_name or signal.strategy_id)
        log.info(f"[execution] PLACED {symbol} {side} {lots} lots (vol {volume}) stop {entry} "
                 f"order {res.order_id}")
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
    if not intent or not fill_price:
        return None
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


def pending_intents() -> dict[str, dict]:
    """Orders placed this process that have not reported a fill — for reconciliation."""
    return dict(_intent)
