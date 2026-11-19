"""
HIS /level PRICE WATCHES (19 Nov 2026) — watch his levels on the broker's LIVE price, tell him (HIS DM ONLY) when one is
reached, and place the stop order he then types. His ask: *"…it watches. When the price hits those levels, it sends me a
notification with an option to enter entry values like SL and entry level using stop order."* The conversation is
`server/services/levelWatchPress.ts`; this is the watching and the placing. They meet in `level_watches`.

WHAT "REACHED" MEANS (plain words). When a watch is armed, the live bid is either ABOVE the level/range, BELOW it, or
INSIDE it. Above → reached when the bid comes down to the level (or the range's top); below → when it comes up to the
level (or the range's bottom); inside → he is told at once. Every tick between two passes is kept as that market's
lowest and highest bid, so a spike between passes is never missed. A watch fires ONCE.

HIS ORDER: the normal placement as a MANUAL, CONFIRMED trade (every safety check, the usual sizing, the demo account,
whatever the trading switch says — as his Tradeable marks), saved as a "Manual level" signal so the monitor reports it.
An entry already through the market is refused (it would fill at once). Every path ends in a message to him.
"""
import asyncio
import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)

STRATEGY_ID, STRATEGY_NAME = "manual_level", "Manual level"
_PASS_S = 1.0                               # one pass a second; between passes every tick is kept (lowest/highest)
_EXT: dict[str, list[float]] = {}          # symbol → [lowest bid, highest bid, last bid] since the last pass


def on_tick(symbol: str, bid: float, epoch: float | None = None) -> None:
    """Registered on the live price stream (`data/tick_listeners`). Cheap: three numbers per market."""
    if not symbol or bid is None:
        return
    e = _EXT.get(symbol)
    if e is None:
        _EXT[symbol] = [bid, bid, bid]
    else:
        e[0], e[1], e[2] = min(e[0], bid), max(e[1], bid), bid


def take_extremes() -> dict[str, list[float]]:
    """Every market's lowest / highest / last bid since the last pass — and start counting afresh."""
    out = dict(_EXT)
    _EXT.clear()
    return out


def side_of(price: float, low: float, high: float) -> str:
    return "above" if price > high else "below" if price < low else "inside"


def reached(side: str, low: float, high: float, lo: float, hi: float) -> bool:
    """Did the bid, ranging lo..hi since the last pass, reach the level from the side it was on?"""
    if side == "above":
        return lo <= high
    if side == "below":
        return hi >= low
    return True


def _fmt(symbol: str, v: float | None) -> str:
    from shared.pip import price_digits
    if v is None:
        return "—"
    return f"{v:.{price_digits(symbol)}f}"


def _level(w: dict) -> str:
    s = w["symbol"]
    return _fmt(s, w["low"]) if w["low"] == w["high"] else f"{_fmt(s, w['low'])}–{_fmt(s, w['high'])}"


def _buttons(wid: str, order: bool):
    from telegram import InlineKeyboardButton as B, InlineKeyboardMarkup as M
    stop = [B("❌ Stop watching", callback_data=f"lw:x:{wid}")]
    return M([stop]) if not order else M([[B("📈 Buy stop", callback_data=f"lw:b:{wid}"), B("📉 Sell stop", callback_data=f"lw:s:{wid}")], stop])


async def _say(w: dict, text: str, markup=None) -> bool:
    """HIS DM ONLY (his ruling, 19 Nov 2026) — the stored chat only if WATCHDOG_CHAT_ID is unset."""
    from config.settings import settings
    from notifications import dispatcher as D
    return await D._send_text(text, chat_id=settings.watchdog_chat_id or w.get("chat_id"), reply_markup=markup)


async def check() -> None:
    """One pass: hits first (on the ticks since the last pass), then arm new watches, then place typed orders."""
    try:
        from data import fix_quotes
        from storage import level_watches as repo
        loop = asyncio.get_running_loop()
        ext = take_extremes()
        now = datetime.now(timezone.utc)
        for w in await loop.run_in_executor(None, repo.with_status, repo.WATCHING):
            e = ext.get(w["symbol"])
            if e and reached(w["side"], w["low"], w["high"], e[0], e[1]) and \
                    await loop.run_in_executor(None, lambda: repo.move(w["id"], repo.WATCHING, repo.HIT,
                                                                       hit_price=e[2], hit_at=now)):
                log.info(f"[level_watch] {w['symbol']} {_level(w)} reached (bid {e[2]})")
                await _say(w, f"🔔 <b>{w['symbol']} reached your level {_level(w)}</b> — price now {_fmt(w['symbol'], e[2])}.\n"
                              f"Place a stop order?", _buttons(w["id"], order=True))
        for w in await loop.run_in_executor(None, repo.with_status, repo.NEW):
            q = fix_quotes.live_quote(w["symbol"])
            price = q[0] if q else (ext[w["symbol"]][2] if w["symbol"] in ext else None)
            if price is None:
                continue                                   # no live price yet — armed on a later pass
            side = side_of(price, w["low"], w["high"])
            if side == "inside":
                if await loop.run_in_executor(None, lambda: repo.move(w["id"], repo.NEW, repo.HIT, side=side,
                                                                      last_price=price, hit_price=price, hit_at=now)):
                    await _say(w, f"🔔 <b>{w['symbol']} is ALREADY at your level {_level(w)}</b> — price now "
                                  f"{_fmt(w['symbol'], price)}.\nPlace a stop order?", _buttons(w["id"], order=True))
            elif await loop.run_in_executor(None, lambda: repo.move(w["id"], repo.NEW, repo.WATCHING, side=side,
                                                                    last_price=price)):
                log.info(f"[level_watch] watching {w['symbol']} {_level(w)} (bid {price}, {side})")
                await _say(w, f"👀 <b>WATCHING</b> {w['symbol']} {_level(w)} — price now {_fmt(w['symbol'], price)}, "
                              f"{side} it. I will tell you when it is reached.", _buttons(w["id"], order=False))
        for w in await loop.run_in_executor(None, repo.with_status, repo.ORDER_PENDING):
            if await loop.run_in_executor(None, repo.move, w["id"], repo.ORDER_PENDING, repo.PLACING):
                await place(w)
    except Exception as exc:
        log.error(f"[level_watch] {type(exc).__name__}: {exc}", exc_info=True)


async def place(w: dict) -> None:
    """His typed order → the normal placement, MANUAL + CONFIRMED. Ends in `placed` or `refused`, with a message."""
    from storage import level_watches as repo
    loop = asyncio.get_running_loop()
    buy, sym = w["order_side"] == "buy", w["symbol"]
    side = "BUY" if buy else "SELL"

    async def refuse(why: str, sid: str | None = None) -> None:
        if sid:
            from core.types import SignalStatus
            from storage import signal_repo
            await loop.run_in_executor(None, signal_repo.update_status, sid, SignalStatus.EXPIRED)
        await loop.run_in_executor(None, lambda: repo.move(w["id"], repo.PLACING, repo.REFUSED, result=why))
        log.info(f"[level_watch] {sym} {side} STOP not placed — {why}")
        await _say(w, f"⚠️ <b>NOT PLACED</b> — {sym} {side} STOP: {why}\nPress 📈 / 📉 above to send it again.")

    try:
        from data import fix_quotes
        q = fix_quotes.live_quote(sym)
        if q is None:
            return await refuse("there is no live price for it right now, so the stop order could not be checked.")
        bid, ask = q
        if buy and w["entry"] <= ask:
            return await refuse(f"the entry {_fmt(sym, w['entry'])} is already at or below the market (ask "
                                f"{_fmt(sym, ask)}) — a buy stop there would fill at once.")
        if not buy and w["entry"] >= bid:
            return await refuse(f"the entry {_fmt(sym, w['entry'])} is already at or above the market (bid "
                                f"{_fmt(sym, bid)}) — a sell stop there would fill at once.")
        from core.types import Direction, Signal
        tp = w["tp"] or 0.0
        risk = abs(w["entry"] - w["sl"])
        sig = Signal(symbol=sym, direction=Direction.BUY if buy else Direction.SELL, strategy_id=STRATEGY_ID,
                     strategy_name=STRATEGY_NAME, entry_price=w["entry"], stop_loss=w["sl"], take_profit=tp,
                     risk_reward=round(abs(tp - w["entry"]) / risk, 2) if tp and risk else 0.0, confidence=1.0,
                     primary_timeframe="M1", spread_used=max(0.0, ask - bid),
                     technical_reasons=[f"Your /level {_level(w)} was reached", "Your entry, stop and target"],
                     market_context=f"Manual level — {side} STOP {sym}", manual=True, confirmed=True)
        from storage import signal_repo
        sid = await loop.run_in_executor(None, signal_repo.save, sig)
        if not sid:
            return await refuse(f"you already have an active Manual level {side} on {sym}.")
        sig.db_id = sid
        from execution.account import load_account
        acct = await load_account()
        if acct is None:
            return await refuse("no usable trading account.", sid)
        told: list[str] = []

        async def capture(text):                      # the placer's own refusal / rejection, kept as the reason
            told.append(text or "")
            return True
        from execution.placer import place_for_signal
        order_id = await place_for_signal(sig, acct.creds, acct.account_type, acct.equity, notify=capture,
                                          risk_base=acct.risk_base)
        if not order_id:
            return await refuse(told[-1] if told else "the broker did not take it — check the platform.", sid)
        await loop.run_in_executor(None, lambda: repo.move(w["id"], repo.PLACING, repo.PLACED, signal_id=sid,
                                                           result=f"order {order_id}"))
        log.info(f"[level_watch] {sym} {side} STOP placed, order {order_id}")
        if told:                                      # the placer's message, if its buttons could not be sent
            await _say(w, told[-1])
    except Exception as exc:
        log.error(f"[level_watch] {sym}: {type(exc).__name__}: {exc}", exc_info=True)
        await refuse(f"it could not be placed ({type(exc).__name__}) — check the platform before trying again.")


async def run_forever() -> None:
    """Started by `main.py` beside the live price watchers. Never stops: a failed pass is logged and the next runs."""
    log.info("[level_watch] running — his /level watches, checked every second on the live price")
    while True:
        await check()
        await asyncio.sleep(_PASS_S)


# Registered at IMPORT, before the live price stream is created: the stream picks its listeners up when it connects
# (`monitor/entry_watcher._ensure`), so a listener registered later would hear nothing until a reconnect.
from data import tick_listeners  # noqa: E402
tick_listeners.register(on_tick)
