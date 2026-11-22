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

from ctrader_open_api import Client, Protobuf
from ctrader_protocol import OwnQueueProtocol, PER_SECOND   # each connection its OWN send queue (OPEN.md D68)
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOASymbolsListReq, ProtoOASymbolsListRes,
    ProtoOASymbolByIdReq, ProtoOASymbolByIdRes,
    ProtoOAReconcileReq, ProtoOAReconcileRes,
    ProtoOAExecutionEvent,
    ProtoOADealListReq, ProtoOADealListRes,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import (
    ProtoOAExecutionType, ProtoOAOrderType, ProtoOAPositionStatus,
)

from config import CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT, RECONNECT_DELAY, \
    RECONCILE_INTERVAL

import auth_loss
from timing import broker_ms   # the broker's own clock (plan step 9)
import lanes
import symbol_details
import ctrader_send   # every send handles a missing reply (OPEN.md D67)
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

# THE MARK THIS ENGINE PUTS ON EVERY ORDER IT PLACES. `mirror.mirror_label` builds it as
# "cp-<master order id>" and `executors/ctrader.place_pending` stamps it on both `label` and
# `clientOrderId`. Kept as a bare prefix here rather than imported, so reading a master's orders
# never pulls in the dispatcher (and its database) — the provider must stay able to run without it.
_OUR_COPY_PREFIX = "cp-"


def _reduced_fraction(before, after) -> float | None:
    """How much of a still-open position the master just closed (0-1), or None if it did not shrink."""
    try:
        before, after = float(before or 0), float(after or 0)
    except (TypeError, ValueError):
        return None
    if before <= 0 or after <= 0 or after >= before - 1e-9:
        return None
    return (before - after) / before


def _is_our_own_copy(order) -> bool:
    """Did THIS engine place this order? Then it is a copy, not a master trade to be copied on.

    Checked on both fields because they are set together and either alone is enough to be sure; a
    broker that truncates one still leaves the other readable.
    """
    return any(str(v or "").startswith(_OUR_COPY_PREFIX)
               for v in (getattr(order.tradeData, "label", ""), getattr(order, "clientOrderId", "")))


def _is_our_own_copy_position(pos, order=None) -> bool:
    """Is this TRADE one this engine placed? Its label travels from the order onto the position (`mirror.mirror_label`
    and `executors/ctrader.open_position` stamp "cp-…"); the order on the same message is checked too."""
    if str(getattr(getattr(pos, "tradeData", None), "label", "") or "").startswith(_OUR_COPY_PREFIX):
        return True
    return order is not None and _is_our_own_copy(order)


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
        # WHY THE LOGIN NEEDS ITS OWN STATE, separate from the socket's. The socket being up was
        # treated as proof we were logged in, and it is not: cTrader can end the account's session
        # and leave the connection open. `_auth_lost` is the broker saying so; `_connected_since`
        # is how the OTHER silent death is caught — a login chain that never finished at all, which
        # also means the 30-second safety net never started.
        self._auth_lost: str = ""
        self._connected_since: float | None = None
        self._stopped     = False
        self._loop        = asyncio.get_running_loop()

        # ON THE POOL (21 Nov 2026, `docs/copy-realtime-plan.md` step 4) the master owns no socket: its account is
        # logged in on a shared long-lived connection and that connection hands it this account's messages. 500
        # masters are then a few connections, not 500. `COPY_USE_POOL` decides; off = its own connection, as before.
        import pool as _pool
        self._pooled = _pool.enabled_for(account_type)
        self._unlisten = None
        if self._pooled:
            self.client = None
            return
        # Only "demo" uses the demo gateway; live AND funded/prop accounts are live.
        host = CT_DEMO_HOST if account_type == "demo" else CT_LIVE_HOST
        self.client = Client(host, CT_PORT, OwnQueueProtocol, numberOfMessagesToSendPerSecond=int(PER_SECOND))
        self.client.setConnectedCallback(self._on_connected)
        self.client.setDisconnectedCallback(self._on_disconnected)
        self.client.setMessageReceivedCallback(self._on_message)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    # WHAT THE REPAIR SWEEP READS (21 Nov 2026, `sweep.py`): resting order ids and when they were read, which order each
    # open position came from, and when this listener started. Defaults here so hand-built test providers have them.
    resting: set = set()
    read_at: float = 0.0
    started_at: float = 0.0
    # THE BOOK'S ORDER HALF (22 Nov 2026, `master_book.py`): each resting entry order as a snapshot, not just its id.
    _orders: dict | None = None
    _catching_up: bool = False

    def _book_orders(self) -> dict:
        if self._orders is None:
            self._orders = {}
        return self._orders

    @property
    def origin(self) -> dict:
        if getattr(self, "_origin", None) is None:
            self._origin = {}
        return self._origin

    def _lane(self) -> "lanes.Lanes":
        """Events about one trade run in order (21 Nov 2026, `lanes.py`). Made on first use, so every way a provider
        is built — including the tests' hand-built ones — has it."""
        if getattr(self, "_lanes", None) is None:
            self._lanes = lanes.Lanes()
        return self._lanes

    def start(self) -> None:
        self.started_at = time.time()
        if getattr(self, "_pooled", False):
            asyncio.ensure_future(self._start_pooled())
            return
        log.info(f"[{self.master_id}] connecting to cTrader Open API")
        self.client.startService()

    async def _start_pooled(self) -> None:
        """Log the account in on the pool, then run the SAME login chain from "account logged in" onward (symbols,
        open positions, the 30-second reconcile) — every rule after that point is unchanged."""
        import pool as _pool
        from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
        acct = int(self.creds["ctraderId"])
        self._connected, self._connected_since, self._disconnected_since = True, time.monotonic(), None
        try:
            conn = await _pool.POOL.connection(self.creds, self.account_type)
        except Exception as exc:
            self._note_auth_lost(f"pool login failed: {type(exc).__name__}: {exc}")
            return
        if self._stopped:
            return
        self.client = conn.client
        self._unlisten = conn.listen(acct, self._on_message, logins=True)
        log.info(f"[{self.master_id}] on the shared connection pool:{conn.env}#{conn.index} — loading symbols")
        res = ProtoOAAccountAuthRes(ctidTraderAccountId=acct)
        self._on_message(conn.client, ProtoMessage(payloadType=res.payloadType, payload=res.SerializeToString()))

    def stop(self) -> None:
        # ⚠ MARK IT STOPPED FIRST. `stopService()` ends the socket but NOT the reconcile timer
        # chain, which lives on the event loop and re-arms itself unconditionally — so every
        # stopped provider used to leave a callback firing every 30 seconds for the life of the
        # process, on an object nobody holds any more. That was survivable while recycling was
        # rare; it is not now that a lost login causes one, so it is closed here rather than left
        # as a leak this change would have multiplied.
        self._stopped = True
        if getattr(self, "_pooled", False):
            if self._unlisten:
                self._unlisten()           # the shared connection stays up for everyone else
            return
        self.client.stopService()

    def needs_recycle(self, max_down: float = 300.0, max_unauthed: float = 120.0) -> bool:
        """True when this provider must be torn down and rebuilt — the engine supervisor does it.

        ⚠ THE SOCKET USED TO BE THE ONLY QUESTION ASKED, and that is what made the copier's silence
        permanent. Three ways to be useless, not one:

        1. The socket is down and has been for a while — the original test.
        2. **The broker ENDED OUR SESSION while leaving the connection up.** Nothing here could see
           that: `_connected` stays True, so this returned False for ever while every request was
           refused and no trade was heard.
        3. **The login chain never finished.** It is strictly sequential — each step is sent only
           when the previous one succeeds (`_dispatch`) — so one refusal anywhere in it stops it
           dead, AND `_reconcile_scheduled` is never set, so the 30-second safety net never starts.
           Connected, not authenticated, nothing scheduled, nothing logged, for ever.

        WHY A REBUILD AND NOT A RECONNECT. `self.creds` was read when this provider was built, and
        after a token refresh it is STALE — reconnecting with it would fail identically, for ever.
        The supervisor's rebuild goes back through `get_creds` and re-reads the live token from the
        database (`engine.py:221`), which is the only path that actually recovers.

        ⚠ The supervisor's 90-second interval IS the brake on this. Nothing here may retry faster:
        answering a refusal with more connections is exactly what built the rate-limit storm (D63).
        """
        if self._auth_lost:
            return True
        if (self._connected and not self._authed and self._connected_since is not None
                and (time.monotonic() - self._connected_since) > max_unauthed):
            return True
        return (not self._connected and self._disconnected_since is not None
                and (time.monotonic() - self._disconnected_since) > max_down)

    def _note_auth_lost(self, reason: str) -> None:
        """The broker says we are not logged in. Recorded once, loudly; the supervisor acts on it."""
        if self._auth_lost:
            return                      # already known — do not repeat it every 30 seconds
        self._auth_lost = reason
        self._authed = False
        log.warning(f"[{self.master_id}] LOGIN LOST — {reason}. The connection is still open but the "
                    f"broker is no longer answering for this account; the supervisor will rebuild "
                    f"this provider with a freshly-read token.")

    def _request_reconcile(self) -> None:
        """Periodic safety net — re-fetch open positions to catch missed closes."""
        if self._stopped:
            return          # the chain ends here; this provider has been replaced
        if self._authed:
            try:
                req = ProtoOAReconcileReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                ctrader_send.send(self.client, req)
            except Exception as e:
                log.warning(f"[{self.master_id}] reconcile request failed: {e}")
        self._loop.call_later(RECONCILE_INTERVAL, self._request_reconcile)

    # ── Twisted callbacks ──────────────────────────────────────────────────────

    def _on_connected(self, client):
        self._connected = True
        self._disconnected_since = None
        self._connected_since = time.monotonic()   # starts the clock on "did the login finish?"
        from config import ctrader_app_creds
        cid, csec = ctrader_app_creds(self.creds)   # the app that issued THIS account's tokens
        req = ProtoOAApplicationAuthReq()
        req.clientId     = cid
        req.clientSecret = csec
        ctrader_send.send(client, req)

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
            ctrader_send.send(client, req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            self._authed = True
            log.info(f"[{self.master_id}] authenticated — loading symbols")
            req = ProtoOASymbolsListReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            ctrader_send.send(client, req)

        elif ptype == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(message)
            self._symbols = {s.symbolId: s.symbolName for s in res.symbol}
            # The light list gives names only. Reading a master's SIZE needs lotSize, which lives on
            # the full ProtoOASymbol — see _snap for the 100,000x bug that came of guessing it.
            # Fetched lazily per symbol, on first sight of a position in it.
            log.info(f"[{self.master_id}] {len(self._symbols)} symbols — requesting open positions")
            req = ProtoOAReconcileReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            ctrader_send.send(client, req)
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
            # WHAT THE MASTER HAS RESTING, AND WHEN IT WAS LAST READ (21 Nov 2026) — the repair sweep (`sweep.py`)
            # cancels a follower's copy order only when the master's order is gone from a FRESH read like this one.
            self.resting = {int(o.orderId) for o in getattr(res, "order", ())}
            self.read_at = time.monotonic()
            fresh: dict[int, PositionSnapshot] = {}
            for pos in res.position:
                if _is_our_own_copy_position(pos):
                    continue                      # a copy this engine placed is never a master trade (one hop)
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
            # ── THE CATCH-UP: EVERY DIFFERENCE BETWEEN WHAT WE REMEMBER AND WHAT THE MASTER HAS NOW (22 Nov 2026) ──
            # Replaces a SILENT first load (anything done while the copier was down never reached a follower — a master
            # close during a restart left the follower open) and a periodic compare of size and existence only (a missed
            # breakeven or a moved / cancelled pending order was never noticed). `master_book.diff` sends all seven
            # kinds of change; the book survives restarts on disk. Double copies stay impossible: the dispatcher refuses
            # a second OPEN for a position already open (`dispatcher.dispatch`), and a trade that came from a pending
            # order carries that order id, so a follower whose mirror filled is not entered again.
            fresh_orders = self._read_orders(res)
            unsized = [s for s in fresh.values() if s.volume_lots <= 0 and s.position_id not in self._positions]
            if fresh_orders is None or unsized:
                # A size cannot be read yet (its contract spec is on its way and re-drives this read). Nothing is
                # compared on a guess: a 0-lot trade would be copied as nothing and then never looked at again.
                log.info(f"[{self.master_id}] catch-up waits for a contract spec — nothing compared on a guess")
                return
            asyncio.ensure_future(self._catch_up(fresh, fresh_orders))

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message)
            # IN ORDER, PER TRADE (21 Nov 2026, `lanes.py`): a move, fill or close waits for the earlier events about
            # the same order/position, so it can never overtake a follower copy that is still being placed.
            self._lane().run(lanes.event_keys(event), lambda e=event: self._handle_and_remember(e))

        elif ptype == ProtoOADealListRes().payloadType:
            # The deals made during a gap — which pending order became which trade (`_fills`).
            fut = getattr(self, "_deals_wait", None)
            if fut is not None and not fut.done():
                fut.set_result(Protobuf.extract(message))

        # ── THE END OF THE SILENCE (added 2026-11-07) ───────────────────────────────────────────
        # This chain used to STOP HERE, with no `else`. Every other message the broker sent was
        # dropped without even a debug line — including the two that announce the end of a session
        # and the refusal that follows every request afterwards. That is why the copier could go
        # deaf for ever with an empty log, and why the log looked broken when it was merely correct
        # and had nothing to report.
        elif ptype in (auth_loss.PT_TOKEN_INVALIDATED, auth_loss.PT_ACCOUNT_DISCONNECT):
            name = ("token invalidated" if ptype == auth_loss.PT_TOKEN_INVALIDATED
                    else "account disconnected")
            self._note_auth_lost(f"broker pushed {name} ({ptype})")

        elif ptype == auth_loss.PT_OA_ERROR:
            # A refusal can say the same thing as those pushes, and in production that is how it
            # showed up at all: errorCode='INVALID_REQUEST' desc='Trading account is not authorized'.
            # ⚠ Only a LOGIN failure triggers a rebuild — a rate limit must not (see auth_loss.NEVER).
            res = Protobuf.extract(message)
            code = getattr(res, "errorCode", "") or ""
            desc = getattr(res, "description", "") or ""
            if auth_loss.is_auth_failure(code, desc):
                self._note_auth_lost(f"broker refused: {code!r} {desc!r}")
            else:
                log.warning(f"[{self.master_id}] broker error {code!r}: {desc!r} "
                            f"(not a login failure — connection kept)")

        else:
            # Named, not silent. Debug level because the ordinary push traffic is heavy and this is
            # a diagnostic of last resort, not a running commentary.
            log.debug(f"[{self.master_id}] unhandled message type {ptype}")

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

        # ⚠ A COPY TAKES ONE HOP — ON THE TRADE PATH TOO (22 Nov 2026). His rule (27 Sep): "a slave that copied a trade
        # from a master cannot act as a master for another slave for the trade it copied." It was enforced for ORDERS
        # only (`_handle_order` -> `_is_our_own_copy`); a FILLED MARKET COPY came on down here and was emitted as OPEN,
        # so on an account that is also a master it was copied onward. Reproduced 22 Nov with a real execution event
        # (label "cp-123" in, ["OPEN"] out). Every event about a trade this engine placed is ignored here.
        if _is_our_own_copy_position(pos, event.order if event.HasField("order") else None):
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
            await self.on_event({"type": "CLOSE", "snap": snap, "master_ms": broker_ms(event)}, self.master_id)

        elif status == ProtoOAPositionStatus.POSITION_STATUS_OPEN:
            if prev is None:
                self._positions[pid] = snap
                # THE MASTER'S ORDER ID TRAVELS WITH THE FILL, and the dispatcher needs it: if the
                # follower already has a mirrored order resting at this price, that order fills BY
                # ITSELF and sending a market order here would open the follower twice.
                oid = event.order.orderId if event.HasField("order") else None
                if oid:
                    self.origin[pid] = int(oid)     # which master ORDER this position came from — copies carry it
                await self.on_event({"type": "OPEN", "snap": snap, "master_order_id": oid, "master_ms": broker_ms(event)},
                                    self.master_id)
            else:
                self._positions[pid] = snap
                # A PARTIAL CLOSE IS COPIED, IN REAL TIME (his instruction, 15 Nov 2026: "partial
                # closes like partial take profits should also be copied in real time"). The master's
                # position stays open with less size; this was tracked silently, so the follower kept
                # the full size until the master closed the rest. Now the follower closes the SAME
                # FRACTION, on this pushed event.
                frac = _reduced_fraction(prev.volume_lots, snap.volume_lots)
                if frac:
                    await self.on_event({"type": "REDUCE", "snap": snap, "fraction": frac, "master_ms": broker_ms(event)},
                                        self.master_id)
                if prev.stop_loss != snap.stop_loss or prev.take_profit != snap.take_profit:
                    await self.on_event({"type": "MODIFY", "snap": snap, "prev": prev, "master_ms": broker_ms(event)},
                                        self.master_id)

    async def _handle_order(self, event) -> None:
        """A master ORDER: placed, amended or cancelled. Emits nothing for anything else.

        WHY A FILL EMITS NOTHING HERE. When the master's order fills, the follower's own mirrored
        order is resting at the same price and fills BY ITSELF — nothing needs to be sent. The
        position path below records that fill. Emitting here as well would open the follower twice.
        """
        et = event.executionType
        if event.HasField("order") and not event.order.closingOrder:
            oid = int(event.order.orderId)            # kept current between reads, for the repair sweep
            if et == ProtoOAExecutionType.ORDER_ACCEPTED:
                self.resting = set(self.resting) | {oid}
            elif et in (ProtoOAExecutionType.ORDER_CANCELLED, ProtoOAExecutionType.ORDER_EXPIRED,
                        ProtoOAExecutionType.ORDER_REJECTED, ProtoOAExecutionType.ORDER_FILLED):
                self.resting = set(self.resting) - {oid}
                self._book_orders().pop(oid, None)     # gone from the book too — a fill is a trade now
        kind = _ORDER_EVENT.get(et)
        if kind is None or not event.HasField("order"):
            return
        order = event.order
        if order.closingOrder:
            return                      # the order that CLOSES a position — the position path owns it
        if _is_our_own_copy(order):
            # ⚠ THIS IS THE RULE, not a safety net behind one. His words, 2026-09-27:
            #
            #   "a trade can only be copied directly from the master which is the origin. A
            #    slave that copied a trade from a master cannot act as a master for another
            #    slave for the trade it copied. A master can only be copied if the trade
            #    originated from it."
            #
            # An account can be a master AND somebody's follower at once - he wants that - so a
            # copy landing on it arrives here looking exactly like a trade its owner placed. This
            # mark is the only thing that tells the two apart. A copy takes ONE hop and stops.
            #
            # IT ALSO MAKES A RING HARMLESS BY CONSTRUCTION, which is why the ring check that
            # used to sit in `/api/copy/self-copy` is gone: a trade that can never be copied
            # twice can never come back round, however the accounts are wired.
            log.info(f"[{self.master_id}] order {order.orderId} carries our own copy label "
                     f"({order.tradeData.label!r}) — not copying a copy")
            return
        try:
            otype = ProtoOAOrderType.Name(order.orderType)
        except ValueError:
            return
        if otype not in _ENTRY_ORDER_TYPES:
            return                      # a stop-loss/take-profit is an order too — never mirrored

        snap = self._order_snap(order, otype)
        if snap is None:
            return
        if kind in ("PLACED", "AMENDED"):
            self._book_orders()[int(snap.order_id)] = snap     # the book follows the live order
        log.info(f"[{self.master_id}] order {snap.order_id} {snap.symbol} {snap.action} "
                 f"{otype} @ {snap.price} sl {snap.stop_loss} tp {snap.take_profit} -> {kind}")
        await self.on_event({"type": kind, "order": snap, "master_ms": broker_ms(event)}, self.master_id)

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
            ctrader_send.send(self.client, symbol_details.build_request(int(self.creds["ctraderId"]), symbol_id))
        except Exception as exc:
            self._spec_requested.discard(symbol_id)
            log.warning(f"[{self.master_id}] could not request contract spec for {symbol_id}: {exc}")

    # ── THE CATCH-UP (22 Nov 2026, `master_book.py`) ─────────────────────────────────────────────────────────────────

    def _read_orders(self, res) -> dict | None:
        """The master's resting ENTRY orders from a reconcile answer, as snapshots. An order whose size cannot be read
        keeps its remembered snapshot (never read as "cancelled"); a NEW one with no readable size -> None (wait)."""
        out = {}
        for o in getattr(res, "order", ()):
            if o.closingOrder or _is_our_own_copy(o):
                continue
            try:
                otype = ProtoOAOrderType.Name(o.orderType)
            except ValueError:
                continue
            if otype not in _ENTRY_ORDER_TYPES:
                continue
            oid, snap = int(o.orderId), self._order_snap(o, otype)
            if snap is None:
                snap = self._book_orders().get(oid)
                if snap is None:
                    return None
            out[oid] = snap
        return out

    async def _catch_up(self, fresh: dict, fresh_orders: dict) -> None:
        """Send every difference between the remembered book and the master's state now. Never raises."""
        import master_book
        from db_io import run_db
        if self._catching_up:
            return
        self._catching_up = True
        try:
            if not self._reconciled:
                book = await run_db(master_book.load, self.master_id)
                if book is None:
                    # A MASTER WE HAVE NEVER SEEN: what is already open is his history, not a trade to copy now.
                    self._positions, self._orders, self._reconciled = dict(fresh), dict(fresh_orders), True
                    log.info(f"[{self.master_id}] loaded {len(fresh)} open positions, {len(fresh_orders)} orders "
                             f"— first time seen, nothing copied")
                    await self._save_book()
                    return
                base_pos, base_ord = book
            else:
                base_pos, base_ord = dict(self._positions), dict(self._book_orders())
            before = (frozenset(self._positions), frozenset(self._book_orders()))
            new_pos = [p for p in fresh if p not in base_pos]
            gone_ord = [o for o in base_ord if o not in fresh_orders]
            filled_from = await self._fills(new_pos, gone_ord) if new_pos and gone_ord else {}
            if filled_from is None:
                return                  # the deals could not be read: nothing guessed, the next read tries again
            if self._reconciled and (frozenset(self._positions), frozenset(self._book_orders())) != before:
                return                  # a live event changed the book meanwhile — compared again on the next read
            events = master_book.diff(base_pos, base_ord, fresh, fresh_orders, filled_from)
            self._positions, self._orders, self._reconciled = dict(fresh), dict(fresh_orders), True
            for ev in events:
                key = (f"pos:{ev['snap'].position_id}" if ev.get("snap") is not None
                       else f"order:{ev['order'].order_id}")
                log.info(f"[{self.master_id}] catch-up: {ev['type']} {key} — a change made while its event was missed")
                self._lane().run([key], lambda e=ev: self.on_event(e, self.master_id))
            if events or not self._reconciled:
                await self._save_book()
        except Exception as exc:
            log.error(f"[{self.master_id}] catch-up failed: {type(exc).__name__}: {exc} — tried again on the next read",
                      exc_info=True)
        finally:
            self._catching_up = False

    async def _fills(self, new_pos: list, gone_ord: list) -> dict | None:
        """{position id: order id} for the new trades that came from vanished pending orders — read from the deals of
        the last 7 days (cTrader's longest window). None when the deals could not be read within 15 s."""
        req = ProtoOADealListReq()
        req.ctidTraderAccountId = int(self.creds["ctraderId"])
        now_ms = int(time.time() * 1000)
        req.fromTimestamp, req.toTimestamp, req.maxRows = now_ms - 7 * 86_400_000, now_ms, 1000
        self._deals_wait = self._loop.create_future()
        try:
            ctrader_send.send(self.client, req)
            res = await asyncio.wait_for(self._deals_wait, 15)
        except Exception as exc:
            log.warning(f"[{self.master_id}] could not read the deals for the catch-up: {exc}")
            return None
        finally:
            self._deals_wait = None
        want_pos, want_ord = set(new_pos), set(gone_ord)
        return {int(d.positionId): int(d.orderId) for d in getattr(res, "deal", ())
                if int(d.positionId) in want_pos and int(d.orderId) in want_ord}

    async def _save_book(self) -> None:
        import master_book
        from db_io import run_db
        try:
            await run_db(master_book.save, self.master_id, dict(self._positions), dict(self._book_orders()))
        except Exception as exc:
            log.warning(f"[{self.master_id}] could not save the master's book: {exc}")

    async def _handle_and_remember(self, event) -> None:
        """A live event, then the book written down — so a restart right after still knows it."""
        await self._handle_execution(event)
        if self._reconciled:
            await self._save_book()

    def _replay_pending(self) -> None:
        """A spec arriving can make a previously-unreadable position readable. Re-reconcile rather
        than replay stale bytes: reconcile is idempotent and is the same safety net the provider
        already runs on a timer."""
        try:
            self._request_reconcile()
        except Exception:
            pass
