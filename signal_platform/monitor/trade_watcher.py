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
from data import ctrader_positions
from notifications import safe_notify as notify

log = logging.getLogger(__name__)

_STALE_AFTER_S = 20.0     # no tick for this long, while watching, means fall back and shout
_POLL_S = 0.5             # how often the streamed price is examined; costs no broker requests
_IDLE_S = 30.0            # how often we look for a position when there is none


class TradeWatcher:
    """One streaming watch over whatever is currently open. Started and stopped by the platform."""

    def __init__(self, send):
        self.send = send                       # async callable, the admin DM
        self._stream = None
        self._running = False
        self._degraded = False                 # True while falling back to the Open API quote

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
        positions = await ctrader_positions.open_positions()
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
            # No stream. The 30s tracker still covers this, so degrade rather than spin.
            await self._check_all(tradeable, streamed=False)
            await asyncio.sleep(_IDLE_S)
            return

        await self._check_all(tradeable, streamed=True)
        await asyncio.sleep(_POLL_S)

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
        return await self._stream.connect(symbols)

    async def _drop_stream(self) -> None:
        if self._stream is not None:
            await self._stream.close()
            self._stream = None

    async def _price_for(self, p, streamed: bool) -> float | None:
        """The price this position's stop would trigger on: the BID for a buy, the ASK for a sell.

        Falls back to the Open API quote whenever the stream has nothing fresh — and says so ONCE,
        rather than every pass, so a genuine outage is visible without becoming noise.
        """
        from monitor.position_tracker import _price_now
        if streamed and self._stream is not None:
            if not self._stream.is_stale(_STALE_AFTER_S, p.symbol):
                q = self._stream.quote(p.symbol)
                if q is not None:
                    if self._degraded:
                        self._degraded = False
                        log.info("[watcher] streamed prices are flowing again")
                        # SAY SO — the warning went to his DM, so the all-clear must too. This only
                        # ever logged, so a recovered feed left him holding a warning that his stop
                        # moves were running late when they were not.
                        notify.tell_soon(
                            self.send,
                            f"✅ The live price stream is flowing again for {p.symbol} — "
                            f"stop moves are back to acting within a second.")
                    return q[0] if p.bullish else q[1]
            if not self._degraded:
                self._degraded = True
                age = self._stream.age(p.symbol)
                msg = (f"⚠️ The live price stream went quiet for {p.symbol} "
                       f"({'no price yet' if age is None else f'{age:.0f}s ago'}). "
                       f"Falling back to the slower price — stop moves may be up to a minute late.")
                log.warning(f"[watcher] stream stale for {p.symbol}, falling back")
                # NOT AWAITED — this sits in the middle of reading the price a stop decision is
                # made on, so it must cost nothing at all.
                notify.tell_soon(self.send, msg)
        return await _price_now(p.symbol, p.bullish)

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

        price = await self._price_for(p, streamed)
        if price is None:
            return                        # nothing more to do for THIS position
        r = p.r_at(price)
        if r is None:
            return
        if r_seen is not None:
            r_seen[int(p.position_id)] = r
        for tag, new_sl, message in _lines(p, r, price):
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
            moved = await _auto_move(p, tag, new_sl, self.send, price, quiet=(message is None))

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
