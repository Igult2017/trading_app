"""
VIX.1 — THE TARGET STARTS AT 2R AND IS MOVED OUT TO 4R WHEN THE TRADE SHOWS IT IS WILLING TO RUN.

His rule, 17 Nov 2026: *"I target 2R not 4R, i only target 4R when the trade is willing to run."* His option A:
while the trade is open, if a NEW momentum candle closes in the trade's direction, the target is moved from 2R
to 4R. It has to happen before 2R is reached — once price touches 2R the broker closes the trade at its target.

WHAT IS MOVED, AND WHAT IS NOT:
  * only VIX.1's own positions (label `auto-vix1…`) — never his manual trades, never another strategy's;
  * only the TARGET. The current stop is re-passed unchanged, because an amend that omits a leg DELETES it
    (proven on a live demo position 21 Aug, `execution/breakeven.py` rule 1);
  * only outward, once: a target already beyond 2R is left alone;
  * the same switches as every automatic amend: `auto_breakeven_enabled` on, demo account only.
Afterwards the position is READ BACK — the call returning is not believed.

"A NEW MOMENTUM CANDLE" = a closed 1H candle that closed AFTER the fill and qualifies the trade's way through the
strategy's own `qualifies_for_trade` — the same test that qualifies a candle to trade.
"""
import logging

from config.settings import settings
from config import live_settings
from data import ctrader_positions
from core import delivery_ledger

log = logging.getLogger(__name__)

_LABEL = "auto-vix1"
_AT_2R = 0.1          # the target reads as "still the 2R one" within this many R of 2R


def _levels():
    from strategies.vix1 import _TP_R, _TP_R_RUN
    return _TP_R, _TP_R_RUN


def target_r(p) -> float | None:
    """Where the position's target sits, in R from the fill. None if it cannot be said."""
    risk = p.risk()
    if not risk or p.target is None:
        return None
    return ((p.target - p.entry) if p.bullish else (p.entry - p.target)) / risk


def why_not(p, account_type: str) -> str | None:
    """The reason this position's target must NOT be extended, or None. No network call."""
    if not str(getattr(p, "label", "") or "").startswith(_LABEL):
        return "not a VIX.1 position"
    from monitor.gold_bank_plan import is_gold
    if is_gold(getattr(p, "symbol", "")):
        return "gold banks its profit in pieces (monitor/gold_bank.py) — its target is not moved to 4R"
    if not live_settings.get('auto_breakeven_enabled'):
        return "automatic trade management is off"
    if settings.auto_breakeven_demo_only and (account_type or "").lower() != "demo":
        return f"account is '{account_type}', not demo — refusing to amend"
    if p.stop is None:
        return "no stop on this position"
    base, _ = _levels()
    tr = target_r(p)
    if tr is None:
        return "target or starting stop not known"
    if abs(tr - base) > _AT_2R:
        return f"target is at {tr:.2f}R, not the {base:.0f}R one — already moved or set by hand"
    return None


def momentum_after_fill(h1_closed: list, p) -> object | None:
    """The first closed 1H candle that CLOSED after the fill and qualifies the trade's way, or None."""
    from strategies.vix1_momentum import qualifies_for_trade
    for k, c in enumerate(h1_closed):
        if c.time + 3600 <= p.opened_at:
            continue
        if qualifies_for_trade(h1_closed[:k + 1], k, p.bullish, p.symbol):
            return c
    return None


async def maybe_extend(p, send, creds: dict, account_type: str) -> bool:
    """Move this position's target from 2R to 4R if a momentum candle has closed its way. True if moved."""
    key = f"tp_extend:{p.position_id}"
    if delivery_ledger.is_delivered(key) or why_not(p, account_type):
        return False
    from data.candle_fetcher import fetch_candles
    from shared.mtf_utils import closed_only
    h1 = closed_only(await fetch_candles(p.symbol, "H1", 3000) or [])
    mc = momentum_after_fill(h1, p)
    if mc is None:
        return False
    base, run = _levels()
    risk = p.risk()
    from shared.pip import price_digits
    d = price_digits(p.symbol)
    new_tp = round(p.entry + run * risk if p.bullish else p.entry - run * risk, d)
    # THE TRADE AS IT IS NOW (21 Nov 2026). `p` can be up to 5 s old; re-sending its stop could undo a breakeven the
    # 0.5 s watcher has just made, and a target he changed meanwhile must not be overwritten. Unreadable = try later.
    from execution import fresh
    asked, cur = await fresh.current(p.position_id)
    if not asked or cur is None or cur.stop is None or cur.target is None:
        return False
    cur_r = ((cur.target - p.entry) if p.bullish else (p.entry - cur.target)) / risk
    if abs(cur_r - base) > _AT_2R:
        return False                      # no longer the 2R target — moved already, or set by hand
    from execution.broker import StopOrderClient
    res = await StopOrderClient(creds, account_type).amend_sltp(p.position_id, p.symbol, cur.stop, new_tp)
    if not res.ok:
        log.warning(f"[tp_extend] {p.symbol} #{p.position_id}: broker refused — {res.error}")
        return False
    from monitor import position_book
    position_book.invalidate()            # no loop may keep re-sending the old 2R target
    ok, now = await fresh.current(p.position_id)
    if now is None:
        return False                     # closed meanwhile, or unreadable: the next poll decides again
    # CHECKED BY PRICE, NOT R (21 Nov 2026). This compared the target IN R, but a position read straight from the
    # broker carries no starting stop, so R was always unknown and every successful move sent "⚠️ … check your
    # platform". The test faked the re-read WITH a starting stop, which is why it stayed green.
    if now.target is None:
        msg = (f"⚠️ {p.symbol}: THE TAKE PROFIT IS GONE after moving it to 4R — the stop is {now.stop}. "
               f"Set a target on your platform now.")
    elif not fresh.same_price(now.target, new_tp, d) or not fresh.same_price(now.stop, cur.stop, d):
        msg = (f"⚠️ {p.symbol}: tried to move the target to 4R ({new_tp}) but the position reads target "
               f"{now.target}, stop {now.stop} — check your platform.")
    else:
        msg = (f"{p.symbol} {'BUY' if p.bullish else 'SELL'}: a momentum candle closed in the trade's direction "
               f"— the target is moved from {base:.0f}R to {run:.0f}R ({now.target}). Stop unchanged.")
        delivery_ledger.mark_delivered(key)
        log.info(f"[tp_extend] {p.symbol} #{p.position_id}: target moved to {run:.0f}R at {now.target}")
        from storage import signal_repo
        signal_repo.set_target_for_stub(str(p.label).split("-")[-1], now.target)
    from notifications import safe_notify as notify
    notify.tell_soon(send, msg)
    return delivery_ledger.is_delivered(key)
