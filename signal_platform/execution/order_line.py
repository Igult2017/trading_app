"""THE SIGNAL ENGINE'S ORDER CONNECTION — one, kept open, logged in once (22 Nov 2026, sync plan step 3).

WHY. Every order command (place, cancel, move a stop, close) used to open a NEW connection to cTrader, log the app and
the account in, send one request and hang up (`execution/broker.py`). The website, this engine and the copier share ONE
cTrader app, and cTrader counts connections per app; a burst of stop moves opened a connection each. Now there is one,
held open, and commands take turns on it.

THE RULES IT KEEPS:
  * ONE COMMAND AT A TIME (`use`): two commands never read each other's replies.
  * A KEEP-ALIVE every 8 s while idle — cTrader drops a connection that says nothing for 10 s.
  * FRESH CREDENTIALS WIN: the caller reads the token from Node for every command; a different token, account or
    environment closes this connection and opens a new one (a renewal by the website ends the old session anyway).
  * A BROKEN OR TIMED-OUT CONVERSATION CLOSES THE CONNECTION. A read cut off half-way through a reply would leave every
    later reply one message out of step, so the next command starts on a clean connection.
  * NOTHING IS SENT YET while connecting, so every failure here is still "not sent" (`NotSent`).
"""
import asyncio
import contextlib
import logging

log = logging.getLogger(__name__)

HEARTBEAT_S = 8.0
_PT_HEARTBEAT = 51


class OrderLine:
    def __init__(self):
        self._lock = asyncio.Lock()
        self._reader = None
        self._writer = None
        self._key = None
        self._hb: asyncio.Task | None = None
        self.symbol_maps: dict[int, dict] = {}            # account -> {name: id}, kept for the life of the process
        self.specs: dict[tuple, dict] = {}                # (account, symbol id) -> contract size and limits

    def is_open(self) -> bool:
        """Open from OUR side AND not closed by the broker. The second half matters: nobody reads this connection
        between commands, so a broker that dropped it while idle is noticed only through the end-of-stream marker the
        reader is given the moment the connection goes — checked here, before anything is written into a dead
        connection (found by the stand-in broker, 22 Nov 2026: the next order failed instead of reconnecting)."""
        if self._writer is None or self._writer.is_closing():
            return False
        return not (self._reader is not None and getattr(self._reader, "_eof", False))

    def close(self, why: str = "") -> None:
        if self._hb is not None:
            self._hb.cancel()
            self._hb = None
        if self._writer is not None and not self._writer.is_closing():
            self._writer.close()
            if why:
                log.info(f"[order_line] connection closed — {why}")
        self._reader = self._writer = None
        self._key = None

    async def _ensure(self, creds: dict, account_type: str) -> None:
        key = (int(creds["ctraderId"]), account_type, creds.get("accessToken"))
        if self.is_open() and self._key == key:
            return
        self.close("new credentials" if self._key else "")
        from execution.connection import open_authenticated   # raises NotSent: nothing has been sent
        self._reader, self._writer = await open_authenticated(creds, account_type)
        self._key = key
        self._hb = asyncio.ensure_future(self._heartbeat())
        log.info(f"[order_line] order connection open for account {key[0]} ({account_type}) — it stays open")

    async def _heartbeat(self) -> None:
        from data import ctrader_session as sess
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            if self._lock.locked() or not self.is_open():
                continue                                  # a command is talking; it keeps the line alive itself
            try:
                await sess.send(self._writer, _PT_HEARTBEAT, b"")
            except Exception as exc:
                self.close(f"keep-alive failed ({type(exc).__name__})")
                return

    @contextlib.asynccontextmanager
    async def use(self, creds: dict, account_type: str):
        """(reader, writer) of the open, logged-in order connection, held for one command."""
        async with self._lock:
            await self._ensure(creds, account_type)
            try:
                yield self._reader, self._writer
            except (asyncio.TimeoutError, asyncio.IncompleteReadError, OSError, ConnectionError) as exc:
                self.close(f"{type(exc).__name__} during a command")
                raise


LINE = OrderLine()
