"""
cTrader executor — places / closes / modifies orders on follower accounts
via the cTrader Open API (TCP/protobuf).

Each call opens a short-lived authenticated connection, resolves the symbol id
(opens only — cTrader orders use a numeric symbolId, not a name), sends the
command, waits for the fill (or error), then disconnects.
"""
import asyncio
import logging
import re
from dataclasses import dataclass

from ctrader_open_api import Client, Protobuf, TcpProtocol
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOASymbolsListReq, ProtoOASymbolsListRes,
    ProtoOASymbolByIdReq, ProtoOASymbolByIdRes,
    ProtoOANewOrderReq, ProtoOAClosePositionReq,
    ProtoOAAmendPositionSLTPReq, ProtoOAExecutionEvent,
    ProtoOAReconcileReq, ProtoOAReconcileRes,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAOrderType, ProtoOAExecutionType

import symbol_details
from lot_calc import volume_for
from config import CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT

log = logging.getLogger("executor.ctrader")

# Only a genuine FILL confirms success; these executionTypes are terminal failures
# (resolved immediately instead of waiting out the 20s timeout). Built defensively so a
# missing enum name in a library version is simply skipped, never a crash.
_FILLED_TYPE = ProtoOAExecutionType.ORDER_FILLED
_FAIL_TYPES  = {getattr(ProtoOAExecutionType, n)
                for n in ("ORDER_REJECTED", "ORDER_CANCELLED", "ORDER_EXPIRED")
                if hasattr(ProtoOAExecutionType, n)}

# Canonical (telegram-side) symbol -> equivalent broker spellings. Used ONLY as a
# fallback when the exact canonical name is absent from the follower's symbol list;
# exact match is always tried first and wins. Bidirectional: every alias also maps
# back to the canonical so a broker listing the canonical form still matches.
_SYMBOL_ALIASES = {
    "XAUUSD": ("GOLD",),
    "XAGUSD": ("SILVER",),
    "US30":   ("DJ30", "US30.cash", "WS30"),
    "NAS100": ("USTEC", "NAS100.cash", "US100"),
    "SPX500": ("US500",),
    "XTIUSD": ("WTI", "USOIL"),
}
# Flatten to a lookup of every name -> the full equivalence group (incl. itself).
_ALIAS_GROUPS: dict[str, set[str]] = {}
for _canon, _alts in _SYMBOL_ALIASES.items():
    _group = {_canon, *_alts}
    for _name in _group:
        _ALIAS_GROUPS.setdefault(_name.upper(), set()).update(_group)

# Strip a trailing broker suffix (EURUSD.r, EURUSD+, EURUSD#, EURUSD-ECN) or a
# leading broker prefix (.mEURUSD) so cores can be compared case-insensitively.
_BROKER_SUFFIX_RE = re.compile(r"([._\-+#!]+[A-Z0-9]{1,6}|[+#!]+)$", re.IGNORECASE)
_BROKER_PREFIX_RE = re.compile(r"^([._\-+#!]+[A-Z0-9]{0,4}\.?)", re.IGNORECASE)


def _strip_affixes(name: str) -> str:
    """Lower-cased core of a broker symbol with a trailing suffix / leading prefix removed."""
    s = name.strip()
    s = _BROKER_PREFIX_RE.sub("", s)
    s = _BROKER_SUFFIX_RE.sub("", s)
    return s.upper()


def resolve_symbol_id(symbol: str, symbol_map: dict[str, int]) -> int | None:
    """Map a canonical symbol to the follower account's numeric symbolId.

    EXACT match is tried FIRST and wins. Only on a miss do we fall back to:
      (a) case-insensitive comparison with a broker suffix/prefix stripped, then
      (b) a small canonical<->broker alias table (also affix-tolerant).
    Returns None when nothing matches.
    """
    # (0) Exact match — the original, fast path. Never bypassed.
    sid = symbol_map.get(symbol)
    if sid is not None:
        return sid

    want_core = _strip_affixes(symbol)

    # (a) Case-insensitive + affix-stripped comparison against the account's symbols.
    for name, mid in symbol_map.items():
        if _strip_affixes(name) == want_core:
            return mid

    # (b) Alias table: build the set of acceptable cores for this symbol, then match.
    group = _ALIAS_GROUPS.get(symbol.upper()) or _ALIAS_GROUPS.get(want_core)
    if group:
        want_cores = {_strip_affixes(g) for g in group}
        for name, mid in symbol_map.items():
            if _strip_affixes(name) in want_cores:
                return mid
    return None


@dataclass
class ExecResult:
    ok:          bool
    external_id: str | None = None
    entry_price: float | None = None
    error:       str | None = None


class CTraderExecutor:
    """One-shot executor for a follower's cTrader account."""

    def __init__(self, creds: dict, account_type: str):
        self.creds        = creds
        self.account_type = account_type
        self._result_future: asyncio.Future | None = None
        self._client: Client | None = None
        self._pending_cmd = None
        self._symbol_map: dict[str, int] = {}   # symbolName → symbolId
        self._modify_filled = False             # guard: reconcile→fill done once

    def _make_client(self) -> Client:
        # Only "demo" uses the demo gateway; live AND funded/prop accounts are live.
        host = CT_DEMO_HOST if self.account_type == "demo" else CT_LIVE_HOST
        c = Client(host, CT_PORT, TcpProtocol)
        c.setConnectedCallback(self._on_connected)
        c.setMessageReceivedCallback(self._on_message)
        return c

    # ── Public API ─────────────────────────────────────────────────────────────

    async def open_position(self, symbol: str, action: str,
                            volume_lots: float, sl: float | None,
                            tp: float | None) -> ExecResult:
        self._pending_cmd = ("open", symbol, action, volume_lots, sl, tp)
        return await self._run()

    async def close_position(self, position_id: int, volume_lots: float,
                             symbol: str = "") -> ExecResult:
        # `symbol` is required to size the close: volume is per-symbol (lotSize), and a close sized
        # from the wrong contract UNDER-closes and strands the remainder on the follower's account.
        # Optional in the signature so older callers still import, but a close without it refuses.
        self._pending_cmd = ("close", position_id, volume_lots, symbol)
        return await self._run()

    async def modify_position(self, position_id: int,
                              sl: float | None, tp: float | None) -> ExecResult:
        self._pending_cmd = ("modify", position_id, sl, tp)
        return await self._run()

    # ── Internal ───────────────────────────────────────────────────────────────

    async def _run(self) -> ExecResult:
        loop = asyncio.get_event_loop()
        self._result_future = loop.create_future()
        self._client = self._make_client()
        self._client.startService()
        try:
            return await asyncio.wait_for(self._result_future, timeout=20)
        except asyncio.TimeoutError:
            return ExecResult(ok=False, error="Execution timed out")
        finally:
            self._client.stopService()

    def _resolve(self, result: ExecResult) -> None:
        if self._result_future and not self._result_future.done():
            self._result_future.set_result(result)

    def _on_connected(self, client):
        from config import ctrader_app_creds
        cid, csec = ctrader_app_creds(self.creds)   # the app that issued THIS account's tokens
        req = ProtoOAApplicationAuthReq()
        req.clientId     = cid
        req.clientSecret = csec
        client.send(req)

    def _on_message(self, client, message):
        ptype = message.payloadType

        if ptype == ProtoOAApplicationAuthRes().payloadType:
            req = ProtoOAAccountAuthReq()
            req.ctidTraderAccountId = int(self.creds["ctraderId"])
            req.accessToken         = self.creds["accessToken"]
            client.send(req)

        elif ptype == ProtoOAAccountAuthRes().payloadType:
            # Opens need a numeric symbolId → fetch the symbol list first.
            # A MODIFY that omits a field (SL or TP is None) means "leave that
            # protection untouched" — but the cTrader amend request REPLACES the
            # position's SL/TP wholesale (an unset field clears it). So we first
            # reconcile to read the position's current SL/TP and back-fill the
            # missing side; only when BOTH fields are supplied do we skip reconcile
            # and send straight away (the cTrader live-copy path, unchanged).
            # Close uses a positionId → send straight away.
            if self._pending_cmd and self._pending_cmd[0] in ("open", "close"):
                req = ProtoOASymbolsListReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                client.send(req)
            elif self._modify_needs_reconcile():
                req = ProtoOAReconcileReq()
                req.ctidTraderAccountId = int(self.creds["ctraderId"])
                client.send(req)
            else:
                self._send_command(client)

        elif ptype == ProtoOASymbolsListRes().payloadType:
            res = Protobuf.extract(message)
            self._symbol_map = {s.symbolName: s.symbolId for s in res.symbol}
            # The light list carries symbolId and name and NOTHING else — no lotSize, no
            # minVolume, no stepVolume. Ask for the full ProtoOASymbol before sizing anything.
            # OBSERVE-ONLY for now: the numbers are logged, not used (see _volume_audit).
            sid = self._cmd_symbol_id()
            if sid is not None and symbol_details.get(int(self.creds["ctraderId"]), sid) is None:
                client.send(symbol_details.build_request(int(self.creds["ctraderId"]), sid))
                return
            self._send_command(client)

        elif ptype == ProtoOASymbolByIdRes().payloadType:
            res = Protobuf.extract(message)
            symbol_details.absorb(int(self.creds["ctraderId"]), res)
            self._send_command(client)

        elif ptype == ProtoOAReconcileRes().payloadType:
            # Back-fill any missing SL/TP from the live position so None = unchanged.
            res = Protobuf.extract(message)
            self._backfill_modify(res)
            self._send_command(client)

        elif ptype == ProtoOAExecutionEvent().payloadType:
            event = Protobuf.extract(message)
            et = event.executionType
            # 1. Explicit error code → fail immediately.
            if event.HasField("errorCode") and event.errorCode:
                self._resolve(ExecResult(ok=False, error=f"cTrader: {event.errorCode}"))
                return
            # 2. Rejected / cancelled / expired → fail now (don't hang until timeout),
            #    even when no errorCode is set (the reason often lives in the order).
            if et in _FAIL_TYPES:
                try:
                    reason = ProtoOAExecutionType.Name(et)
                except Exception:
                    reason = str(et)
                self._resolve(ExecResult(ok=False, error=f"cTrader: {reason}"))
                return
            # 3. Only a genuine FILL (with a position) confirms success. Intermediate
            #    events (ORDER_ACCEPTED / PARTIAL) are ignored — wait for the fill.
            if et == _FILLED_TYPE and event.HasField("position"):
                pos = event.position
                self._resolve(ExecResult(
                    ok          = True,
                    external_id = str(pos.positionId),
                    entry_price = float(pos.price) if pos.price else None,
                ))

    def _cmd_symbol_id(self) -> int | None:
        """symbolId for a pending OPEN or CLOSE, once the light list has resolved it. Both need it:
        the open to size the entry, the close to size the exit."""
        cmd = self._pending_cmd
        if not cmd:
            return None
        if cmd[0] == "open":
            return resolve_symbol_id(cmd[1], self._symbol_map)
        if cmd[0] == "close" and len(cmd) > 3 and cmd[3]:
            return resolve_symbol_id(cmd[3], self._symbol_map)
        return None

    def _volume(self, symbol: str, lots: float) -> tuple[int, str | None]:
        """Lots -> the wire `volume`, from the BROKER's contract spec. (volume, refusal_reason).

        This replaced `max(1, int(lots * 100))`. cTrader documents `volume` as "Volume in cents
        (e.g. 1000 in protocol means 10.00 units)", so one lot of a 100,000-unit forex symbol is
        10,000,000 — the old expression sent 100, i.e. 1.00 unit, 100,000x under and below every
        realistic minVolume. lot_calc.volume_for does the conversion AND validates the result
        against the broker's own minVolume/maxVolume/stepVolume, so a units mistake in either
        direction refuses instead of trading.
        """
        sid = resolve_symbol_id(symbol, self._symbol_map) if symbol else None
        spec = symbol_details.describe(
            symbol_details.get(int(self.creds["ctraderId"]), sid) if sid else None)
        volume, refusal = volume_for(spec, lots)
        if refusal:
            log.error(f"[executor] {symbol} {lots} lots REFUSED — {refusal}")
        else:
            log.info(f"[executor] {symbol} {lots} lots -> volume {volume} "
                     f"(lotSize {spec['lot_size']}, step {spec['step']}, min {spec['min_volume']})")
        return volume, refusal

    def _modify_needs_reconcile(self) -> bool:
        """A modify with a missing SL or TP needs the position's current values first.
        Done at most once (guard) so a re-entrant reconcile can't loop."""
        cmd = self._pending_cmd
        if not cmd or cmd[0] != "modify" or self._modify_filled:
            return False
        _, _pos_id, sl, tp = cmd
        return sl is None or tp is None

    def _backfill_modify(self, reconcile_res) -> None:
        """Fill any None SL/TP on a pending modify from the live position so an omitted
        field is LEFT UNCHANGED instead of cleared. Mutates self._pending_cmd."""
        self._modify_filled = True
        cmd = self._pending_cmd
        if not cmd or cmd[0] != "modify":
            return
        _, pos_id, sl, tp = cmd
        for pos in reconcile_res.position:
            if pos.positionId == int(pos_id):
                cur_sl = float(pos.stopLoss)   if pos.stopLoss   else None
                cur_tp = float(pos.takeProfit) if pos.takeProfit else None
                if sl is None:
                    sl = cur_sl                # leave existing SL untouched
                if tp is None:
                    tp = cur_tp                # leave existing TP untouched
                break
        self._pending_cmd = ("modify", pos_id, sl, tp)

    def _send_command(self, client):
        cmd = self._pending_cmd
        acct_id = int(self.creds["ctraderId"])

        if cmd[0] == "open":
            _, symbol, action, lots, sl, tp = cmd
            symbol_id = resolve_symbol_id(symbol, self._symbol_map)
            if symbol_id is None:
                self._resolve(ExecResult(ok=False, error=f"Symbol {symbol} not on follower account"))
                return
            req = ProtoOANewOrderReq()
            req.ctidTraderAccountId = acct_id
            req.symbolId            = symbol_id
            req.orderType           = ProtoOAOrderType.Value("MARKET")
            req.tradeSide           = 1 if action == "BUY" else 2
            volume, refusal = self._volume(symbol, lots)
            if refusal:
                self._resolve(ExecResult(ok=False, error=refusal))
                return
            req.volume = volume
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)

        elif cmd[0] == "close":
            _, pos_id, lots, close_symbol = cmd
            req = ProtoOAClosePositionReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = int(pos_id)
            # The close path carried the IDENTICAL expression. Left alone it would close the wrong
            # quantity and strand the remainder of a position — worse than a bad open, because the
            # follower is left holding size they cannot see.
            volume, refusal = self._volume(close_symbol or "", lots)
            if refusal:
                self._resolve(ExecResult(ok=False, error=f"close: {refusal}"))
                return
            req.volume = volume
            client.send(req)

        elif cmd[0] == "modify":
            _, pos_id, sl, tp = cmd
            req = ProtoOAAmendPositionSLTPReq()
            req.ctidTraderAccountId = acct_id
            req.positionId          = int(pos_id)
            if sl: req.stopLoss   = sl
            if tp: req.takeProfit = tp
            client.send(req)
