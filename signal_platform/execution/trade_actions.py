"""
CARRIES OUT HIS ❌ CANCEL TRADE / ✏️ ADJUST SL PRESS (18 Nov 2026), and tells him what happened, under his message.

His ask: *"add a button for cancelling a trade and adjusting SL by entering the price level where SL should reach"*;
*"Make the cancels interactive or communicative so that I can know what is going on when I press it"*. Cancel is ONE
button (his answer C): a waiting order is cancelled; a filled trade is closed at market.

The website server records the press and his typed price (`trade_actions` row → `pending`); this runs on the position
tracker's clock, CLAIMS each row once (`storage.trade_actions.claim`), acts at the broker, READS BACK what the broker
now holds, and replies. Every path ends in a message — done, refused with the reason, or failed with the reason.

TWO RULES THAT COST MONEY IF FORGOTTEN, both from the live stop-moving code:
  * a new stop on the WRONG SIDE of the market closes the trade the instant it is set (21 Aug) — refused;
  * an amend that omits the target DELETES it — the current target is always re-passed, then checked.
Unlike the automatic ladder, HIS stop may be moved either way (wider or tighter): it is his decision.
A waiting order's stop he moves is NOT written to the platform's record, on purpose — that difference is how the
canceller knows the order is his (`storage/autotrade_changes.record_amended`).
"""
import asyncio
import logging

log = logging.getLogger(__name__)


async def check() -> None:
    """One pass: act on every press the website server recorded. Never raises."""
    try:
        from storage import trade_actions as repo
        loop = asyncio.get_running_loop()
        for row in await loop.run_in_executor(None, repo.pending):
            if await loop.run_in_executor(None, repo.claim, row["id"]):
                await _act(row)
    except Exception as exc:
        log.error(f"[trade_actions] {type(exc).__name__}: {exc}", exc_info=True)


async def _act(row: dict) -> None:
    from storage import trade_actions as repo
    try:
        ok, text = await (_cancel(row) if row["kind"] == repo.CANCEL else _move_sl(row))
    except Exception as exc:
        log.error(f"[trade_actions] {row['symbol']}: {type(exc).__name__}: {exc}", exc_info=True)
        ok, text = False, f"⚠️ <b>FAILED</b> — {type(exc).__name__}. Nothing was confirmed — check your platform."
    repo.settle(row["id"], ok, text)
    log.info(f"[trade_actions] {row['symbol']} {row['kind']}: {text}")
    await _reply(row, text)


async def _account():
    """(account, None) or (None, why)."""
    from config.settings import settings
    from execution.account import load_account
    acct = await load_account()
    if acct is None:
        return None, "⚠️ <b>NOT DONE</b> — no usable trading account."
    if settings.auto_breakeven_demo_only and (acct.account_type or "").lower() != "demo":
        return None, f"⚠️ <b>NOT DONE</b> — the account is '{acct.account_type}', not demo."
    return acct, None


async def _locate(row: dict):
    """('position', Position) | ('order', order_id) | (None, why) — what this message's trade is NOW."""
    from data import ctrader_positions as cp
    positions = await cp.open_positions()                   # also refreshes the waiting-order read
    if positions is None:
        return None, "⚠️ <b>NOT DONE</b> — the broker could not be read, so nothing was changed. Try again."
    if row.get("position_id"):
        pos = next((p for p in positions if str(p.position_id) == str(row["position_id"])), None)
        return ("position", pos) if pos else (None, "ℹ️ This trade is already closed — nothing to do.")
    oid = row.get("order_id")
    if oid and int(oid) in (cp.last_resting_order_ids() or set()):
        return "order", oid
    from execution.liveness import fill_matches
    from storage import autotrade_repo
    intent = autotrade_repo.intent_for(oid) if oid else None
    if intent:
        pos = next((p for p in positions if fill_matches(intent["symbol"], intent["side"], intent.get("volume"),
                                                          intent["placed_at"], p)), None)
        if pos:
            return "position", pos
    return None, "ℹ️ This order is no longer waiting and no open trade came from it — nothing to do."


async def _cancel(row: dict) -> tuple[bool, str]:
    acct, why = await _account()
    if acct is None:
        return False, why
    what, it = await _locate(row)
    if what is None:
        return it.startswith("ℹ️"), it
    from execution.broker import StopOrderClient
    client = StopOrderClient(acct.creds, acct.account_type)
    if what == "order":
        res = await client.cancel(int(it))
        if not res.ok:
            return False, f"⚠️ <b>NOT CANCELLED</b> — the broker refused: {res.error}"
        from execution.intents import _intent
        from storage import autotrade_repo
        intent = autotrade_repo.intent_for(str(it)) or {}
        autotrade_repo.record_closed(str(it), "cancelled")
        _intent.pop(str(it), None)
        # LOGGED LIKE EVERY OTHER WITHDRAWAL (20 Nov 2026). This was the one path that wrote nothing, so the outcome
        # message could not say when or why his order went (`notifications/order_memory`).
        from execution import decision_log
        await decision_log.cancelled(intent.get("signal_id"), row["symbol"], it, "you cancelled it")
        return True, f"✅ <b>CANCELLED</b> — the waiting {row['symbol']} order {it} is withdrawn."
    res = await client.close_part(it.position_id, int(it.volume))
    if not res.ok:
        return False, f"⚠️ <b>NOT CLOSED</b> — the broker refused: {res.error}"
    from data import ctrader_positions as cp
    after = await cp.open_positions()
    if after is not None and any(p.position_id == it.position_id for p in after):
        return False, "⚠️ The close was sent but the trade still shows open — check your platform."
    return True, f"✅ <b>CLOSED AT MARKET</b> — the {row['symbol']} {'BUY' if it.bullish else 'SELL'} trade is closed."


async def _quote(symbol: str):
    try:
        from data import fix_quotes
        q = fix_quotes.live_quote(symbol)
        if q:
            return q
        from data import ctrader_spread
        return await ctrader_spread.quote_for(symbol)
    except Exception:
        return None


async def _move_sl(row: dict) -> tuple[bool, str]:
    price = row.get("price")
    if price is None:
        return False, "⚠️ <b>NOT DONE</b> — no stop price was received. Press ✏️ Adjust SL again."
    acct, why = await _account()
    if acct is None:
        return False, why
    what, it = await _locate(row)
    if what is None:
        return it.startswith("ℹ️"), it
    from data import ctrader_positions as cp
    from execution.broker import StopOrderClient
    from shared.pip import price_digits
    sym = row["symbol"]
    new = round(float(price), price_digits(sym))
    client = StopOrderClient(acct.creds, acct.account_type)
    if what == "order":
        lv, meta = cp.last_resting_levels(it) or {}, cp.last_resting_meta(it) or {}
        entry, bull = lv.get("entry"), row["bullish"]
        if entry is None or not meta.get("volume"):
            return False, "⚠️ <b>NOT DONE</b> — the waiting order's details could not be read. Try again."
        if (new >= entry) if bull else (new <= entry):
            return False, (f"⛔ <b>REFUSED</b> — a {'BUY' if bull else 'SELL'} stop must be {'below' if bull else 'above'} "
                           f"its entry ({entry}). You sent {new}.")
        res = await client.amend_order(int(it), sym, int(meta["volume"]), entry, new, meta.get("tp"),
                                       meta.get("expiry_ms"))
        if not res.ok:
            return False, f"⚠️ <b>NOT MOVED</b> — the broker refused: {res.error}"
        await cp.open_positions()
        now = (cp.last_resting_levels(it) or {}).get("sl")
        if now is None or abs(now - new) > 10 ** -price_digits(sym):
            return False, f"⚠️ The change was sent but the order's stop reads {now} — check your platform."
        return True, f"✅ <b>STOP MOVED</b> — the waiting {sym} order's stop is now {now} (was {lv.get('sl')})."
    pos = it
    q = await _quote(sym)
    if not q:
        return False, "⚠️ <b>NOT MOVED</b> — no live price to check the new stop against. Try again."
    fire = q[0] if pos.bullish else q[1]                    # a BUY's stop fires on the bid, a SELL's on the ask
    if (new >= fire) if pos.bullish else (new <= fire):
        return False, (f"⛔ <b>REFUSED</b> — {new} is on the wrong side of the market ({fire}): it would close "
                       f"the trade at once. A {'BUY' if pos.bullish else 'SELL'} stop must be "
                       f"{'below' if pos.bullish else 'above'} the price.")
    old_stop, old_target = pos.stop, pos.target           # noted BEFORE the amend, compared after it
    res = await client.amend_sltp(pos.position_id, sym, new, old_target)   # the target RE-PASSED, always
    if not res.ok:
        return False, f"⚠️ <b>NOT MOVED</b> — the broker refused: {res.error}"
    after = await cp.open_positions()
    now = next((p for p in (after or []) if p.position_id == pos.position_id), None)
    if now is None:
        return False, "⚠️ The change was sent but the trade could not be re-read — check your platform."
    if old_target and not now.target:
        return False, f"⚠️ THE TAKE PROFIT IS GONE — re-set it on your platform now (it was {old_target})."
    return True, (f"✅ <b>STOP MOVED</b> — {sym} {'BUY' if pos.bullish else 'SELL'} stop is now {now.stop} "
                  f"(was {old_stop}); target {now.target} kept.")


async def _reply(row: dict, text: str) -> None:
    try:
        from config.settings import settings
        from notifications.dispatcher import _get_bot
        bot, chat = _get_bot(), row.get("chat_id") or settings.watchdog_chat_id
        if bot and chat:
            await bot.send_message(chat_id=chat, text=text, parse_mode="HTML",
                                   reply_to_message_id=row.get("message_id"))
    except Exception as exc:
        log.warning(f"[trade_actions] could not reply: {type(exc).__name__}: {exc}")
