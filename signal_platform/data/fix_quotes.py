"""
The cTrader FIX price session — the socket. What it learns lives in `data/fix_book.py`.

WHY IT CANNOT SLOW THE SCANNER. Everything else asks the broker over the Open API (port 5035) and
waits, against ~5 requests/second per connection. FIX is a different protocol on a different port
(5211) with its own credential, and it asks for NOTHING: one subscription, then updates arrive as
price moves. Measured: the scanner's fetch median went 312ms → 297ms with the stream running.

IT IS THE EYES, NOT THE HANDS. cTrader's FIX cannot carry a stop loss or take profit
(help.ctrader.com/fix/specification), so placing and amending stay on the Open API where all three
prices travel in one message. Nothing here places, amends or closes anything.

AND IT HAS NO HISTORY — *"it does not support requests for historical market data"*
(help.ctrader.com/fix/limitations). So coverage starts when we connect and never retroactively,
which is why `on_coverage` exists: a bar already in progress when we attach is missing its early
ticks, and whatever builds candles has to be able to tell.

The wire format lives in `data/fix_wire.py`.
THE PASSWORD IS NEVER IN THIS FILE — it comes from CTRADER_FIX_PASSWORD in the environment.
"""
import asyncio
import logging
import ssl
import time

from data.fix_book import QuoteBook
from data.fix_wire import build, logon_body, parse, parse_stream, subscribe_body

log = logging.getLogger(__name__)


# ── THE SHARED HANDLE — how anything OUTSIDE a watcher reaches the live price ──────────────────────
#
# HIS INSTRUCTION: *"when trade is placed and even when watching 1HR candle to close, we should rely
# more on FIX data ... because it is real time data."*
#
# WHAT BLOCKED IT (D40). A `FixQuoteStream` is constructed by `entry_watcher` and `trade_watcher`,
# each keeping its own `book` on its own object. The SCANNER holds neither, so the hour-in-progress
# was assembled from CLOSED M1 bars and could be ~80 seconds behind.
#
# WHY A REGISTRY AND NOT A GLOBAL SINGLETON. There are genuinely two streams, they connect and drop
# independently, and either may be the healthy one at a given moment. A single module-level "the
# stream" would silently pin whichever connected last and go blind when that one dropped.
#
# THE CONTRACT:
#   * a stream registers itself when its session is UP and removes itself on EVERY path that ends it
#     (`_lost()` already exists for exactly that reason and is called everywhere)
#   * `live_price()` NEVER raises and NEVER blocks — it reads dictionaries already in memory
#   * it returns None when there is no healthy quote, and every caller must behave exactly as it did
#     before when it gets None. This is an ENRICHMENT, never a dependency.
_STREAMS: set = set()

# A quote older than this is not "live" any more. Deliberately generous: the point of comparison is
# a closed M1 bar, which is up to ~80s stale by construction, so anything fresher than this is still
# an improvement. A quiet market is not a broken one.
_FRESH_S = 15.0
# ── HOW LONG SILENCE IS ALLOWED TO MEAN "DEAD" ──────────────────────────────────────────────
# Defined HERE so one number serves every reader - the ladder kept its own copies, which is how
# two parts of the same system came to disagree about what a dead feed is.
#
# _SESSION_SILENT_S: nothing of ANY kind from the session, heartbeats included. We negotiate a
#   30-second heartbeat at logon, so 75s of total silence is already well past abnormal.
# _SYMBOL_SUSPECT_S: this symbol has not ticked while OTHERS have - a dead subscription rather
#   than a quiet market. Only meaningful alongside "something else is ticking".
_SESSION_SILENT_S = 75.0
_SYMBOL_SUSPECT_S = 90.0
# ⚠ AN ABSOLUTE CEILING, BECAUSE THE "OTHERS ARE TICKING" TEST IS BLIND ON ITS OWN. With a single
# symbol subscribed there is no other stream to compare against, so a dead subscription and a still
# market look identical however long it lasts. Beyond this, refuse regardless.
#
# 300 seconds is chosen from the data, not taste: across 786 days of the broker's own minutes there
# was not ONE minute with zero ticks on EUR/USD, GBP/USD or XAU/USD, and pauses even reaching 90s
# happen about 0.5 times a WEEKDAY. Five minutes of silence has never been a quiet market here - it
# is a broken one.
_MAX_AGE_S = 300.0


def _usable(book, symbol: str, age: float | None, max_age_s: float) -> bool:
    """Is this quote safe to use — not merely recent?

    ⚠ THE OLD TEST WAS AGE ALONE, AND IT WAS THE WRONG QUESTION. A tick is sent when the price
    MOVES, so an old quote on a live session means the price has not changed — it IS the current
    price, and the broker would return the same number if asked. Measured over 786 days of the
    broker's own minutes, EUR/USD goes 15 seconds without a tick about 37 times a WEEKDAY and 3
    seconds about 1,940 times; every one of those made a caller here fall back or, in the journal
    ticker's case, drop the pair from his screen entirely.

    So a quote is usable when EITHER
      * it is fresh by the caller's own standard — unchanged behaviour, and the fast path; or
      * the session is alive and this symbol is not suspect.

    It is refused when the session has stopped answering altogether, or when this symbol alone has
    gone silent while other symbols keep arriving — a dead subscription, which age alone can never
    tell apart from a market that is simply still.
    """
    if age is not None and age <= max_age_s:
        return True
    if age is None or age > _MAX_AGE_S:
        return False                      # nothing is this still; see the ceiling above
    if book.session_silent(_SESSION_SILENT_S):
        return False
    mine_silent = age is None or age > _SYMBOL_SUSPECT_S
    return not (mine_silent and book.ticking_symbols(_SYMBOL_SUSPECT_S) > 0)


def _register(stream) -> None:
    _STREAMS.add(stream)


def _deregister(stream) -> None:
    _STREAMS.discard(stream)


def live_quote(symbol: str, max_age_s: float = _FRESH_S) -> tuple[float, float] | None:
    """The freshest live (bid, ask) for `symbol`, or None when no healthy stream has one.

    BOTH SIDES TOGETHER, ALWAYS, AND NEVER MIXED WITH ANOTHER SOURCE. The spread is taken as
    `ask - bid` from ONE quote, so pairing a live bid with a stale ask from somewhere else would
    invent a spread that no broker ever showed — and could make it negative, which every consumer
    would then treat as a crossed book. If the live pair is not available this returns None and the
    caller uses its own source for BOTH sides.

    Returns None rather than a stale number, so the caller falls back instead of trusting a price
    from a session that has quietly died.
    """
    best = None
    best_age = None
    for st in tuple(_STREAMS):          # a copy: a stream may deregister from another task mid-loop
        try:
            if not st.book.connected:
                continue
            q = st.book.quote(symbol)
            if not q:
                continue
            age = st.book.age(symbol)
            if not _usable(st.book, symbol, age, max_age_s):
                continue
            bid, ask = q
            if not bid or not ask:
                continue
            # A CROSSED OR EQUAL BOOK IS NOT A QUOTE. `ctrader_spread.quote_for` already refuses
            # `ask <= bid` from the Open API for exactly this reason — "not a book, a crossed or
            # stale one" — and a second source must be held to the same standard, or the check is
            # only enforced on whichever source happens to answer.
            if ask <= bid:
                continue
            if best_age is None or age < best_age:
                best, best_age = (bid, ask), age
        except Exception as exc:        # never let a price lookup break what it was enriching
            log.debug(f"[fix] live_quote({symbol}) skipped a stream: {type(exc).__name__}: {exc}")
    return best


def live_price(symbol: str, max_age_s: float = _FRESH_S) -> float | None:
    """The freshest live MID price for `symbol`, or None when no healthy stream has one.

    THE MID, not the bid or the ask. This exists to say where price IS for the bar being built, and a
    candle is not one side of the spread. Anything deciding where an order would actually FILL must
    keep using the sided quote (`position_tracker._price_now`, `ctrader_spread.quote_for`) — that is
    a different question and this must never be substituted for it.
    """
    q = live_quote(symbol, max_age_s)
    return None if q is None else (q[0] + q[1]) / 2.0


def live_streams() -> int:
    """How many streams are registered and connected — for the health line, and for tests."""
    return sum(1 for st in tuple(_STREAMS) if getattr(getattr(st, "book", None), "connected", False))

HEARTBEAT_S = 30

# ── PROVING THE SESSION IS ALIVE WHEN THE PRICE IS NOT MOVING ───────────────────────────────
# We negotiate a 30-second heartbeat at logon (tag 108), so an idle session is obliged to keep
# talking. Silence beyond that is already abnormal - but rather than GUESS from it, we ask: send a
# test request and require an answer. That turns "is the feed dead?" from an inference about price
# movement into a question with a yes/no answer.
#
# WHY IT MATTERS: the old answer was inferred from tick age, and measured over 786 days of the
# broker's own minutes, EUR/USD pauses 3+ seconds about 1,940 times a WEEKDAY. The ladder called
# every one of those a dead feed.
_SILENCE_BEFORE_ASK_S = 40.0
_ANSWER_WITHIN_S      = 10.0


class FixQuoteStream:
    """One FIX price session, and the book it fills."""

    def __init__(self, account_id: str, password: str,
                 host: str = "demo-us-eqx-01.p.c-trader.com", port: int = 5211):
        self.sender = f"demo.pepperstone.{account_id}"
        self.account_id = str(account_id)
        self.password = password
        self.host, self.port = host, port
        self._seq = 0
        self._reader = self._writer = None
        self._task: asyncio.Task | None = None
        self.book = QuoteBook()
        self._coverage_up: list = []
        self._coverage_down: list = []

    # ── what callers register ──────────────────────────────────────────────────

    def on_bid_tick(self, fn) -> None:
        """Every bid tick, as `(symbol, bid, broker_epoch)`. Bid only — candles are bid-based."""
        self.book.on_bid_tick(fn)

    def on_coverage(self, start_fn, stop_fn) -> None:
        """Told when continuous coverage begins and when it is lost.

        Both matter equally. Losing the stream must invalidate the bar in progress: a bar with a
        hole in it is worse than no bar, because it looks complete.
        """
        self._coverage_up.append(start_fn)
        self._coverage_down.append(stop_fn)

    # ── lifecycle ──────────────────────────────────────────────────────────────

    async def connect(self, symbols: list[str]) -> bool:
        """Log on and subscribe. Returns False on any failure — never raises into the caller."""
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port,
                                        ssl=ssl.create_default_context()), timeout=20)
            self._writer.write(self._msg("A", logon_body(self.account_id, self.password,
                                                         HEARTBEAT_S)))
            await self._writer.drain()
            raw = (await asyncio.wait_for(self._reader.read(65535), timeout=15)
                   ).decode(errors="replace")
            msgs = parse(raw)
            if not any(m.get("35") == "A" for m in msgs):
                reason = next((m.get("58", "") for m in msgs), "")
                log.error(f"[fix] logon refused: {reason or raw[:120]}")
                await self.close()
                return False

            body, known = subscribe_body(symbols)
            self._writer.write(self._msg("V", body))
            await self._writer.drain()
            self.book.connected = True
            # THE STREAM IS NOW REACHABLE FROM OUTSIDE (D40). Registered here rather than in
            # __init__ so a stream that was built but never logged on is never offered as a price
            # source. `_lost()` removes it again on every path that ends the session.
            _register(self)
            log.info(f"[fix] price stream open, subscribed to {known}")
            # COVERAGE STARTS NOW, NOT RETROACTIVELY — FIX has no history to fill the gap.
            self._announce(self._coverage_up, known, time.time())
            self._task = asyncio.create_task(self._pump())
            return True
        except Exception as exc:
            log.error(f"[fix] connect failed: {type(exc).__name__}: {exc}")
            await self.close()
            return False

    async def _pump(self) -> None:
        """Read until closed: prices, and the heartbeats that prove the session is alive.

        ⚠ EVERY MESSAGE COUNTS AS PROOF OF LIFE, not just prices. A heartbeat (35=0) was not even
        handled here, and a test request (35=1) was answered without being recorded — so the one
        thing that distinguishes a quiet market from a dead feed was received and thrown away,
        thousands of times a day, while the watchers inferred death from the price standing still.

        ⚠ AND THE BUFFER KEEPS WHAT IT HAS NOT FINISHED READING. It used to be cleared after every
        read, which destroyed any message split across two of them. A lost test request is never
        answered, and the broker logs us out: a real disconnect caused by our own parsing.
        """
        buf = ""
        try:
            while self.book.connected and self._reader is not None:
                try:
                    data = await asyncio.wait_for(self._reader.read(65535),
                                                  timeout=_SILENCE_BEFORE_ASK_S)
                except asyncio.TimeoutError:
                    # Nothing at all for 40s on a session that promised a 30s heartbeat. Ask.
                    if not await self._prove_alive():
                        return self._lost()
                    continue
                if not data:
                    log.warning("[fix] stream closed by the broker")
                    return self._lost()
                self.book.heard()                            # ANY bytes = the session is alive
                buf += data.decode(errors="replace")
                msgs, buf = parse_stream(buf)                # the tail waits for the next read
                for m in msgs:
                    mt = m.get("35")
                    if mt == "1":                            # test request -> heartbeat back
                        self._writer.write(self._msg("0", [(112, m.get("112", "t"))]))
                        await self._writer.drain()
                    elif mt in ("W", "X"):
                        self.book.absorb(m)
                    elif mt == "5":
                        log.warning("[fix] broker logged us out")
                        return self._lost()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error(f"[fix] stream ended: {type(exc).__name__}: {exc}")
            self._lost()

    async def _prove_alive(self) -> bool:
        """Send a test request and wait for any reply. True = the session answered.

        THE POINT OF ASKING RATHER THAN ASSUMING. Silence can mean a dead socket or a market that
        has simply stopped moving, and from the inside they are identical. A test request makes the
        difference observable: a live session must answer it.
        """
        if self._writer is None or self._reader is None:
            return False
        try:
            self._writer.write(self._msg("1", [(112, f"alive-{int(time.time())}")]))
            await self._writer.drain()
            data = await asyncio.wait_for(self._reader.read(65535), timeout=_ANSWER_WITHIN_S)
        except Exception as exc:
            log.warning(f"[fix] session did not answer a test request: {type(exc).__name__}: {exc}")
            return False
        if not data:
            log.warning("[fix] session closed while being asked to prove it is alive")
            return False
        self.book.heard()
        # Feed the bytes back through the normal path so a price that arrived alongside the
        # heartbeat is not dropped on the floor.
        msgs, _ = parse_stream(data.decode(errors="replace"))
        for m in msgs:
            if m.get("35") in ("W", "X"):
                self.book.absorb(m)
        return True

    async def close(self) -> None:
        self._lost()
        if self._task and not self._task.done():
            self._task.cancel()
        if self._writer is not None and not self._writer.is_closing():
            try:
                self._writer.write(self._msg("5", []))
                await self._writer.drain()
            except Exception:
                pass
            self._writer.close()
        self._reader = self._writer = None

    # ── internals ──────────────────────────────────────────────────────────────

    def _msg(self, msg_type: str, body: list) -> bytes:
        self._seq += 1
        return build(msg_type, self._seq, self.sender, body)

    def _lost(self) -> None:
        """Coverage is gone. Said on EVERY path that ends the stream, so no builder is left
        believing it is still watching."""
        self.book.connected = False
        # ...and no OUTSIDE reader is left holding a dead session either (D40). This is the reason
        # registration hangs off this method: it is already the one place every ending path meets,
        # so a new exit route cannot forget to deregister.
        _deregister(self)
        self._announce(self._coverage_down)

    @staticmethod
    def _announce(sinks: list, *args) -> None:
        for cb in sinks:
            try:
                cb(*args)
            except Exception as exc:
                log.error(f"[fix] coverage callback failed: {type(exc).__name__}: {exc}")

    # ── the book, forwarded so existing callers are unchanged ──────────────────

    def quote(self, symbol: str):
        return self.book.quote(symbol)

    def age(self, symbol: str | None = None):
        return self.book.age(symbol)

    def is_stale(self, limit_s: float, symbol: str | None = None) -> bool:
        return self.book.is_stale(limit_s, symbol)

    def session_silent(self, limit_s: float) -> bool:
        """Has the session said NOTHING for this long? The honest test for a broken feed."""
        return self.book.session_silent(limit_s)

    def session_age(self) -> float | None:
        return self.book.session_age()

    def ticking_symbols(self, within_s: float) -> int:
        return self.book.ticking_symbols(within_s)

    def minute_rolled(self, symbol: str) -> bool:
        return self.book.minute_rolled(symbol)

    @property
    def connected(self) -> bool:
        return self.book.connected
