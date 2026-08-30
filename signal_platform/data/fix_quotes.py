"""
Live prices STREAMED from cTrader's FIX price session — subscribe once, prices are pushed.

WHY THIS EXISTS, AND WHY IT CANNOT SLOW THE SCANNER. Everything else here asks the broker for data
over the Open API (port 5035) and waits, against a budget of about 5 requests/second per connection.
FIX is a different protocol on a different port (5211) with its own credential, and it does not ask
for anything: one subscription, then updates arrive as the price moves. It therefore spends **none**
of the budget the candle fetch uses. That is the whole reason it is here rather than a faster poll.

IT IS THE EYES, NOT THE HANDS. cTrader's FIX cannot carry a stop loss or a take profit — its
NewOrderSingle has no field for either (help.ctrader.com/fix/specification) — so order placement and
the stop move stay on the Open API, where all three prices travel in one message. Nothing in this
file places, amends or closes anything. It only reads prices.

THE FAILURE THAT MATTERS IS SILENCE. A dead session looks exactly like a quiet market: updates
simply stop. Anything relying on this MUST call `is_stale()` rather than assume a stream that opened
is a stream still running. The watcher that uses this falls back to the Open API quote and raises an
alarm when that happens — and that path is tested by killing the session, not by reading the code.

The wire format lives in `data/fix_wire.py`; this file owns only the SESSION.
THE PASSWORD IS NEVER IN THIS FILE — it comes from CTRADER_FIX_PASSWORD in the environment.
"""
import asyncio
import logging
import ssl
import time

from data.fix_wire import ID_TO_SYMBOL, build, logon_body, parse, subscribe_body

log = logging.getLogger(__name__)

HEARTBEAT_S = 30


class FixQuoteStream:
    """One FIX price session. `quote(symbol)` returns the newest (bid, ask) it has been pushed."""

    def __init__(self, account_id: str, password: str,
                 host: str = "demo-us-eqx-01.p.c-trader.com", port: int = 5211):
        self.sender = f"demo.pepperstone.{account_id}"
        self.account_id = str(account_id)
        self.password = password
        self.host, self.port = host, port
        self._seq = 0
        self._reader = self._writer = None
        self._quotes: dict[str, tuple[float, float]] = {}
        self._last_tick: dict[str, float] = {}
        self._last_any: float = 0.0
        self._task: asyncio.Task | None = None
        self._connected = False

    def _msg(self, msg_type: str, body: list) -> bytes:
        self._seq += 1
        return build(msg_type, self._seq, self.sender, body)

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
            self._connected = True
            self._last_any = time.monotonic()
            log.info(f"[fix] price stream open, subscribed to {known}")
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
            while self._connected and self._reader is not None:
                data = await self._reader.read(65535)
                if not data:
                    log.warning("[fix] stream closed by the broker")
                    self._connected = False
                    return
                buf += data.decode(errors="replace")
                for m in parse(buf):
                    mt = m.get("35")
                    if mt == "1":                            # test request -> heartbeat back
                        self._writer.write(self._msg("0", [(112, m.get("112", "t"))]))
                        await self._writer.drain()
                    elif mt in ("W", "X"):
                        self._absorb(m)
                    elif mt == "5":
                        log.warning("[fix] broker logged us out")
                        self._connected = False
                        return
                buf = ""
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error(f"[fix] stream ended: {type(exc).__name__}: {exc}")
            self._connected = False

    def _absorb(self, m: dict) -> None:
        """One market-data message into the quote book. A partial update keeps the other side."""
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

    async def close(self) -> None:
        self._connected = False
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

    # ── what callers read ──────────────────────────────────────────────────────

    def quote(self, symbol: str) -> tuple[float, float] | None:
        """Newest (bid, ask) pushed for this symbol, or None if none has arrived."""
        return self._quotes.get(symbol)

    def age(self, symbol: str | None = None) -> float | None:
        """Seconds since the last price arrived — for one symbol, or the stream as a whole.
        None means nothing has EVER arrived, a different problem from a stream gone quiet."""
        last = self._last_tick.get(symbol) if symbol else (self._last_any or None)
        return None if not last else time.monotonic() - last

    def is_stale(self, limit_s: float, symbol: str | None = None) -> bool:
        """THE CALL THAT SEPARATES A QUIET MARKET FROM A DEAD SESSION. Never assume a stream that
        opened is still running: from the inside, silence looks identical either way."""
        if not self._connected:
            return True
        a = self.age(symbol)
        return a is None or a > limit_s

    @property
    def connected(self) -> bool:
        return self._connected
