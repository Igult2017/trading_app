"""
A FILL THAT LANDED WORSE THAN PLANNED IS CUT BACK TO 1% RISK — once, the moment it is seen.

WHY (15 Nov 2026). The lots are sized for the entry the order was PLACED at. A stop order triggers
into the move and pays the spread, so it usually fills a little worse — and the stop does not move
with it, so the real distance is longer than the size was set for. 2 pips worse on a 12-pip stop is
about 17% more than the 1% he chose. The "FILL vs MODEL" message (`placer.fill_report`) has measured
this on every fill and nothing ever corrected it.

THE RULE. From the real fill price to the real stop, the size that risks exactly 1% is worked out
(`plan_size`, the same sizing the order was placed with). If the open trade is more than
`_TOLERANCE` (10%) bigger than that, the excess is closed at once; the rest of the trade, its stop and
its target are untouched. Under 10% it is left alone, so a fraction of a pip never triggers a close.

ONCE PER FILL, AND NEVER RETRIED. The mark goes on BEFORE the close is sent, because a close that
timed out has an UNKNOWN outcome and sending it again could close the trade twice. A failure is
reported to him instead.

Never raises — it runs inside the poll that also manages every open trade.
"""
import logging

from core import delivery_ledger
from shared.pip import pip_size

log = logging.getLogger(__name__)

#: How much over the planned 1% the real risk may be before the excess is closed.
_TOLERANCE = 0.10


def excess(volume: int, target: int, tolerance: float = _TOLERANCE) -> int:
    """How much of the trade to close: 0 unless it is over `target` by more than `tolerance`."""
    if target <= 0 or volume <= target * (1.0 + tolerance):
        return 0
    return int(volume - target)


async def correct(order_id: str, intent: dict, pos, send) -> None:
    """Close the over-risked part of a just-filled autotrade trade, if there is one."""
    key = f"fillrisk:{order_id}"
    try:
        if delivery_ledger.is_delivered(key):
            return
        stop = getattr(pos, "start_stop", None) or pos.stop
        if not stop:
            return                       # no stop on the trade — nothing honest to size against
        from config.settings import settings
        if settings.autotrade_fixed_lots:
            delivery_ledger.mark_delivered(key)
            return                       # the diagnostic fixed size is not a 1% plan
        from execution.account import load_account
        from execution.placer import _usd_jpy_for
        from execution.sizing import plan_size
        acct = await load_account()
        if acct is None or not acct.risk_base:
            return                       # try again next poll
        lots, target, pips = plan_size(
            equity=acct.risk_base, entry=pos.entry, stop=stop, symbol=pos.symbol,
            risk_pct=settings.autotrade_risk_pct, max_lots=settings.autotrade_max_lots,
            usd_jpy=await _usd_jpy_for(pos.symbol))
        cut = excess(int(pos.volume), int(target))
        delivery_ledger.mark_delivered(key)          # BEFORE the close — see the module note
        if not cut:
            return
        from execution.broker import StopOrderClient
        res = await StopOrderClient(acct.creds, acct.account_type).close_part(pos.position_id, cut)
        over = (int(pos.volume) / target - 1.0) * 100
        side = "BUY" if pos.bullish else "SELL"
        if res.ok:
            intent["volume"] = int(pos.volume) - cut  # so the fill report still recognises the trade
            log.info(f"[fill_risk] {pos.symbol} #{pos.position_id}: risk {over:.0f}% over plan — "
                     f"closed {cut} of {pos.volume}, keeping {lots} lots")
            msg = (f"✂️ <b>OVER-RISKED FILL CUT BACK</b> · {pos.symbol} {side}\n"
                   f"filled at {pos.entry} with the stop {abs(pos.entry - stop) / pip_size(pos.symbol):.1f}p "
                   f"away — {over:.0f}% more than the planned 1%\n"
                   f"closed the excess; <b>{lots} lots</b> stay open at 1%")
        else:
            log.warning(f"[fill_risk] {pos.symbol} #{pos.position_id}: close of {cut} failed — {res.error}")
            msg = (f"⚠️ <b>OVER-RISKED FILL NOT CUT</b> · {pos.symbol} {side}\n"
                   f"the trade risks {over:.0f}% more than the planned 1%; closing the excess failed: "
                   f"{res.error}\n<i>not retried — check the position</i>")
        if send:
            from notifications import safe_notify
            await safe_notify.tell(send, msg)
    except Exception as exc:
        log.error(f"[fill_risk] {order_id}: {type(exc).__name__}: {exc}", exc_info=True)
