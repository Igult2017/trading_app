"""
One command to the broker: get a socket, send the request, read the verdict, close.

REWRITTEN 2026-08-30, AND THE VERSION BEFORE IT HAD NEVER RUN. It was built by copying
copy_platform's executor ("Mirrors the copy executor's proven lifecycle") and inherited four
dependencies on that platform, every one of which fails from `cd /app/signal_platform`
(start.sh:27): its host/port import, its `resolve_symbol_id` (no rule for a slash, so every symbol
here resolved to None), its Twisted `Client` — which needs a reactor this platform never installs,
so `_on_connected` never fired and the socket was never opened — and `config.ctrader_app_creds`,
which does not exist here at all and takes an argument besides. Placement timed out at 20s every
time, and `placer.py`'s catch-all turned that into one log line.

Nothing here imports Twisted or copy_platform. `execution/connection.py` owns getting an
authenticated socket of our OWN — never the scanner's, and its docstring says why that matters. This
file owns only the conversation held on it, and `execution/orders.py` owns the wire format.

THE PUBLIC INTERFACE IS UNCHANGED — `place_stop`, `cancel`, `amend_sltp`. `placer.py` and
`breakeven.py` call these by name and were deliberately not touched by the rewrite.
"""
import asyncio
import logging

from execution.connection import (COMMAND_TIMEOUT, NotSent, load_symbol_map, load_symbol_spec,
                                  open_authenticated)
from execution.orders import OrderResult, build_amend, build_cancel, build_stop, read_execution

log = logging.getLogger(__name__)

_EXECUTION_EVENT = 2126
# ProtoOAOrderErrorEvent — how cTrader ACTUALLY refuses an order operation, and it is not the generic
# error type. Found 2026-08-30 by testing the error paths against the live demo account: cancelling
# an order id that did not exist sat for the full 22.3s and came back "state UNKNOWN, reconcile
# before any retry" — the most alarming message this file can produce, for a request the broker had
# already refused outright. With this handled it answers in 2.5s with the real reason. The same path
# carries insufficient margin, a bad price and a closed market.
_ORDER_ERROR_EVENT = 2132


class StopOrderClient:
    """One connection, one command, then closed. Its own socket, never the scanner's."""

    def __init__(self, creds: dict, account_type: str = "demo"):
        self.creds = creds
        self.account_type = account_type
        self._writer = None

    async def place_stop(self, symbol: str, side: str, volume: int,
                         stop_price: float, sl: float, tp: float,
                         expiry_ms: int | None = None, lots: float = 0.0) -> OrderResult:
        """`lots` is the size the RISK MATHS produced, carried through untouched.

        It is not redundant with `volume`. The caller converts lots to the API's integer units
        without knowing the contract size, which is only right for currency pairs; when the broker
        states its own `lotSize` for the symbol, `orders.build_stop` re-derives the volume from
        these lots and the caller's number is discarded. Left at 0 the old behaviour is kept exactly.
        """
        return await self._run(("stop", symbol, side, volume, stop_price, sl, tp, expiry_ms, lots))

    async def cancel(self, order_id: int) -> OrderResult:
        return await self._run(("cancel", int(order_id)))

    async def amend_sltp(self, position_id: int, symbol: str, sl: float,
                         tp: float | None) -> OrderResult:
        """Move a live position's stop. `tp` is the position's CURRENT target, re-passed so the
        broker cannot read its absence as a removal — see `orders.build_amend`."""
        return await self._run(("amend", int(position_id), symbol, float(sl), tp))

    # ── internals ──────────────────────────────────────────────────────────────

    async def _run(self, cmd: tuple) -> OrderResult:
        try:
            return await self._converse(cmd)
        except NotSent as exc:
            # NOTHING LEFT THIS MACHINE, so the state is not unknown — it is unchanged. Reporting
            # "UNKNOWN" here would send him to reconcile an account nothing was sent to, and would
            # make every network hiccup look like a possible duplicate order.
            return OrderResult(ok=False, error=f"not sent — {exc}")
        except asyncio.TimeoutError:
            # The request WAS sent and no verdict came back. Genuinely unknown: "assume it failed"
            # is how one intended order becomes two real ones.
            return OrderResult(ok=False,
                               error="timed out — order state UNKNOWN, reconcile before any retry")
        except Exception as exc:
            log.error(f"[execution] {cmd[0]} failed: {type(exc).__name__}: {exc}", exc_info=True)
            return OrderResult(ok=False, error=f"{type(exc).__name__}: {exc}")
        finally:
            # ALWAYS closed, on every path including the timeout. A leaked socket here would
            # accumulate in a process that runs for weeks, and is one more connection cTrader counts.
            writer, self._writer = self._writer, None
            if writer is not None and not writer.is_closing():
                writer.close()

    async def _converse(self, cmd: tuple) -> OrderResult:
        from data import ctrader_session as sess

        acct = int(self.creds["ctraderId"])
        reader, writer = await open_authenticated(self.creds, self.account_type)
        self._writer = writer

        symbol_map, spec = {}, None
        if cmd[0] == "stop":
            symbol_map = await load_symbol_map(reader, writer, acct)
            # THE CONTRACT SIZE COMES FROM THE BROKER, NOT FROM A CONSTANT. The symbol LIST carries
            # no lotSize (it is `ProtoOALightSymbol`), which is why sizing assumed a 100,000-unit
            # forex lot for every instrument and gold went out 1,000x too large. One extra round
            # trip, only for a new order, and a failure returns None rather than blocking the trade.
            from shared.symbols import resolve_symbol_id
            sid = resolve_symbol_id(cmd[1], symbol_map)
            if sid is not None:
                spec = await load_symbol_spec(reader, writer, acct, sid)
                if spec is None:
                    log.warning(f"[execution] no symbol spec for {cmd[1]} — sizing falls back to "
                                f"the per-instrument default, and the broker's limits are unchecked")

        req, err = self._build(acct, cmd, symbol_map, spec)
        if err:
            raise NotSent(err)                      # e.g. the symbol is not on this account

        # FROM HERE ON the order may be live, so a failure is UNKNOWN rather than "not sent".
        await sess.send(writer, req.payloadType, req.SerializeToString())
        return await asyncio.wait_for(self._await_verdict(sess, reader, cmd),
                                      timeout=COMMAND_TIMEOUT)

    def _build(self, acct: int, cmd: tuple, symbol_map: dict, spec: dict | None = None):
        if cmd[0] == "cancel":
            return build_cancel(acct, cmd[1]), None
        if cmd[0] == "amend":
            _, position_id, symbol, sl, tp = cmd
            return build_amend(acct, position_id, symbol, sl, tp), None
        _, symbol, side, volume, stop_price, sl, tp, expiry_ms, lots = cmd
        return build_stop(acct, symbol, side, volume, stop_price, sl, tp, expiry_ms, symbol_map,
                          spec=spec, lots=lots)

    async def _await_verdict(self, sess, reader, cmd: tuple) -> OrderResult:
        """Read until the broker gives a verdict.

        THE VERDICT ARRIVES AS A PUSH, so `recv_expect` is the wrong tool — it returns on the first
        message of the type asked for, and an execution event is not a reply to anything. We read
        raw and let `read_execution` decide, exactly as the old callback did; the difference is that
        those pushes now land on OUR socket instead of the scanner's.

        `read_execution` returning None means "intermediate event, keep waiting". The caller's
        `wait_for` bounds this loop, so a stream that never reaches a verdict times out and is
        reported as UNKNOWN rather than hanging.
        """
        from ctrader_open_api.messages.OpenApiMessages_pb2 import (
            ProtoOAExecutionEvent, ProtoOAErrorRes, ProtoOAOrderErrorEvent)
        while True:
            msg = await sess.recv(reader)

            if msg.payloadType in (sess.PT_OA_ERROR, sess.PT_ERROR):
                e = ProtoOAErrorRes()
                try:
                    e.ParseFromString(msg.payload)
                    return OrderResult(ok=False, error=f"cTrader: {e.errorCode} {e.description}")
                except Exception:
                    return OrderResult(ok=False,
                                       error=f"cTrader error (payloadType {msg.payloadType})")

            if msg.payloadType == _ORDER_ERROR_EVENT:
                # A REFUSAL IS AN ANSWER. Without this branch the loop ignored it and ran to the
                # timeout, reporting "state UNKNOWN" for an order already rejected.
                oe = ProtoOAOrderErrorEvent()
                try:
                    oe.ParseFromString(msg.payload)
                    return OrderResult(
                        ok=False, error=f"cTrader refused: {oe.errorCode} {oe.description}".strip())
                except Exception:
                    return OrderResult(ok=False,
                                       error="cTrader refused the order (unparseable reason)")

            if msg.payloadType != _EXECUTION_EVENT:
                continue                                  # spot price, margin change, other pushes

            event = ProtoOAExecutionEvent()
            event.ParseFromString(msg.payload)
            verdict = read_execution(event,
                                     is_cancel=(cmd[0] == "cancel"),
                                     is_amend=(cmd[0] == "amend"))
            if verdict is not None:
                return verdict
