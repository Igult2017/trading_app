"""
What we currently know about prices, from the FIX stream — the book, not the connection.

Split from `fix_quotes.py` on 2026-08-30 when that file passed 200 lines and was doing two jobs.
This owns WHAT WE KNOW; `fix_quotes` owns the socket that feeds it. They fail for different reasons —
a book bug is a wrong price or a missed minute, a session bug is a logon or a dropped connection.

THE FAILURE THAT MATTERS IS SILENCE. A dead session looks exactly like a quiet market: updates simply
stop. Anything relying on this MUST call `is_stale()` rather than assume a stream that opened is a
stream still running.

THE BID IS WHAT FEEDS CANDLES. cTrader's own candles are bid-based — *"It is not possible to get
trendbars based on ask prices"* — and measured 3-for-3 here, the broker's M1 close equals the FIX bid
exactly. Only the bid is passed to tick sinks; building from mid or ask would shift every level by
the spread.
"""
import logging
import time

from data.fix_wire import ID_TO_SYMBOL, sending_time

log = logging.getLogger(__name__)


class QuoteBook:
    """Newest bid/ask per symbol, when each arrived, and who wants telling about it."""

    def __init__(self):
        self._quotes: dict[str, tuple[float, float]] = {}
        self._last_tick: dict[str, float] = {}      # monotonic, for staleness
        self._tick_epoch: dict[str, float] = {}     # the BROKER's clock, for minute rolls
        self._seen_minute: dict[str, int] = {}
        self._last_any: float = 0.0
        self._tick_sinks: list = []
        self._connected = False
        self._connected_at: float = 0.0

    # WHEN IT CONNECTED, NOT JUST THAT IT DID — and this is the whole fix for the false alarm.
    # A bool cannot tell "opened a moment ago, first price still in flight" from "has been open for
    # ages and gone silent", so `is_stale` called them both stale and the watchers DM'd a warning
    # ONE MILLISECOND after the stream opened. Measured in production, 02 Sep:
    #     03:56:11.853  [fix] price stream open
    #     03:56:11.854  [entry-watcher] price stream quiet   <- 1 ms later, DM sent
    #     03:56:12.623  [entry-watcher] price stream is flowing again   <- 769 ms later
    # A property so the timestamp cannot drift from the flag: every existing
    # `book.connected = True/False` keeps working and stamps the clock for free.
    @property
    def connected(self) -> bool:
        return self._connected

    @connected.setter
    def connected(self, value: bool) -> None:
        value = bool(value)
        if value and not self._connected:
            self._connected_at = time.monotonic()   # a fresh open restarts the grace window
        self._connected = value

    def open_for(self) -> float:
        """Seconds this session has been open. 0.0 when it is not."""
        return (time.monotonic() - self._connected_at) if (self._connected and self._connected_at) else 0.0

    def on_bid_tick(self, fn) -> None:
        """Register a callback fed `(symbol, bid, broker_epoch)` for every tick. Bid only."""
        self._tick_sinks.append(fn)

    def absorb(self, m: dict) -> None:
        """One market-data message into the book. A partial update keeps the other side."""
        sym = ID_TO_SYMBOL.get(int(m.get("55", 0) or 0))
        if not sym:
            return                                   # unknown id — never guessed at
        prev = self._quotes.get(sym)
        bid, ask = m.get("px_0"), m.get("px_1")
        try:
            b = float(bid) if bid else (prev[0] if prev else None)
            a = float(ask) if ask else (prev[1] if prev else None)
        except ValueError:
            return
        if b is None or a is None:
            return
        self._quotes[sym] = (b, a)
        self._last_tick[sym] = self._last_any = time.monotonic()
        # THE BROKER'S OWN TIMESTAMP where it sent one (tag 52), falling back to ours. A minute
        # decided on a drifted local clock would bucket a tick into a minute it did not belong to.
        epoch = sending_time(m.get("52")) or time.time()
        self._tick_epoch[sym] = epoch
        for sink in self._tick_sinks:
            try:
                sink(sym, b, epoch)
            except Exception as exc:
                # A bar builder must never be able to kill the price stream that feeds it.
                log.error(f"[fix] tick sink failed for {sym}: {type(exc).__name__}: {exc}")

    # ── what callers read ──────────────────────────────────────────────────────

    def quote(self, symbol: str) -> tuple[float, float] | None:
        """Newest (bid, ask) for this symbol, or None if none has arrived."""
        return self._quotes.get(symbol)

    def age(self, symbol: str | None = None) -> float | None:
        """Seconds since the last price arrived — for one symbol, or the stream as a whole.
        None means nothing has EVER arrived, a different problem from a stream gone quiet."""
        last = self._last_tick.get(symbol) if symbol else (self._last_any or None)
        return None if not last else time.monotonic() - last

    def is_stale(self, limit_s: float, symbol: str | None = None) -> bool:
        """THE CALL THAT SEPARATES A QUIET MARKET FROM A DEAD SESSION. Never assume a stream that
        opened is still running: from the inside, silence looks identical either way.

        AND IT SEPARATES A THIRD STATE THE OLD VERSION COULD NOT SEE: a stream that has only just
        opened. `age()` returns None both when nothing has EVER arrived and — as its own docstring
        two functions up says — that is *"a different problem from a stream gone quiet"*. The old
        line `return a is None or a > limit_s` collapsed them, so a session was judged dead in the
        same instant it was born, before the first price could physically arrive.

        A stream that has just opened is WARMING UP, not broken. The silence is measured from the
        moment it opened, so it is judged by exactly the same `limit_s` as any other silence.

        THE REAL FAULT IS STILL CAUGHT, just honestly: a session that logs on but whose subscription
        never delivers has no ticks after `limit_s` of being open, and is reported then. Nothing is
        suppressed — it is timed correctly.
        """
        if not self.connected:
            return True
        a = self.age(symbol)
        if a is not None:
            return a > limit_s
        return self.open_for() > limit_s

    def minute_rolled(self, symbol: str) -> bool:
        """Has a 1-minute bar CLOSED for this symbol since this was last asked?

        THE MINUTE COMES FROM THE TICK, NOT THE CLOCK — a drifted local clock would fire on a minute
        in which no price actually traded. A roll is only real if a tick arrived in the new minute.

        Reading it CONSUMES it: the caller is being told "act now", and telling two callers about the
        same roll would scan twice for one bar.
        """
        if self._last_tick.get(symbol) is None:
            return False
        minute = int(self._tick_epoch.get(symbol, 0) // 60)
        if minute == 0:
            return False
        seen = self._seen_minute.get(symbol)
        self._seen_minute[symbol] = minute
        return seen is not None and minute > seen
