"""
Watch open positions on a STREAMED price and move the stop the moment a rung is reached.

THE PROBLEM IT SOLVES. `position_tracker` runs every 30s and, until 2026-08-30, read the last CLOSED
M1 bar — so the price a stop move was decided on could be nearly two minutes old (60s of bar, 20s of
cache, 30s of poll). On a 3-pip stop that is the whole trade. This watches a pushed FIX price
instead and acts within a second.

IT ADDS NO TRADING LOGIC WHATSOEVER, and that is deliberate. Every decision and every guard stays
where it already lives and is already tested:

    execution.breakeven.move_stop_to   the ratchet, both legs, the re-read, demo-only, kill switch
    position_tracker._lines            the ladder and its thresholds, in his words
    Position.r_at / .breakeven()       the R maths, from HIS fill and HIS stop

This file only decides WHEN to ask, and on WHAT PRICE. If a rung's meaning ever needs changing, it
changes in those files and this one inherits it.

WHY THE PRICE COMES FROM FIX AND THE MOVE GOES OVER THE OPEN API. FIX pushes prices and spends none
of the Open API request budget the candle fetch uses, so watching costs the scanner nothing. But
cTrader's FIX cannot carry a stop loss or take profit, so the amend goes through
`execution.broker.StopOrderClient`, where all three prices travel in one message.

THE FAILURE THIS FILE EXISTS TO SURVIVE. A dead stream is indistinguishable from a quiet market —
prices simply stop arriving. A watcher that goes blind silently is worse than no watcher, because it
looks like it is working. So the stream's age is checked on EVERY pass, and going stale falls back
to the Open API quote and says so out loud.
"""
import asyncio
import logging

from config.settings import settings
from monitor import position_book
from notifications import safe_notify as notify

log = logging.getLogger(__name__)

# ⚠ "NO TICK" MEANS THE PRICE HAS NOT CHANGED — NOT THAT THE FEED HAS DIED.
#
# This was 3 seconds, and it was the wrong QUESTION rather than the wrong number. A tick is sent
# when the bid or ask moves; no tick means the quote still stands. Measured over 786 days of the
# broker's own saved minutes (the M1 bars carry cTrader's tick count):
#
#     EUR/USD pauses 3s or longer about 1,940 times a WEEKDAY - 34.6% of all minutes hold one,
#     and at 21:00 UTC it is one every 12 seconds. GBP/USD: 1,452 a weekday.
#
# So the ladder was announcing a dead feed thousands of times a day, on a feed that was working
# perfectly, and DMing him on every flip. His report: *"whenever it starts working, it keeps on
# going off ... it assumes FIX data has stopped when price stops or starts moving slowly."*
#
# No price-based threshold fixes that: to get under one false alarm a day needs 60-90s, and a stop
# that waits 90s to notice a dead feed is the exact risk the 3s was lowered to avoid on 6 Sep.
#
# THE SESSION IS WHAT IS ASKED NOW. FIX heartbeats keep arriving through the quietest market (we
# negotiate 30s at logon), so silence from the SESSION - not from the price - is what means dead.
# The streamed price is used however old it is, because while the session lives, unchanged IS
# current, and polling the broker would return the same number.
_SESSION_SILENT_S = 75.0
# A session can live while ONE symbol's subscription quietly dies. If OTHER symbols are ticking and
# this one has not for this long, that is suspect and worth a real quote; if nothing is ticking at
# all, the market is simply quiet and nothing is wrong. No threshold has to be guessed for the
# quiet case, which is the one that was crying wolf.
_SYMBOL_SUSPECT_S = 90.0
# How long to wait for a tick before going round anyway — a liveness check, NOT a polling cadence.
# Every real price arrives on the tick callback and wakes the loop immediately.
_QUIET_S = 2.0
_IDLE_S = 30.0            # how often we look for a position when there is none


class TradeWatcher:
    """One streaming watch over whatever is currently open. Started and stopped by the platform."""

    def __init__(self, send):
        self.send = send                       # async callable, the admin DM
        self._stream = None
        self._running = False
        self._degraded = False                 # True while falling back to the Open API quote
        # Set by `_on_tick` the instant a price lands; the loop waits on it instead of a timer.
        self._tick = asyncio.Event()

    async def run_forever(self) -> None:
        """Never raises. A watcher that can take the platform down is not a safety feature."""
        self._running = True
        while self._running:
            try:
                await self._cycle()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error(f"[watcher] {type(exc).__name__}: {exc}", exc_info=True)
                await asyncio.sleep(_IDLE_S)

    async def stop(self) -> None:
        self._running = False
        await self._drop_stream()

    # ── internals ──────────────────────────────────────────────────────────────

    async def _cycle(self) -> None:
        # FROM MEMORY, NOT FROM THE BROKER. This used to call `open_positions()` here — a full
        # reconcile request, with a 15-second timeout, under a shared lock — BEFORE it was allowed to
        # look at the price. So the loop whose whole job is speed could never run faster than the
        # broker answered, and it spent a request every half second re-asking a question whose answer
        # changes a few times a day. `position_book` asks on its own slow clock and hands it out from
        # memory; see the note at the top of that file.
        positions = await position_book.positions()
        # NONE AND [] MEAN DIFFERENT THINGS, and `ctrader_positions` says so explicitly: [] is "you
        # have no trades open", None is "I could not find out". Treating None as "nothing open" would
        # drop the stream and stop watching a position that may well exist — inventing a fact. Wait
        # and ask again instead. (Caught by the boot test, which hit exactly this on a failed read.)
        if positions is None:
            await self._drop_stream()
            await asyncio.sleep(_IDLE_S)
            return
        tradeable = [p for p in positions if p.stop is not None]
        if not tradeable:
            await self._drop_stream()
            await asyncio.sleep(_IDLE_S)
            return

        symbols = sorted({p.symbol for p in tradeable})
        if not await self._ensure_stream(symbols):
            # No stream. The tracker still covers this, so degrade rather than spin.
            await self._check_all(tradeable, streamed=False)
            await asyncio.sleep(_IDLE_S)
            return

        await self._check_all(tradeable, streamed=True)

        # WAIT FOR THE NEXT PRICE, NOT FOR A CLOCK.
        #
        # This was `sleep(0.5)`, which meant a rung could sit reached for half a second — on top of
        # the broker read above — before anything looked. His words, 2026-09-06: *"if it is not first
        # we can lose money in no time especially if we have good R that we need to lock."*
        #
        # THE TIMEOUT IS NOT A FALLBACK CADENCE, IT IS A LIVENESS CHECK. A market can genuinely go
        # quiet, and if no tick ever arrives this coroutine must still come round to notice the
        # stream has died and fall back — which is what `_price_for` does on the next pass.
        await self._wait_for_tick(timeout=_QUIET_S)

    async def _wait_for_tick(self, timeout: float) -> None:
        """Sleep until the next price arrives, or `timeout` passes — whichever comes first."""
        self._tick.clear()
        try:
            await asyncio.wait_for(self._tick.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass                              # a quiet market, not a broken one

    def _on_tick(self, symbol: str, bid: float, epoch: float) -> None:
        """Called by the price reader for EVERY tick.

        RUNS INSIDE THE SOCKET READER AND MUST NOT BLOCK. `QuoteBook.absorb` calls its sinks
        synchronously, one after another, in the task that is reading prices off the wire — so
        anything slow here stalls the price feed for the bar builder and every other consumer.
        It therefore does exactly one thing: wake the watcher. All the work happens in the loop.
        """
        self._tick.set()

    async def _ensure_stream(self, symbols: list[str]) -> bool:
        from data.fix_quotes import FixQuoteStream
        # THE FIX ACCOUNT ID, NOT `ctrader_account_id`. FIX knows this account by its cTrader login
        # (5296567); the Open API knows it by its ctidTraderAccountId (47535363). Sending the wrong
        # one is refused with RET_NO_SUCH_LOGIN, and it fails SILENTLY — the watcher just falls back
        # forever. Caught in live testing 2026-08-30.
        if not settings.ctrader_fix_password or not settings.ctrader_fix_account_id:
            return False
        if self._stream is not None and self._stream.connected:
            return True
        await self._drop_stream()
        self._stream = FixQuoteStream(str(settings.ctrader_fix_account_id),
                                      settings.ctrader_fix_password,
                                      host=settings.ctrader_fix_host,
                                      port=settings.ctrader_fix_quote_port)
        # WAKE THE LOOP ON EVERY TICK. Registered BEFORE connecting so the very first price counts —
        # the entry watcher does the same, for the same reason. `QuoteBook` keeps a LIST of sinks and
        # guards each one, so this cannot displace the bar builder or be killed by it.
        self._stream.on_bid_tick(self._on_tick)
        return await self._stream.connect(symbols)

    async def _drop_stream(self) -> None:
        if self._stream is not None:
            await self._stream.close()
            self._stream = None

    async def _price_for(self, p, streamed: bool) -> float | None:
        """The price this position's stop would trigger on: the BID for a buy, the ASK for a sell."""
        prices = await self._prices_for(p, streamed)
        return None if prices is None else prices[1]

    async def _prices_for(self, p, streamed: bool) -> tuple[float, float] | None:
        """(read, guard) — the CHART price that decides when a rung is reached, and the price THIS
        stop fires on (bid for a buy, ask for a sell). See `position_tracker._prices_now`.

        ⚠ THE STREAMED PRICE IS USED HOWEVER OLD IT IS, while the session is alive. A tick is only
        sent when the price MOVES, so an old quote on a live session is the current quote — polling
        the broker would return the same number, having cost a request and a wait.

        It falls back to a polled quote in the two cases that are really wrong: the SESSION has gone
        silent (no heartbeat, no anything), or this one symbol has stopped while others are still
        ticking, which is a dead subscription rather than a quiet market.
        """
        from monitor.position_tracker import _prices_now
        if streamed and self._stream is not None:
            dead_session = self._stream.session_silent(_SESSION_SILENT_S)
            # A DEAD SUBSCRIPTION, TOLD APART FROM A QUIET MARKET: this symbol has gone silent while
            # others are still arriving. If nothing is ticking anywhere, the market is quiet and
            # there is nothing to report.
            age = self._stream.age(p.symbol)
            others = self._stream.ticking_symbols(_SYMBOL_SUSPECT_S)
            mine_silent = age is None or age > _SYMBOL_SUSPECT_S
            dead_symbol = mine_silent and others > 0
            q = self._stream.quote(p.symbol)
            if q is not None and not dead_session and not dead_symbol:
                if self._degraded:
                    self._degraded = False
                    log.info("[watcher] the price feed is answering again")
                    notify.tell_soon(
                        self.send,
                        f"✅ The live price feed is flowing again for {p.symbol} — stop moves are "
                        f"back to acting on the streamed price.")
                return q[0], (q[0] if p.bullish else q[1])
            # ONE STATE FOR THE WHOLE FEED, NOT ONE TEST PER SYMBOL AGAINST A SHARED FLAG. That
            # combination made the flag flip both ways within a single pass whenever two pairs
            # differed — a warning and an all-clear every couple of seconds from one quiet pair.
            if not self._degraded:
                self._degraded = True
                if dead_session:
                    sage = self._stream.session_age()
                    # EVERY PAIR IS AFFECTED, and the message says so rather than naming one and
                    # implying the rest are fine — but it still names the position he is holding,
                    # because that is the one his money is in.
                    why = ("the live price feed stopped answering altogether"
                           + ("" if sage is None else f" ({sage:.0f}s with no message of any kind)")
                           + f" — every pair is affected, including {p.symbol}")
                else:
                    why = (f"{p.symbol} stopped arriving while other pairs kept streaming"
                           + ("" if age is None else f" ({age:.0f}s ago)"))
                log.warning(f"[watcher] falling back to polled prices — {why}")
                # NOT AWAITED — this sits in the middle of reading the price a stop decision is
                # made on, so it must cost nothing at all.
                notify.tell_soon(self.send,
                    f"⚠️ {why[0].upper()}{why[1:]}. Falling back to the slower price — stop moves "
                    f"may be up to a minute late until it returns.")
        return await _prices_now(p.symbol, p.bullish)

    async def _check_all(self, positions, streamed: bool) -> None:
        """One pass over every open position. Delegates every decision to position_tracker."""
        # THE HIGH-WATER MARKS, MEASURED ON THIS CLOCK. Each position's R is computed below anyway;
        # collecting it costs nothing and hands `exit_watch` a reading every 0.5 SECONDS instead of
        # every 30. That is the difference between knowing how far a trade really ran and sampling it
        # sixty times more coarsely. This watcher already had the number and simply never passed it on.
        r_seen: dict[int, float] = {}
        for p in positions:
            # ONE BAD POSITION MUST NOT COST THE OTHERS THEIR STOP MOVE. Without this guard anything
            # raising while handling one position aborted `_check_all`, and `run_forever` catches
            # that by sleeping 30 SECONDS — so a single odd position switched the half-second
            # watcher off for half a minute, for every trade on the account. His rule: *"it is the
            # lifeline of a trade."* Same shape as the copy-platform defect found the same day.
            try:
                await self._one(p, streamed, r_seen)
            except Exception as exc:
                log.error(f"[watcher] {getattr(p, 'symbol', '?')} "
                          f"#{getattr(p, 'position_id', '?')} failed this pass: "
                          f"{type(exc).__name__}: {exc} — the other positions continue",
                          exc_info=True)

        # AFTER every stop move, never before — the same rule the exit and fill reports follow. This
        # only records what was already measured, but it must not sit in front of an amend.
        try:
            from monitor import exit_watch
            exit_watch.observe(positions, r_seen, source=("fix" if streamed else "poll"))
        except Exception as exc:
            log.warning(f"[watcher] could not record the high-water marks: "
                        f"{type(exc).__name__}: {exc}")

    async def _one(self, p, streamed: bool, r_seen: dict | None = None) -> None:
        """Everything this pass does for ONE position. Split out 2026-09-02 so a fault in it is
        contained by the guard above rather than taking the whole pass down."""
        from core import delivery_ledger
        from monitor.position_tracker import _auto_move, _key, _lines

        prices = await self._prices_for(p, streamed)
        if prices is None:
            return                        # nothing more to do for THIS position
        price, guard = prices             # READ decides when a rung is reached; GUARD where a stop may go
        r = p.r_at(price)
        if r is None:
            return                        # starting stop not known yet: do nothing, never guess
        if r_seen is not None:
            r_seen[int(p.position_id)] = r
        for tag, new_sl, message in _lines(p, r, price, guard):
            k = _key(p.position_id, tag)
            if delivery_ledger.is_delivered(k):
                continue
            # THE TRADE FIRST, THE MESSAGE AFTER — his rule, 2026-09-02: *"the logic that places
            # trades, moves it to BE and locks Rs... should not be affected by telegram messages or
            # telegram not working. It is the lifeline of a trade."*
            #
            # The send used to be awaited HERE, before the amend. `dispatcher._send_text` retries 3
            # times with 5s sleeps and the Telegram client's own timeouts are 5s, so a dead Telegram
            # could hold this line for ~25 SECONDS — on the path whose entire purpose is to act
            # within half a second, and for every other open position in the same pass.
            moved = await _auto_move(p, tag, new_sl, self.send, guard, quiet=(message is None))

            # Now tell him — WITHOUT WAITING. On a 0.5s loop even a 3s bounded wait would sit in
            # front of the next position's amend. With auto-move ON the rung is decided by the
            # broker, so Telegram's answer is not needed at all.
            if moved is None:
                told = await notify.tell(self.send, message)
            else:
                notify.tell_soon(self.send, message)
                told = True

            # AND THE RUNG IS ONLY DONE WHEN THE STOP IS REALLY AT THE BROKER — the same rule as
            # `position_tracker`, and the reason is his: *"make sure whatever is locked is never
            # taken by the market"*. A False leaves it unmarked and the next 0.5s pass retries.
            done = told if moved is None else bool(moved)
            if done:
                delivery_ledger.mark_delivered(k)
                log.info(f"[watcher] {p.symbol} #{p.position_id}: {tag} at {r:.2f}R "
                         f"({'streamed' if streamed and not self._degraded else 'polled'})"
                         f"{' (quiet)' if message is None else ''}")
            else:
                log.warning(f"[watcher] {p.symbol} #{p.position_id}: {tag} at {r:.2f}R "
                            f"NOT protected — retrying")
