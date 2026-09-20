"""
cTrader Open API provider — real-time position events via TCP/protobuf.
One CTraderProvider instance per master broker account.
Position events are pushed by cTrader the moment they occur (no polling).

Auth flow: ApplicationAuth → AccountAuth → subscribe → receive ProtoOAExecutionEvents
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Callable, Awaitable

from ctrader_open_api import Client, Protobuf, TcpProtocol
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOASymbolsListReq, ProtoOASymbolsListRes,
    ProtoOASymbolByIdReq, ProtoOASymbolByIdRes,
    ProtoOAReconcileReq, ProtoOAReconcileRes,
    ProtoOAExecutionEvent,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAPositionStatus

from config import CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT, RECONNECT_DELAY, \
    RECONCILE_INTERVAL

import symbol_details
from lot_calc import lots_from_volume

log = logging.getLogger("provider.ctrader")

OnEvent = Callable[[dict, str], Awaitable[None]]   # (event_dict, master_id)


@dataclass
class PositionSnapshot:
    position_id: int
    symbol:      str
    action:      str   # BUY | SELL
    volume_lots: float
    entry_price: float
    stop_loss:   float | None
    take_profit: float | None
    closed_price: float | None = None   # set on CLOSE (exit price); entry_price stays the entry


class CTraderProvider:
    """Connects to cTrader for one master account and fires on_event callbacks."""

    def __init__(self, master_id: str, creds: dict, account_type: str,
                 on_event: OnEvent):
        self.master_id    = master_id
        self.creds        = creds
        self.account_type = account_type
        self.on_event     = on_event
        self._positions: dict[int, PositionSnapshot] = {}
        # OPENS HELD BACK UNTIL THEIR STOP IS KNOWN — positionId -> how many reconciles we have
        # waited. See `_handle_execution`: a fill event that carries no stop cannot be sized by
        # risk (`lot_calc`) and cannot pass the 3% cap (`risk_guard`), so emitting it immediately
        # only produces a SKIP. Every one of the 11 master events recorded up to 2026-09-20 was
        # stop-less, which is why not one trade was ever copied.
        self._awaiting_stop: dict[int, int] = {}
        self._spec_requested: set[int] = set()   # symbolIds whose contract spec we asked for
        self._symbols: dict[int, str] = {}   # symbolId → symbolName (cTrader trades carry only ids)
        self._authed      = False
        self._reconciled  = False
        self._reconcile_scheduled = False
        self._connected   = False
        self._disconnected_since: float | None = None
        self._loop        = asyncio.get_running_loop()

        # Only "demo" uses the demo gateway; live AND funded/prop accounts are live.
        host = CT_DEMO_HOST if account_type == "demo" else CT_LIVE_HOST
        self.client = Client(host, CT_PORT, TcpProtocol)
        self.client.setConnectedCallback(self._on_connected)
        self.client.setDisconnectedCallback(self._on_disconnected)
        self.client.setMessageReceivedCallback(self._on_message)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def start(self) -> None:
        log.info(f"[{self.master_id}] connecting to cTrader Open API")
        self.client.startService()

    def stop(self) -> None:
        self.client.stopService()

    def needs_recycle(self, max_down: float = 300.0) -> bool:
        """True if disconnected longer than max_down — the engine supervisor recycles it."""
        return (not self._connected and self._disconnected_since is not None
                and (time.monotonic() - self._disconnected_since) > max_down)

    def _send_reconcile(self) -> None:
        """Ask for the open positions ONCE. No timer — see `_request_reconcile`.

        SPLIT OUT 2026-09-20 because an out-of-band caller needed it. `_request_reconcile` reschedules
        itself on every call, so calling THAT to ask an extra question would have started a second
        repeating chain and doubled the reconcile rate for the provider's whole life, every time.
        """
        if not self._authed:
            return
        try:
            req = ProtoOAReconcileReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            self.client.send(req)
        except Exception as e:
            log.warning(f"[{self.master_id}] reconcile request failed: {e}")

    def _request_reconcile(self) -> None:
        """Periodic safety net — re-fetch open positions to catch missed closes."""
        self._send_reconcile()
        self._loop.call_later(RECONCILE_INTERVAL, self._request_reconcile)

    # ── Twisted callbacks ──────────────────────────────────────────────────────

    def _on_connected(self, client):
        self._connected = True
        self._disconnected_since = None
        from config import ctrader_app_creds
        cid, csec = ctrader_app_creds(self.creds)   # the app that issued THIS account's tokens
        req = ProtoOAApplicationAuthReq()
        req.clientId     = cid
        req.clientSecret = csec
        client.send(req)

    def _on_disconnected(self, client, reason):
        log.warning(f"[{self.master_id}] disconnected: {reason}. Reconnecting in {RECONNECT_DELAY}s")
        self._authed = False
        self._reconciled = False
        self._connected = False
        if self._disconnected_since is None:
            self._disconnected_since = time.monotonic()
        self._loop.call_later(RECONNECT_DELAY, self.start)

    def _on_message(self, client, message):
        """THE GUARD THAT STOPS ONE BAD MESSAGE KILLING THE CONNECTION.

        This was unguarded, and that is what turned a one-word typo into an outage. An exception
        raised in here escapes into Twisted, which treats it as a failed connection and tears the
        session down; the provider then reconnects, re-authenticates, reads the same position, and
        raises again. Production on 02 Sep: 64 identical `AttributeError`s, **56 reconnects in
        6.8 hours** — roughly one every seven minutes — and 147 Twisted timeout tracebacks on top,
        which is what made the log look like dozens of separate faults instead of one.

        The rule this restores is already written down elsewhere in the codebase, in
        `signal_platform/data/fix_book.absorb`: *"A bar builder must never be able to kill the price
        stream that feeds it."* Same principle, same reason — the transport must outlive a fault in
        anything that reads from it.

        NOT a blanket silencer: the fault is logged in full, with a stack trace, so it is as visible
        as before. What changes is that the connection survives it.
        """
        try:
            self._dispatch(client, message)
        except Exception as exc:
            # THE HANDLER ITSELF MUST NOT BE ABLE TO THROW. A first version read
            # `getattr(message, "payloadType", "?")` here to name the message — and `getattr`'s
            # default only swallows AttributeError, so a message whose `payloadType` raises anything
            # else re-raised straight out of the except block and killed the connection anyway.
            # Caught by this file's own test. Everything that could fail is now inside its own guard.
            try:
                ptype = message.payloadType
            except Exception:
                ptype = "?"
            try:
                log.error(f"[{self.master_id}] error handling message type {ptype}: "
                          f"{type(exc).__name__}: {exc} — connection KEPT", exc_info=True)
            except Exception:
                pass

    def _dispatch(self, client, message):
        ptype = message.payloadType

        if ptype == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAAccountAuthReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            req.accessToken         = self.creds["accessToken"]
            client.send(req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            self._authed = True
            log.info(f"[{self.master_id}] authenticated — loading symbols")
            req = ProtoOASymbolsListReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            client.send(req)

        elif ptype == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(message)
            self._symbols = {s.symbolId: s.symbolName for s in res.symbol}
            # The light list gives names only. Reading a master's SIZE needs lotSize, which lives on
            # the full ProtoOASymbol — see _snap for the 100,000x bug that came of guessing it.
            # Fetched lazily per symbol, on first sight of a position in it.
            log.info(f"[{self.master_id}] {len(self._symbols)} symbols — requesting open positions")
            req = ProtoOAReconcileReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            client.send(req)
            if not self._reconcile_scheduled:   # one chain for the provider's lifetime
                self._reconcile_scheduled = True
                self._loop.call_later(RECONCILE_INTERVAL, self._request_reconcile)

        elif ptype == ProtoOASymbolByIdRes().payloadType:
            res = Protobuf.extract(message)
            symbol_details.absorb(int(self.creds["ctraderId"]), res)
            spec_n = len(getattr(res, "symbol", []))
            log.info(f"[{self.master_id}] contract spec loaded for {spec_n} symbol(s)")
            self._replay_pending()

        elif ptype == ProtoOAReconcileRes().payloadType:
            res = Protobuf.extract(message)
            fresh: dict[int, PositionSnapshot] = {}
            for pos in res.position:
                # A FAILURE TO READ A POSITION MUST NEVER LOOK LIKE A CLOSED ONE. If `_snap` raises,
                # the position is simply absent from `fresh` — and the diff below reads "absent" as
                # "closed on the master" and emits a synthetic CLOSE, which would close the
                # FOLLOWER's real position because we failed to parse the master's. The previous
                # snapshot is carried forward instead, so an unreadable position is treated as
                # unchanged: the safe direction, and the next reconcile tries again.
                try:
                    snap = self._snap(pos)
                except Exception as exc:
                    pid = getattr(pos, "positionId", None)
                    prev = self._positions.get(pid) if pid is not None else None
                    log.error(f"[{self.master_id}] could not read position {pid}: "
                              f"{type(exc).__name__}: {exc} — "
                              f"{'held as unchanged' if prev else 'skipped'}, NOT treated as closed",
                              exc_info=True)
                    if prev is not None:
                        fresh[pid] = prev
                    continue
                fresh[snap.position_id] = snap
            if not self._reconciled:
                # Initial load after auth — record, no diff.
                self._positions = fresh
                self._reconciled = True
                log.info(f"[{self.master_id}] loaded {len(self._positions)} open positions")
            else:
                # Periodic safety reconcile — a position that vanished was closed on
                # the master (possibly via a missed event); emit a synthetic CLOSE.
                for pid, prev in list(self._positions.items()):
                    if pid not in fresh:
                        self._positions.pop(pid, None)
                        # NEVER ANNOUNCED, SO NEVER RETRACTED. A position still waiting for its stop
                        # has had no OPEN emitted, so the follower cannot be holding anything to
                        # close. The dispatcher would safely no-op, but it would also write a master
                        # CLOSE row with no OPEN beside it and log a skip that reads like a failure —
                        # exactly the kind of misleading record that made this defect take a day to
                        # find. `_release_awaiting` reports it properly a few lines below.
                        if pid in self._awaiting_stop:
                            continue
                        log.info(f"[{self.master_id}] reconcile: position {pid} closed externally")
                        asyncio.ensure_future(
                            self.on_event({"type": "CLOSE", "snap": prev}, self.master_id))
                # Track newly-seen positions silently — do NOT emit OPEN (the live
                # execution event already handles opens; avoids double-copying).
                for pid, snap in fresh.items():
                    self._positions.setdefault(pid, snap)
            # RELEASE THE OPENS THAT WERE WAITING FOR THEIR STOP (2026-09-20). This runs on BOTH
            # branches above — the initial load and the periodic safety net — because the answer to
            # the out-of-band request fired by `_handle_execution` can arrive as either.
            self._release_awaiting(fresh)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message)
            asyncio.ensure_future(self._handle_execution(event))

    # ── Event handling ─────────────────────────────────────────────────────────

    async def _handle_execution(self, event) -> None:
        # Classify by the position's STATUS (open/closed) + our previous snapshot —
        # NOT executionType (ORDER_FILLED=3 fires for BOTH opens and closes, so the
        # old 2/3/4 code misclassified every fill).
        pos = event.position if event.HasField("position") else None
        if pos is None:
            return

        pid    = pos.positionId
        status = pos.positionStatus
        snap   = self._snap(pos)
        prev   = self._positions.get(pid)

        if status == ProtoOAPositionStatus.POSITION_STATUS_CLOSED:
            self._positions.pop(pid, None)
            # A HELD OPEN DIES WITH THE POSITION. Releasing it after the master is out would open the
            # follower into a trade that no longer exists — and the CLOSE is dropped too, because an
            # entry we never announced cannot be exited: the follower has nothing open, and a CLOSE
            # row with no OPEN beside it is a record that reads like a failure.
            was_held = self._awaiting_stop.pop(pid, None) is not None
            if was_held:
                log.info(f"[{self.master_id}] position {pid} closed while still waiting for its "
                         f"stop — nothing was copied, so there is nothing to close")
                return
            # Record the exit in closed_price; keep entry_price as the real entry (from
            # our prior snapshot when we have it). Emit CLOSE EVEN IF we never saw the
            # OPEN (e.g. it closed during the auth→reconcile window) — the dispatcher
            # safely no-ops when the follower has no matching position, so a follower is
            # never stranded holding a position the master has already exited.
            snap.closed_price = float(pos.price) if pos.price else None
            if prev is not None:
                snap.entry_price = prev.entry_price
            await self.on_event({"type": "CLOSE", "snap": snap}, self.master_id)

        elif status == ProtoOAPositionStatus.POSITION_STATUS_OPEN:
            # ALREADY HELD, WAITING FOR ITS STOP. If the stop arrives on a live event — the broker
            # attaching protection a moment after the fill — release the OPEN here rather than wait
            # for the next reconcile. Without this branch the same event would be read as a MODIFY
            # of a position the follower has not opened, which can only ever be skipped.
            if pid in self._awaiting_stop:
                self._positions[pid] = snap
                if snap.stop_loss is not None:
                    self._awaiting_stop.pop(pid, None)
                    log.info(f"[{self.master_id}] position {pid} {snap.symbol}: stop "
                             f"{snap.stop_loss} arrived on a live event — copying now")
                    await self.on_event({"type": "OPEN", "snap": snap}, self.master_id)
                return

            if prev is None:
                self._positions[pid] = snap
                # A FILL EVENT WITHOUT A STOP IS HELD, NOT EMITTED (2026-09-20). Emitting it is
                # worse than waiting: risk-% sizing cannot size without the stop distance and the
                # 3% per-trade cap cannot measure risk without it, so the copy is SKIPPED and the
                # entry is lost for good. The stop IS readable from the position — the reconcile
                # below carries it — so ask for it now and emit the OPEN complete. His five fills
                # of 09-18 Sep all died here.
                if snap.stop_loss is None:
                    self._awaiting_stop[pid] = 0
                    log.info(f"[{self.master_id}] position {pid} {snap.symbol} filled with no stop "
                             f"on the event — asking the broker for it before copying")
                    self._send_reconcile()
                    return
                await self.on_event({"type": "OPEN", "snap": snap}, self.master_id)
            elif prev.stop_loss != snap.stop_loss or prev.take_profit != snap.take_profit:
                self._positions[pid] = snap
                await self.on_event({"type": "MODIFY", "snap": snap, "prev": prev}, self.master_id)
            else:
                self._positions[pid] = snap   # volume/other change — track silently

    # How many reconciles an OPEN waits for its stop before it is emitted without one. At the
    # 30-second reconcile interval that is about a minute and a half — long enough for the broker to
    # attach protection, short enough that a master who genuinely trades without stops still gets
    # copied by the modes that do not need one, with an honest reason in the log if one does.
    MAX_STOP_WAITS = 3

    def _release_awaiting(self, fresh: dict[int, PositionSnapshot]) -> None:
        """Emit the OPENs held back by `_handle_execution`, now that positions have been re-read.

        THREE ENDINGS, and each one matters:
          * the position now carries a stop  -> emit OPEN with it. This is the fix.
          * it is gone from `fresh`          -> it closed before we could read it (his 16 Sep trade
                                                lasted 1.2 seconds). Emit NOTHING: there is no trade
                                                left to copy, and a late OPEN would open the follower
                                                into a position the master has already exited.
          * still no stop after MAX_STOP_WAITS -> emit it anyway. Waiting for ever would silently
                                                drop every trade of a master who uses no stops.
        """
        for pid, waits in list(self._awaiting_stop.items()):
            snap = fresh.get(pid)
            if snap is None:
                self._awaiting_stop.pop(pid, None)
                log.info(f"[{self.master_id}] position {pid} closed before its stop could be read — "
                         f"nothing copied, which is correct: the master is already out")
                continue
            if snap.stop_loss is not None:
                self._awaiting_stop.pop(pid, None)
                self._positions[pid] = snap
                log.info(f"[{self.master_id}] position {pid} {snap.symbol}: stop {snap.stop_loss} "
                         f"read from the broker — copying now")
                asyncio.ensure_future(self.on_event({"type": "OPEN", "snap": snap}, self.master_id))
                continue
            self._awaiting_stop[pid] = waits + 1
            if waits + 1 >= self.MAX_STOP_WAITS:
                self._awaiting_stop.pop(pid, None)
                self._positions[pid] = snap
                log.warning(f"[{self.master_id}] position {pid} {snap.symbol}: still no stop after "
                            f"{self.MAX_STOP_WAITS} reads — copying it WITHOUT one; risk-% sizing "
                            f"and the per-trade risk cap will refuse it, and say so")
                asyncio.ensure_future(self.on_event({"type": "OPEN", "snap": snap}, self.master_id))

    def _snap(self, pos) -> PositionSnapshot:
        """A master position as a copy event.

        THE SIZE IS THE DANGEROUS FIELD. This read `td.volume / 100` with the comment "cTrader
        volume = centilots". It is not centilots — cTrader's own words are "Volume in cents (e.g.
        1000 in protocol means 10.00 units)", and lotSize is in those same cents. So a 1.00-lot
        forex position (volume 10,000,000) was read as 100,000 LOTS. In mult mode calc_lots then
        computed 100,000 x the multiplier and clamped to MAX_LOTS=100, so every copied trade
        silently became exactly 100 lots whatever the master actually did.

        It survived because the WRITE side was wrong by the same factor in the other direction
        (int(lots * 100)) and the two cancelled into something merely tiny. Fixing the write side
        alone removed the cancellation and turned a harmless bug into a 100-lot order — which is
        why both sides now go through lot_calc, where they sit together and a round-trip test
        asserts they invert.

        No contract spec -> volume_lots 0.0. calc_lots reads 0.0 as "no valid size, SKIP", so an
        unreadable position produces no trade instead of a guessed one.
        """
        td   = pos.tradeData
        spec = symbol_details.describe(
            symbol_details.get(int(self.creds["ctraderId"]), td.symbolId))
        if not spec["known"]:
            self._want_spec(td.symbolId)
        lots = lots_from_volume(spec, td.volume)
        if lots <= 0:
            log.warning(f"[{self.master_id}] {self._symbols.get(td.symbolId, td.symbolId)}: "
                        f"no contract spec yet — size unreadable, event will SKIP")
        return PositionSnapshot(
            position_id = pos.positionId,
            symbol      = self._symbols.get(td.symbolId, str(td.symbolId)),
            action      = "BUY" if td.tradeSide == 1 else "SELL",
            volume_lots = lots,
            entry_price = float(pos.price) if pos.price else 0.0,
            stop_loss   = float(pos.stopLoss)   if pos.stopLoss   else None,
            take_profit = float(pos.takeProfit) if pos.takeProfit else None,
        )

    def _want_spec(self, symbol_id: int) -> None:
        """Ask for a symbol's contract spec once. Cheap, idempotent, and the response re-drives
        whatever was waiting on it (_replay_pending).

        THE ATTRIBUTE IS `client`, NOT `_client`. It was written with an underscore here and nowhere
        else in the file (it is `self.client` at __init__ and at every other use), so this raised
        `AttributeError: 'CTraderProvider' object has no attribute '_client'` EVERY time a master
        position was read — 64 times in 6.8 hours of production on 02 Sep, taking the broker
        connection down with it 56 times, roughly one every seven minutes.
        """
        if symbol_id in self._spec_requested or self.client is None:
            return
        self._spec_requested.add(symbol_id)
        try:
            self.client.send(symbol_details.build_request(int(self.creds["ctraderId"]), symbol_id))
        except Exception as exc:
            self._spec_requested.discard(symbol_id)
            log.warning(f"[{self.master_id}] could not request contract spec for {symbol_id}: {exc}")

    def _replay_pending(self) -> None:
        """A spec arriving can make a previously-unreadable position readable. Re-reconcile rather
        than replay stale bytes: reconcile is idempotent and is the same safety net the provider
        already runs on a timer."""
        try:
            self._request_reconcile()
        except Exception:
            pass
