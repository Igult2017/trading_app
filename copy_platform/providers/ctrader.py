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
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (
    ProtoOAExecutionType, ProtoOAOrderType, ProtoOAPositionStatus,
)

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

    @property
    def key(self) -> str:
        """What the master's row is filed under, and what a follower row is matched back to."""
        return str(self.position_id)


@dataclass
class OrderSnapshot:
    """A master ORDER — one that is resting, not yet a position.

    Separate from `PositionSnapshot` on purpose: an order has no entry price because it has not
    traded, and it has an `order_id` the follower's cancel must be matched against.
    """
    order_id:    int
    symbol:      str
    action:      str          # BUY | SELL
    volume_lots: float
    order_type:  str          # STOP | LIMIT | STOP_LIMIT | MARKET_RANGE
    price:       float        # where it rests
    stop_loss:   float | None
    take_profit: float | None

    @property
    def key(self) -> str:
        """THE ORDER ID, NOT A POSITION ID — the two are different numbers from the broker and a
        cancel sent against the wrong one either fails or hits somebody else's order."""
        return str(self.order_id)

    @property
    def entry_price(self) -> float:
        """Where it RESTS. An order has not traded, so this is the price it would fill at — which
        is what the risk distance to the stop must be measured from when sizing the mirror."""
        return self.price


# WHICH EXECUTION EVENTS DESCRIBE A RESTING ORDER, and what each one means to a copier. The broker
# sends all of these; until 2026-09-21 every one was thrown away because the handler asked only for
# `event.position` and a resting order has none.
_ORDER_EVENT = {
    ProtoOAExecutionType.ORDER_ACCEPTED:  "PLACED",
    ProtoOAExecutionType.ORDER_REPLACED:  "AMENDED",
    ProtoOAExecutionType.ORDER_CANCELLED: "CANCELLED",
    ProtoOAExecutionType.ORDER_EXPIRED:   "CANCELLED",
    ProtoOAExecutionType.ORDER_REJECTED:  "CANCELLED",
}

# ONLY ORDERS THAT OPEN A TRADE ARE MIRRORED. A stop-loss or take-profit is itself an order on this
# wire (`STOP_LOSS_TAKE_PROFIT`), and so is the order that closes a position (`closingOrder`).
# Mirroring either would place a second entry on the follower, so both are ignored here — the
# position path already carries closes and stop moves.
_ENTRY_ORDER_TYPES = {"STOP", "LIMIT", "STOP_LIMIT", "MARKET_RANGE"}


def _protection(pos, order, field: str) -> float | None:
    """A stop or target, read from the position, or from the order when the position has none yet.

    THE POSITION WINS WHEN IT HAS A VALUE, because it is the later truth: once the master moves a
    stop it moves on the position, while the order keeps the price it was placed with. The order is
    only consulted for the gap at the moment of a fill, when the position exists but its protection
    has not been attached to it yet. Protobuf gives an unset number as 0.0, so 0.0 means "not set" —
    never a real price for a stop.
    """
    on_pos = float(getattr(pos, field, 0.0) or 0.0)
    if on_pos:
        return on_pos
    on_order = float(getattr(order, field, 0.0) or 0.0) if order is not None else 0.0
    return on_order or None


class CTraderProvider:
    """Connects to cTrader for one master account and fires on_event callbacks."""

    def __init__(self, master_id: str, creds: dict, account_type: str,
                 on_event: OnEvent):
        self.master_id    = master_id
        self.creds        = creds
        self.account_type = account_type
        self.on_event     = on_event
        self._positions: dict[int, PositionSnapshot] = {}
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

    def _request_reconcile(self) -> None:
        """Periodic safety net — re-fetch open positions to catch missed closes."""
        if self._authed:
            try:
                req = ProtoOAReconcileReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                self.client.send(req)
            except Exception as e:
                log.warning(f"[{self.master_id}] reconcile request failed: {e}")
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
                        log.info(f"[{self.master_id}] reconcile: position {pid} closed externally")
                        asyncio.ensure_future(
                            self.on_event({"type": "CLOSE", "snap": prev}, self.master_id))
                # Track newly-seen positions silently — do NOT emit OPEN (the live
                # execution event already handles opens; avoids double-copying).
                for pid, snap in fresh.items():
                    self._positions.setdefault(pid, snap)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message)
            asyncio.ensure_future(self._handle_execution(event))

    # ── Event handling ─────────────────────────────────────────────────────────

    async def _handle_execution(self, event) -> None:
        # ── THE ORDER PATH, added 2026-09-21 ────────────────────────────────────────────────────
        # HIS OBSERVATION IS WHAT FOUND IT: *"if it was working then it would have copied that trade
        # which was not filled and later cancelled because it should mirror what is happening in
        # master exactly."* His XAU/USD order of 21 Sep was placed at 12:07 and cancelled at 12:10,
        # and the follower saw nothing.
        #
        # THE CAUSE WAS THREE LINES BELOW THIS ONE. The handler asked for `event.position` and
        # returned when there was none — and a RESTING ORDER HAS NO POSITION, so every order event
        # the broker sent was dropped at the door: accepted, amended, cancelled, expired, rejected.
        #
        # AND IT IS ALSO WHY NOTHING HAD COPIED FOR THREE WEEKS. VIX.1 attaches the stop when it
        # PLACES the order (`signal_platform/execution/orders.py:96`), so the stop rides on the
        # ACCEPTED event — the one we were throwing away. By the time the fill produced a position
        # the stop was not on it yet, risk-% sizing could not size the trade, and all twelve
        # decisions in the record read "can't size — the trade has no stop-loss".
        await self._handle_order(event)

        # ── THE POSITION PATH, unchanged ────────────────────────────────────────────────────────
        # Classify by the position's STATUS (open/closed) + our previous snapshot —
        # NOT executionType (ORDER_FILLED=3 fires for BOTH opens and closes, so the
        # old 2/3/4 code misclassified every fill).
        pos = event.position if event.HasField("position") else None
        if pos is None:
            return

        pid    = pos.positionId
        status = pos.positionStatus
        # THE ORDER IS PASSED IN, AND THAT IS THE WHOLE 2026-09-20 DEFECT FIXED AT ITS SOURCE. The
        # stop rides on the ORDER, not on the position, at the moment of a fill — so the position
        # alone reads stop-less and the copy is skipped for want of a risk distance. The order is on
        # THIS SAME MESSAGE; it was simply never read. What used to be here instead — hold the OPEN
        # back, ask the broker again, wait up to three reconciles — was chasing a number we already
        # had in hand, and it is deleted.
        snap   = self._snap(pos, event.order if event.HasField("order") else None)
        prev   = self._positions.get(pid)

        if status == ProtoOAPositionStatus.POSITION_STATUS_CLOSED:
            self._positions.pop(pid, None)
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
            if prev is None:
                self._positions[pid] = snap
                # THE MASTER'S ORDER ID TRAVELS WITH THE FILL, and the dispatcher needs it: if the
                # follower already has a mirrored order resting at this price, that order fills BY
                # ITSELF and sending a market order here would open the follower twice.
                oid = event.order.orderId if event.HasField("order") else None
                await self.on_event({"type": "OPEN", "snap": snap, "master_order_id": oid},
                                    self.master_id)
            elif prev.stop_loss != snap.stop_loss or prev.take_profit != snap.take_profit:
                self._positions[pid] = snap
                await self.on_event({"type": "MODIFY", "snap": snap, "prev": prev}, self.master_id)
            else:
                self._positions[pid] = snap   # volume/other change — track silently

    async def _handle_order(self, event) -> None:
        """A master ORDER: placed, amended or cancelled. Emits nothing for anything else.

        WHY A FILL EMITS NOTHING HERE. When the master's order fills, the follower's own mirrored
        order is resting at the same price and fills BY ITSELF — nothing needs to be sent. The
        position path below records that fill. Emitting here as well would open the follower twice.
        """
        et = event.executionType
        kind = _ORDER_EVENT.get(et)
        if kind is None or not event.HasField("order"):
            return
        order = event.order
        if order.closingOrder:
            return                      # the order that CLOSES a position — the position path owns it
        try:
            otype = ProtoOAOrderType.Name(order.orderType)
        except ValueError:
            return
        if otype not in _ENTRY_ORDER_TYPES:
            return                      # a stop-loss/take-profit is an order too — never mirrored

        snap = self._order_snap(order, otype)
        if snap is None:
            return
        log.info(f"[{self.master_id}] order {snap.order_id} {snap.symbol} {snap.action} "
                 f"{otype} @ {snap.price} sl {snap.stop_loss} tp {snap.take_profit} -> {kind}")
        await self.on_event({"type": kind, "order": snap}, self.master_id)

    def _order_snap(self, order, otype: str):
        """A master order as a copy event. None when its size cannot be read, never a guess."""
        td   = order.tradeData
        spec = symbol_details.describe(
            symbol_details.get(int(self.creds["ctraderId"]), td.symbolId))
        if not spec["known"]:
            self._want_spec(td.symbolId)
        lots = lots_from_volume(spec, td.volume)
        if lots <= 0:
            log.warning(f"[{self.master_id}] order {order.orderId}: no contract spec yet — size "
                        f"unreadable, nothing emitted")
            return None
        # WHERE IT RESTS depends on the kind: a stop order waits at `stopPrice`, a limit at
        # `limitPrice`. A stop-limit carries both and the STOP price is the trigger.
        price = float(order.stopPrice or 0.0) or float(order.limitPrice or 0.0)
        return OrderSnapshot(
            order_id    = order.orderId,
            symbol      = self._symbols.get(td.symbolId, str(td.symbolId)),
            action      = "BUY" if td.tradeSide == 1 else "SELL",
            volume_lots = lots,
            order_type  = otype,
            price       = price,
            stop_loss   = float(order.stopLoss)   if order.stopLoss   else None,
            take_profit = float(order.takeProfit) if order.takeProfit else None,
        )


    def _snap(self, pos, order=None) -> PositionSnapshot:
        """A master position as a copy event. `order`, when the message carries one, supplies the
        protection the position does not have yet.

        THE STOP IS ON THE ORDER AT THE MOMENT OF A FILL, NOT ON THE POSITION. That is the whole of
        the 2026-09-20 defect: every one of the twelve master events on record read stop-less, so
        risk-% sizing had no distance to size by, the per-trade cap had no risk to measure, and
        every single copy was skipped. The number was on the same message the entire time.

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
            stop_loss   = _protection(pos, order, "stopLoss"),
            take_profit = _protection(pos, order, "takeProfit"),
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
