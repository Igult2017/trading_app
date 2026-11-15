"""
Turn a confirmed signal into a real pending stop order — and then report how the real world differed.

THE POINT IS THE SECOND HALF. Placing the order is plumbing; the deliverable is `fill_report`, which
puts the MODELLED entry next to the ACTUAL fill so entry quality is measured instead of argued
about. Every backtest figure this platform has produced assumes a fill exactly at the stop price and
charges no spread. Neither is true, and until an order is actually resting at a broker there is no
way to find out by how much.

Everything is refused by default: `guards.check` runs first and its verdict is final.

LENGTH: this file may run to 500 lines (his ruling, 16 Nov 2026: *"You can make it 500 if necessary"*),
not the usual 200. What is here is one function, `place_for_signal`, and the reasons behind each step;
splitting it would change the order path for no gain. `docs/OPEN.md` D73.
"""
import logging
from datetime import datetime, timedelta, timezone

from config.settings import settings
from execution import decision_log, guards
from execution.sizing import plan_size
from execution.placer_messages import refusal_message, rejection_message  # noqa: F401 — re-used here
from storage import autotrade_repo

log = logging.getLogger(__name__)

from execution.intents import _intent, placement_message   # what each order was MEANT to be


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


async def _usd_jpy_for(symbol: str) -> float | None:
    """The live USD/JPY price, but ONLY when the symbol being sized needs it.

    A yen-quoted pair prices a pip in yen (Y1,000 a lot), so turning that into the account's dollars
    needs this rate. The three dollar-quoted symbols need nothing, and this returns None for them
    WITHOUT asking anything — so a silent feed can never hold up a EUR/USD order.

    THE RATE IS ALREADY ON THE WIRE: `data/fix_wire.SYMBOL_IDS` streams "USD/JPY" for the journal's
    price band, so the FIX book usually has it with no broker request at all. The Open API is the
    fallback for when FIX is quiet, which is the division of labour the platform already follows.

    Never raises. None means "unpriceable", and `plan_size` turns that into 0 lots, which the guard
    below already refuses — the one thing that must not happen is falling back to a dollar default.
    """
    from execution.pip_value import needs_rate
    if not needs_rate(symbol):
        return None
    try:
        from data import fix_quotes
        q = fix_quotes.live_quote("USD/JPY")
        if q and q[0] and q[1] and q[1] > q[0]:
            return (q[0] + q[1]) / 2.0
    except Exception as exc:
        log.warning(f"[execution] FIX had no USD/JPY ({type(exc).__name__}: {exc}) — asking the broker")
    try:
        from data import ctrader_spread
        q = await ctrader_spread.quote_for("USD/JPY")
        if q and q[0] and q[1] and q[1] > q[0]:
            return (q[0] + q[1]) / 2.0
    except Exception as exc:
        log.warning(f"[execution] could not read USD/JPY to price a yen pip: "
                    f"{type(exc).__name__}: {exc}")
    return None


async def _live_book():
    """(open positions, resting order ids) from the broker, or None when that cannot be read.

    From the shared position cache: no extra broker request while it is fresh. None is what the
    duplicate guard treats as "cannot confirm", and it then refuses exactly as it always did.
    """
    try:
        from monitor import position_book
        return await position_book.snapshot()
    except Exception as exc:
        log.warning(f"[execution] could not read what is live at the broker: "
                    f"{type(exc).__name__}: {exc}")
        return None


async def place_for_signal(signal, creds: dict, account_type: str, equity: float,
                           notify=None, risk_base: float = 0.0) -> str | None:
    """Place the stop order for a signal. Returns the broker order id, or None if not placed.

    Never raises: a fault in placement must not take down the scan that produced the signal. A
    refusal and a failure are both logged, and the caller carries on.
    """
    try:
        symbol    = signal.symbol
        side      = "BUY" if signal.direction.value == "buy" else "SELL"
        entry, sl, tp = signal.entry_price, signal.stop_loss, signal.take_profit
        if not entry or not sl:
            await decision_log.failed(signal, "the signal carried no entry or no stop, so there was "
                                              "nothing to place")
            return None

        # ── A CANDLE ADMITTED ONLY BY THE 24-HOUR MEMORY IS NOT TRADED (2026-11-08) ─────────────
        #
        # HIS RULE: *"Autotrader should only take trades from candles that qualify momentum candle
        # size or misses it by the margine of error but not the previous momentum candles before the
        # momentum candle size changes."*
        #
        # The size test passes a candle three ways: big on its own (2.5x its 100-bar median body),
        # within his 0.2 margin (2.3x), or — the one he is withdrawing here — by clearing the LOWEST
        # requirement remembered from a candle that qualified on its own in the previous 24 clock
        # hours. A big move raises its own yardstick (his 10-11 Sep GBP/USD move took the
        # requirement 9.2 -> 11.6 pips), and that third route lets a candle too small for the NEW
        # bar through on the OLD one.
        #
        # ⚠ THE SIGNAL IS NOT SUPPRESSED, and that is his scoping, not an accident: *"This only
        # affects trades taken by autotrade. Everything else including DM remains the same."* The
        # card has already gone out by the time this runs (`dispatcher` places only after sending),
        # `qualifies_for_trade` is unchanged, and so are the pre-close heads-up, spacing and the
        # momentum announcement. Only the ORDER is declined.
        #
        # Recorded through `decision_log.refused` so it appears on the Autotrade screen beside every
        # other refusal — a trade not taken has to be as visible as one that was.
        if getattr(signal, "size_from_memory", False):
            why = ("its momentum candle was too small for the size required now and only qualified "
                   "on the 24-hour memory of an earlier, smaller requirement")
            log.info(f"[execution] NOT placing {symbol} {side} — {why}")
            await decision_log.refused(signal, why)
            if notify:
                await _tell(notify, refusal_message(
                    symbol, side, signal.strategy_name or signal.strategy_id, why))
            return None

        # SIZED OFF THE STARTING BALANCE, NOT THE LIVE ONE. His instruction, 2026-09-03: *"static
        # 2% of the starting account balance."* `risk_base` is that number, decided once in
        # `account._risk_base`; 0.0 means it could not be established, and `plan_size` then returns
        # 0 lots, which the guard below refuses. It is deliberately NOT allowed to fall back to
        # `equity` — that would risk the right percentage of the wrong number and look identical in
        # every log.
        lots, volume, stop_pips = plan_size(
            equity=risk_base, entry=entry, stop=sl, symbol=symbol,
            risk_pct=settings.autotrade_risk_pct,
            fixed_lots=settings.autotrade_fixed_lots,
            max_lots=settings.autotrade_max_lots,
            # Only fetched for a yen-quoted pair; None for the dollar-quoted three, which need no
            # conversion and so cannot be held up by a quiet feed.
            usd_jpy=await _usd_jpy_for(symbol))

        if not risk_base and not settings.autotrade_fixed_lots:
            log.error(f"[execution] NOT placing {symbol} {side} — the account's STARTING balance is "
                      f"unknown, so 2% of it cannot be sized. Set AUTOTRADE_RISK_BASE or give the "
                      f"account's session a starting balance.")
            await decision_log.refused(signal, "the account's STARTING balance is unknown, so the "
                                               "risk cannot be sized")
            if notify:
                await _tell(notify, refusal_message(
                    symbol, side, signal.strategy_name or signal.strategy_id,
                    "the account's STARTING balance is unknown, so the risk cannot be sized. "
                    "Nothing was placed rather than risking the wrong amount."))
            return None

        # WHAT THE BROKER HAS RIGHT NOW, so the duplicate rule can tell a live order from a withdrawn
        # one (guards rule 7, fixed 2026-09-15).
        book = await _live_book()
        why = guards.check(symbol, side, signal.strategy_id, account_type, equity, lots, book=book)
        if why:
            log.info(f"[execution] NOT placing {symbol} {side} — {why}")
            await decision_log.refused(signal, why, lots)
            # SAY IT, don't only log it. A container log dies at the next deploy, so "a signal fired
            # and no order appeared" was previously unanswerable after the fact. One message per
            # signal, never per scan — `guards.check` runs once, at dispatch.
            if notify:
                await _tell(notify, refusal_message(
                    symbol, side, signal.strategy_name or signal.strategy_id, why))
            return None

        # ONE TRADE AT A TIME, THE BEST ONE (his rule, 15 Nov 2026). Signals that arrive together
        # wait a few seconds and only the best is placed — `execution/best_signal`.
        from execution import best_signal
        why = await best_signal.take_turn(signal)
        if why:
            log.info(f"[execution] NOT placing {symbol} {side} — {why}")
            await decision_log.refused(signal, why, lots)
            if notify:
                await _tell(notify, refusal_message(
                    symbol, side, signal.strategy_name or signal.strategy_id, why))
            return None

        # THE BROKER'S OWN 24-HOUR CAP — the BACKSTOP, armed 2026-09-04.
        #
        # This line used to read `... if signal.expires_at else None`, and `expires_at` DEFAULTS TO
        # None (`core/types.py:211`) with nothing anywhere setting it — searched every strategy, the
        # runner, the validator and the save path. So `expiry_ms` was always None, `orders.py`'s
        # `if expiry_ms:` was always skipped, and **every order this platform has ever placed went to
        # the broker with no expiry at all.** One was found resting on his account 72 points away
        # from a market that had long since gone the other way.
        #
        # 24 HOURS IS THE PLATFORM'S OWN NUMBER, not a new one: `signal_repo.expire_stale(24)` is the
        # blanket cap on a signal's life and `vix1_watch._LOCK_TTL` already matches it. A signal that
        # has expired cannot be traded, so its order must not outlive it.
        #
        # THIS IS THE BACKSTOP, NOT THE MECHANISM. His instruction is that 24h is far too long to
        # wait — `execution.canceller` kills the order within 30 seconds of the setup dying. This
        # only covers the case where the platform is DOWN when that happens.
        expires_at = signal.expires_at or (datetime.now(timezone.utc) + timedelta(hours=24))
        expiry_ms = int(expires_at.timestamp() * 1000)

        from execution.broker import StopOrderClient  # noqa: local import keeps ctrader deps lazy
        # MARKED, SO HE CAN SEE IT IN PEPPERSTONE AND ACT ON IT — his ask, 2026-11-08: *"Im asking
        # seeing the trade visually in pepperstone when it is placed so that i can adjust SL
        # manually."* The label is what makes a bot order distinguishable from one of his at a
        # glance; the comment carries the plan, so the numbers he would need to judge it are on the
        # order itself rather than only in a DM he has to go and find.
        from execution.orders import order_label
        strategy = signal.strategy_name or signal.strategy_id or "bot"
        label = order_label(str(signal.strategy_id or strategy), getattr(signal, "id", None))
        comment = (f"{strategy} {side} {lots}L "
                   f"risk {settings.autotrade_risk_pct:g}% over {stop_pips:.1f}p")
        res = await StopOrderClient(creds, account_type).place_stop(
            symbol=symbol, side=side, volume=volume, lots=lots,
            stop_price=entry, sl=sl, tp=tp, expiry_ms=expiry_ms,
            label=label, comment=comment)

        if not res.ok:
            log.error(f"[execution] {symbol} {side} REJECTED — {res.error}")
            await decision_log.rejected(signal, res.error, lots, entry, sl, tp)
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

        guards.record(symbol, side, res.order_id, volume)
        if res.order_id:
            _intent[res.order_id] = dict(symbol=symbol, side=side, entry=entry, sl=sl, tp=tp,
                                         lots=lots, volume=volume, stop_pips=stop_pips,
                                         placed_at=datetime.now(timezone.utc),
                                         strategy=signal.strategy_name or signal.strategy_id,
                                         signal_id=getattr(signal, "db_id", None) or None,
                                         spread_used=float(getattr(signal, "spread_used", 0) or 0))
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
                signal_id=getattr(signal, "db_id", None) or None,
                spread_used=float(getattr(signal, "spread_used", 0) or 0))
        log.info(f"[execution] PLACED {symbol} {side} {lots} lots (vol {volume}) stop {entry} "
                 f"order {res.order_id}")
        await decision_log.placed(signal, res.order_id, lots, entry, sl, tp)
        if notify and res.order_id:
            await _tell(notify, placement_message(res.order_id))
        return res.order_id
    except Exception as exc:                       # never let placement break the scan
        log.error(f"[execution] placement failed for {getattr(signal, 'symbol', '?')}: {exc}")
        await decision_log.failed(signal, f"placement crashed: {type(exc).__name__}: {exc}")
        return None
