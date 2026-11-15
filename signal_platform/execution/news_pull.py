"""
A WAITING ORDER IS PULLED BEFORE HIGH-IMPACT NEWS, AND PUT BACK AFTER IF THE SETUP STILL STANDS.

WHY (15 Nov 2026). His rule is never to trade the news candle (*"if we miss the news we risk trading
news candles which can be disastrous for propfirms"*), and VIX.1 refuses a NEW entry from 15 minutes
before a high-impact release for the pair until 30 minutes after (`news_candle.in_news_window`, used
in `strategies/vix1.py`). But that only stopped NEW orders. An order already waiting at the broker
stayed there, and could fill in the middle of CPI — exactly when spreads blow out and stops slip.

THE RULE — the same 15 / 30 minutes, applied to orders already waiting:
  * PULL: an autotrade order still resting when the window opens is cancelled, and saved as
    `news_pulled` (durable, so a restart in between cannot forget it).
  * PUT BACK: once the window has closed and the calendar is known again, if the signal is still
    active and has not triggered, it goes through the NORMAL placer — every guard, the choosing
    window and the waiting-order watch all apply, as for any new order. Either way the old row is
    then closed as `cancelled` (the Autotrade screen's "Withdrawn").

Never raises — it runs on the tracker's clock beside the trade management.
"""
import asyncio
import logging
import time

from execution.intents import _intent, pending_intents

log = logging.getLogger(__name__)

_RETRY_S = 30.0
_pulled: dict[str, dict] = {}       # order id -> {signal_id, symbol, side, spread_used}
_tried: dict[str, float] = {}
_booted = False


async def check(send) -> None:
    global _booted
    try:
        if not _booted:
            from storage import autotrade_changes
            for r in await asyncio.get_running_loop().run_in_executor(None, autotrade_changes.news_pulled):
                _pulled.setdefault(r["order_id"], r)
            _booted = True
        from news import news_fetcher
        from news.news_candle import in_news_window
        news = await news_fetcher.fetch()
        from data import ctrader_positions as cp
        for oid, intent in list(pending_intents().items()):
            if oid in _pulled or not cp.last_resting_levels(oid):
                continue
            if in_news_window(news, intent["symbol"], before_min=15, after_min=30):
                if time.monotonic() - _tried.get(oid, 0.0) >= _RETRY_S:
                    _tried[oid] = time.monotonic()
                    await _pull(oid, intent, send)
        if news is None or not news.ok:
            return                       # calendar unknown — nothing goes back until it is known
        for oid, rec in list(_pulled.items()):
            if not in_news_window(news, rec["symbol"], before_min=15, after_min=30):
                await _put_back(oid, rec, send)
    except Exception as exc:
        log.error(f"[news_pull] {type(exc).__name__}: {exc}", exc_info=True)


async def _pull(oid: str, intent: dict, send) -> None:
    from execution import decision_log, withdrawal_notice
    from execution.account import load_account
    from execution.broker import StopOrderClient
    from storage import autotrade_changes
    sym = intent["symbol"]
    acct = await load_account()
    if acct is None:
        log.warning(f"[news_pull] {sym}: no usable account — cannot pull order {oid} before the news")
        return
    res = await StopOrderClient(acct.creds, acct.account_type).cancel(int(oid))
    why = "pulled — a high-impact release for this pair is 15 minutes away or less"
    if not res.ok:
        if "ORDER_NOT_FOUND" in str(res.error or "").upper():
            from execution import order_fate        # gone already: it may have FILLED (B29)
            await order_fate.settle_missing(oid, intent.get("signal_id"), sym, why)
            return
        log.warning(f"[news_pull] {sym}: could not pull order {oid} — {res.error}")
        return
    autotrade_changes.set_status(oid, autotrade_changes.STATUS_NEWS_PULLED)
    _pulled[oid] = dict(order_id=oid, signal_id=intent.get("signal_id"), symbol=sym,
                        side=intent["side"], spread_used=intent.get("spread_used") or 0.0)
    _intent.pop(oid, None)
    log.info(f"[news_pull] {sym}: order {oid} {why}")
    await decision_log.cancelled(intent.get("signal_id"), sym, oid, why)
    await withdrawal_notice.announce(oid, sym, f"{why}; it goes back 30 minutes after the release "
                                               f"if the setup still stands", withdrawal_notice.WITHDRAWN)


async def _put_back(oid: str, rec: dict, send) -> None:
    from storage import autotrade_changes
    _pulled.pop(oid, None)
    autotrade_changes.set_status(oid, autotrade_changes.STATUS_CANCELLED)
    sig = await asyncio.get_running_loop().run_in_executor(None, _signal_for, rec)
    sym = rec["symbol"]
    if sig is None:
        log.info(f"[news_pull] {sym}: order {oid} not put back — the setup ended during the news")
        await _say(send, f"📰 <b>NOT PUT BACK</b> · {sym} {rec['side']}\nthe order pulled before the "
                         f"news is not re-placed: the setup ended (or filled on paper) meanwhile")
        return
    from execution.account import load_account
    from execution.placer import place_for_signal
    acct = await load_account()
    if acct is None:
        log.warning(f"[news_pull] {sym}: no usable account — cannot put order {oid} back")
        return
    log.info(f"[news_pull] {sym}: the news window has passed — putting the setup of order {oid} back")
    await place_for_signal(sig, acct.creds, acct.account_type, acct.equity, notify=send,
                           risk_base=acct.risk_base)


def _signal_for(rec: dict):
    """The saved signal behind a pulled order, rebuilt for the placer — or None if it is not still a
    live, untriggered setup."""
    from core.types import Direction, Signal
    from storage.db import get_session
    from storage.models import SignalModel
    if not rec.get("signal_id"):
        return None
    with get_session() as s:
        row = s.get(SignalModel, rec["signal_id"])
        if row is None or row.status != "active" or row.triggered_at is not None:
            return None
        f = lambda v: float(v) if v is not None else 0.0      # noqa: E731
        return Signal(symbol=row.symbol, direction=Direction(row.type), strategy_id=row.strategy or "",
                      strategy_name=row.strategy or "", entry_price=f(row.entry_price),
                      stop_loss=f(row.stop_loss), take_profit=f(row.take_profit),
                      confidence=(row.confidence or 0) / 100.0, expires_at=row.expires_at,
                      db_id=row.id, spread_used=float(rec.get("spread_used") or 0.0))


async def _say(send, text: str) -> None:
    if send:
        from notifications import safe_notify
        await safe_notify.tell(send, text)
