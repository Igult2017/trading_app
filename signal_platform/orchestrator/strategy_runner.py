"""
Per-strategy execution — resolves deps, builds context, runs one strategy
against one instrument, applies all filters, and emits confirmed signals.

Called concurrently by scanner._scan_instrument for every (strategy, instrument)
pair. Strategies never import utilities or call APIs directly.
"""

import asyncio
import logging
import traceback
from datetime import datetime
from functools import partial

from core import event_bus
from core.types import Session, Trend
from core.dependency_resolver import resolve
from core.strategy_context_builder import build as build_context
from data.candle_fetcher import fetch_candles
from news import news_filter
from shared import trend_detector
from shared.mtf_utils import closed_only, to_minutes
from storage import observability_repo as obs
from storage import signal_repo
from validation import signal_validator
from risk import spread_filter, volatility_filter, sl_validator
from charting import signal_card

log = logging.getLogger(__name__)


def _chart_candles(signal, candle_view: dict, fallback: list) -> list:
    """The candles the CARD should draw: the signal's OWN primary timeframe.

    It used to draw `pri_candles`, the strategy's HIGHEST timeframe. For BX that is H4 and also its
    signal timeframe, so its cards were right. For VIX.1 the highest is H4 while every VIX.1 signal
    is about an H1 momentum candle — so the card plotted a completely different timeframe from the
    one the signal describes, and its subtitle even said "H4" under an H1 setup.

    The user caught it against his own cTrader chart, 2026-08-03: *"the chart displays green where
    there is no green ... in sell signals for VIX there can never be green as the first momentum
    candle."* Quite right — an H4 bar can close bullish across an hour that closed bearish, so the
    card disagreed with his own platform bar for bar.
    """
    tf = getattr(signal.primary_timeframe, "value", signal.primary_timeframe) or ""
    for key, bars in candle_view.items():
        if bars and str(getattr(key, "value", key)) == str(tf):
            return bars
    return fallback


async def _attach_chart(signal, candles, symbol: str, candle_view: dict | None = None) -> None:
    """Render the signal's chart card and stamp `chart_path`, so the dispatcher sends a PHOTO.

    ONE CALL SITE PER EMIT, HERE — not in the strategies. Both strategies return from ~7 different
    places each; attaching there would be forgotten at the next `return` added, which is how this
    feature died the first time (`generate_chart` had no callers for months and nothing ever set
    `chart_path`, so every card silently went out as text).

    Strategy-agnostic: it passes `signal.chart_bands` straight through without knowing what the
    strategy means by them. Never raises — `render` returns None on any failure and the dispatcher
    falls back to text.
    """
    # Draw the SIGNAL's timeframe, not the strategy's highest — see `_chart_candles`.
    bars = _chart_candles(signal, candle_view or {}, candles)
    if not bars:
        return
    digits = 3 if symbol.upper().endswith("JPY") else 5
    tf = getattr(bars[-1], "timeframe", "") or ""
    # THE ORDER TYPE READS THE RAW LAST BAR ON PURPOSE. It answers "where is price RIGHT NOW relative
    # to the entry", which is a trigger, not a level — the forming bar's close IS the current price
    # and is exactly what should decide between a stop and a market order.
    _set_order_type(signal, bars[-1].close, digits)
    # THE CARD DOES NOT DRAW THE UNFINISHED BAR. The feed hands back the bar currently forming as its
    # newest, so a card sent seconds after an H1 close drew the momentum candle SECOND from the right
    # with a fresh near-zero-range stub beside it. To a reader that stub is a whole candle that has
    # already come and gone, which makes an alert that arrived 14 seconds after the close look a full
    # candle late — the exact impression that sent us hunting a lateness bug that was not there.
    #
    # UNLESS THE SIGNAL IS ABOUT THAT BAR. A pre-close warning is a statement about the candle still
    # forming, and it says so by marking it (`chart_marks`); dropping it would leave that card showing
    # the wrong candle entirely. So the rule is: the unfinished bar is drawn only when the producer
    # has named it. `or bars` is the floor — a feed whose bars all read as unclosed (a clock skew, a
    # replay) must still produce a picture rather than silently losing the chart.
    marked = {t for t, _ in (signal.chart_marks or [])}
    drawn = closed_only(bars)
    drawn = (drawn + [c for c in bars[len(drawn):] if c.time in marked]) or bars
    signal.chart_path = await signal_card.render_async(
        signal, drawn, digits, list(signal.chart_bands or []), subtitle=tf,
        marks=list(signal.chart_marks or []))


def _set_order_type(signal, price: float, digits: int) -> None:
    """Name the order the trader has to place, from the entry against LIVE price.

    The user asked the card to say "whether it is buy stop, sell stop or market buy or sell". That
    is not a property of the strategy, it is a property of where the entry sits RIGHT NOW relative
    to price — the same setup is a stop order a minute before it fills and a market order after. So
    it is derived here, at card time, from the freshest close, unless the strategy has already
    stated it.

    Only for a READY entry. A `building` heads-up has no entry to place, and printing an order type
    on one would invite exactly the premature entry the two-stage split exists to prevent.
    """
    if signal.order_type or signal.stage != "ready" or not signal.entry_price or not price:
        return
    buy = str(getattr(signal.direction, "value", signal.direction)).lower() == "buy"
    # "At market" needs a tolerance: an exact float match never happens. Half a pip is inside the
    # spread on every pair traded here, so anything closer is not worth a pending order.
    tol = (0.01 if digits <= 3 else 0.0001) * 0.5
    diff = signal.entry_price - price
    if abs(diff) <= tol:
        signal.order_type = "MARKET BUY" if buy else "MARKET SELL"
    elif buy:
        signal.order_type = "BUY STOP" if diff > 0 else "BUY LIMIT"
    else:
        signal.order_type = "SELL STOP" if diff < 0 else "SELL LIMIT"


async def _stage(loop, stage: str, strategy_id: str, symbol: str,
                 signal_id: str | None = None, detail: str = "") -> None:
    """Append one row to the restart-proof audit trail, off the event loop.

    Every exit from the delivery path gets one of these. The point is that a signal which never
    arrives can be traced to the exact stage that dropped it, WITHOUT needing the container's stdout
    — which a restart destroys. `obs.record` never raises, so this cannot break a dispatch.
    """
    await loop.run_in_executor(None, lambda: obs.record(stage, strategy_id, symbol,
                                                        signal_id, detail))


async def run_strategy(
    strategy,
    instrument: str,
    news_context,
    current_sessions: list,
    tick_now: datetime,
) -> None:
    # Pre-filter 1: instrument whitelist
    if strategy.allowed_instruments is not None:
        if instrument not in strategy.allowed_instruments:
            log.debug(f"[runner] {strategy.id}: {instrument} not in allowed_instruments — skip")
            return

    # Pre-filter 2: session
    if Session.ALL not in strategy.allowed_sessions:
        if not any(s in current_sessions for s in strategy.allowed_sessions):
            log.info(f"[runner] {strategy.id}/{instrument}: outside allowed session — skip")
            return

    # Resolve deps early — pure computation, gives correct HTF for all filters
    deps = resolve(strategy)

    if not deps.timeframes:
        log.warning(f"[runner] {strategy.id}/{instrument}: no timeframes resolved — skip")
        return  # no TFs resolved — strategy cannot run

    # Pre-filter 3: trend — only fetches HTF; instant cache hit if scanner ran recently
    if Trend.ANY not in strategy.allowed_trends:
        htf = max(deps.timeframes, key=to_minutes)
        htf_candles = await fetch_candles(instrument, htf)
        if not htf_candles:
            log.warning(f"[runner] {strategy.id}/{instrument}: no {htf} candles for trend check — skip")
            return
        current_trend = trend_detector.detect(htf_candles)
        if current_trend not in strategy.allowed_trends:
            log.info(f"[runner] {strategy.id}/{instrument}: trend={current_trend.value} not in allowed — skip")
            return

    # Pre-filter 4: news
    if not news_filter.check(strategy, news_context, instrument, now=tick_now):
        log.info(f"[runner] {strategy.id}/{instrument}: blocked by news filter — skip")
        return

    # Fetch all required TFs — use per-strategy bar counts when declared
    _counts = getattr(strategy, "candle_counts", {})
    fetched = await asyncio.gather(
        *[fetch_candles(instrument, tf, count=_counts.get(tf, 100))
          for tf in deps.timeframes],
        return_exceptions=True,
    )
    candle_view = {
        tf: (r if isinstance(r, list) else [])
        for tf, r in zip(deps.timeframes, fetched)
    }

    context = build_context(
        symbol=instrument, deps=deps, candle_view=candle_view,
        news_context=news_context, current_sessions=current_sessions,
    )
    if context is None:
        return

    try:
        result = await strategy.analyze(context)
    except Exception:
        log.error(f"[runner] {strategy.id} on {instrument}:\n{traceback.format_exc()}")
        return

    loop = asyncio.get_running_loop()
    if result.has_signals():
        # Record BEFORE validation: a signal the validator drops leaves no DB row and, until now,
        # no trace of any kind. This is the row that proves the strategy did its job.
        for s in result.signals:
            await _stage(loop, obs.STAGE_BUILT, s.strategy_id or strategy.id, instrument,
                         detail=f"{s.direction.value} entry={s.entry_price} sl={s.stop_loss}")

    valid_signals = signal_validator.validate(result, instrument)
    if not valid_signals:
        # Say WHICH of the two happened. They are completely different failures and the old wording
        # ("no valid signal (rr/confidence/dedup filter)") covered both, so a strategy emitting
        # nothing looked identical to the validator dropping something.
        why = ("the strategy produced no signal this tick"
               if not result.has_signals()
               else f"the validator dropped all {len(result.signals)} (rr / confidence / dedup)")
        log.info(f"[runner] {strategy.id}/{instrument}: analyze() ran — {why}")
        if result.has_signals():
            await _stage(loop, obs.STAGE_DROPPED, strategy.id, instrument,
                         detail="validator dropped all (rr / confidence / dedup)")
        return

    htf         = max(deps.timeframes, key=to_minutes)
    pri_candles = candle_view.get(htf, [])

    for signal in valid_signals:
        # Preserve strategy-set strategy_id (e.g. _watch / _setup suffixes)
        if not signal.strategy_id:
            signal.strategy_id = strategy.id
        signal.strategy_name = strategy.name
        signal.symbol        = instrument

        # Setup alerts: Telegram AND a 'watching' row, so the Assets panel can show what is being
        # watched for entry. This used to `continue` straight past the save with the comment
        # "Telegram only — no DB save", which is why that panel had never displayed anything in its
        # life: heads-ups are the common case, confirmed entries are rare, so nothing was ever
        # written for it to read. Still no dedup registration — a heads-up must not reserve the
        # live keyspace that a real entry needs.
        if signal.alert_only:
            # A FORECAST IS NOT A WATCHED SETUP. See `Signal.persist_watch`: the pre-close warning is
            # about a bar that has not closed, so it must neither post a setup to the Assets board nor
            # take the single watching row the genuine heads-up needs five minutes later. It still
            # gets its chart and its Telegram message — everything below this block.
            if signal.persist_watch:
                try:
                    # `ref_price` = the price being watched. A stage-1 heads-up has no entry, and
                    # `trading_signals.entry_price` is NOT NULL, so without this the row never saved
                    # and the setup never appeared on the Assets board.
                    _ref = pri_candles[-1].close if pri_candles else None
                    watch_id = await loop.run_in_executor(
                        None, partial(signal_repo.save, signal, signal_repo.STATUS_WATCHING, _ref))
                    if watch_id:
                        signal.db_id = watch_id
                    else:
                        # Row already there (the partial unique index rejected a second one). The
                        # setup is STILL being watched, so stamp it — `drop_abandoned` reads
                        # updated_at to decide what has gone stale, and without this it would freeze
                        # at first sighting and drop a live setup 24h later.
                        await loop.run_in_executor(
                            None, partial(signal_repo.touch_watch, signal.strategy_id,
                                          signal.symbol, signal.direction.value))
                except Exception as exc:
                    # A heads-up is a courtesy, not a trade. If the row cannot be written the Telegram
                    # alert must still go out, so this never raises past here.
                    log.error(f"[runner] {instrument} watch-row save failed ({exc}) — alerting anyway")
            await _attach_chart(signal, pri_candles, instrument, candle_view)
            await event_bus.emit(event_bus.SIGNAL_ALERT, signal)
            log.info(
                f"[runner] SETUP ALERT — {instrument} "
                f"{signal.direction.value.upper()} strategy={signal.strategy_id}"
            )
            continue

        await _stage(loop, obs.STAGE_VALIDATED, signal.strategy_id, instrument,
                     detail=f"conf={signal.confidence:.0%} rr={signal.risk_reward}")

        # Risk filters — only run when strategy opted in. Each rejection is recorded with its own
        # reason: "the signal vanished" and "the spread filter refused it" are different facts, and
        # a silent `continue` made them indistinguishable after the fact.
        async def _refuse(reason: str) -> None:
            signal_validator.release(signal.symbol, signal.direction.value, signal.strategy_id)
            log.info(f"[runner] {instrument} {signal.strategy_id} refused — {reason}")
            await _stage(loop, obs.STAGE_DROPPED, signal.strategy_id, instrument, detail=reason)

        if strategy.requires_volatility:
            if not pri_candles:
                await _refuse("no primary-timeframe candles for the risk filters")
                continue
            if not volatility_filter.check(signal, pri_candles):
                await _refuse("volatility filter")
                continue
            if not sl_validator.check(signal, pri_candles):
                await _refuse("SL too tight vs ATR")
                continue
        if strategy.requires_spread and context.spread is not None:
            if not spread_filter.check(signal, context.spread):
                await _refuse(f"spread filter (spread={context.spread})")
                continue

        # Release the dedup reservation on a hard save failure — else this
        # symbol+direction stays locked for the process lifetime with nothing saved.
        try:
            signal_id = await loop.run_in_executor(None, signal_repo.save, signal)
        except Exception as exc:
            log.error(f"[runner] {instrument} save failed ({exc}) — releasing dedup reservation")
            signal_validator.release(signal.symbol, signal.direction.value, signal.strategy_id)
            await _stage(loop, obs.STAGE_DROPPED, signal.strategy_id, instrument,
                         detail=f"save failed: {type(exc).__name__}: {exc}")
            continue
        if not signal_id:
            # `signal_repo.save` returns "" when the insert hits an IntegrityError — which is now a
            # REACHABLE path: the unique partial index on (strategy, symbol, type) WHERE
            # status='active' rejects a second live signal for the same key. Nothing was saved, so
            # nothing may be dispatched. Before this check the runner ignored the return value and
            # went on to emit SIGNAL_CONFIRMED for a row that does not exist — a card with no
            # signal behind it, which the monitor could never close.
            log.warning(f"[runner] {instrument} {signal.strategy_id} NOT saved (duplicate active "
                        f"signal for this strategy+symbol+direction) — not dispatching")
            signal_validator.release(signal.symbol, signal.direction.value, signal.strategy_id)
            await _stage(loop, obs.STAGE_DROPPED, signal.strategy_id, instrument,
                         detail="duplicate active signal — rejected by the DB uniqueness constraint")
            continue
        signal.db_id = signal_id            # lets the notifier close the audit chain on this row

        # WATCHING -> IN PROGRESS. The heads-up row for this setup has done its job; remove it so
        # the board shows the setup once, as a live trade, rather than twice in two states.
        try:
            await loop.run_in_executor(
                None, partial(signal_repo.drop_watch, signal.strategy_id,
                              signal.symbol, signal.direction.value))
        except Exception as exc:
            # Cosmetic only — a duplicate card on the board is not worth losing a confirmed signal.
            log.warning(f"[runner] {instrument} could not drop the watch row ({exc})")
        await _stage(loop, obs.STAGE_SAVED, signal.strategy_id, instrument, signal_id=signal_id)
        signal_validator.register_confirmed(signal)
        # DISPATCHED is stamped before the emit and DELIVERED by the notifier after a confirmed send.
        # A row with `dispatched` and no `delivered` is precisely the 27 Jul failure — saved, handed
        # over, never sent — and it is now a one-line query instead of an unanswerable question.
        await _stage(loop, obs.STAGE_DISPATCHED, signal.strategy_id, instrument, signal_id=signal_id)
        await _attach_chart(signal, pri_candles, instrument, candle_view)
        await event_bus.emit(event_bus.SIGNAL_CONFIRMED, signal)
        log.info(
            f"[runner] CONFIRMED — {instrument} "
            f"{signal.direction.value.upper()} "
            f"conf={signal.confidence:.0%} strategy={strategy.id}"
        )
