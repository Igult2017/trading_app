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
from data.fix_wire import build, logon_body, parse, subscribe_body

log = logging.getLogger(__name__)

HEARTBEAT_S = 30


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
        """Read pushed prices until closed. Answers heartbeats so the broker does not drop us."""
        buf = ""
        try:
            while self.book.connected and self._reader is not None:
                data = await self._reader.read(65535)
                if not data:
                    log.warning("[fix] stream closed by the broker")
                    return self._lost()
                buf += data.decode(errors="replace")
                for m in parse(buf):
                    mt = m.get("35")
                    if mt == "1":                            # test request -> heartbeat back
                        self._writer.write(self._msg("0", [(112, m.get("112", "t"))]))
                        await self._writer.drain()
                    elif mt in ("W", "X"):
                        self.book.absorb(m)
                    elif mt == "5":
                        log.warning("[fix] broker logged us out")
                        return self._lost()
                buf = ""
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error(f"[fix] stream ended: {type(exc).__name__}: {exc}")
            self._lost()

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

    def minute_rolled(self, symbol: str) -> bool:
        return self.book.minute_rolled(symbol)

    @property
    def connected(self) -> bool:
        return self.book.connected
