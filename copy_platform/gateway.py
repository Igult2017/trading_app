"""TWO CONNECTIONS FOR THE WHOLE PLATFORM — one for demo accounts, one for live.

WHY THIS EXISTS, and it is not a tuning change, it is the wrong shape being made right. Until now
`dispatcher._get_executor` built a NEW `CTraderExecutor` for every follower on every event, and each
one connected, authenticated the application, authenticated the account, downloaded the account's
whole symbol list and then sent ONE order before disconnecting. Measured on his live account that
symbol list is **1,941 symbols, 312 KB** — per order. A hundred followers cost 31 MB and five
hundred handshakes to place a hundred orders.

SPOTWARE'S OWN GUIDANCE SAYS TO DO THE OPPOSITE
(https://help.ctrader.com/open-api/connection/):

    "At most, you should create two connections: one for demo accounts and one for live accounts.
     Each connection can support an unlimited number of accounts of a certain type."

So: one application auth per connection, then one `ProtoOAAccountAuthReq` per account on that SAME
socket, cached for the life of the connection. A thousand followers is still two connections.

ROUTING NEEDS NO INVENTION. Every message on the wire carries `ctidTraderAccountId` — verified
against the protobuf for `ProtoOAExecutionEvent`, `ProtoOANewOrderReq` and `ProtoOAAccountAuthReq`
— so replies and pushes for many accounts can share one socket and still be told apart.

⚠ THE TRAP THIS FILE IS BUILT AROUND. A long-lived shared socket carries PUSHES as well as replies.
`signal_platform/data/ctrader_session.py:182` records a real outage (2026-08-21) where one
unsolicited push was read as the answer to a request and desynchronised a shared socket
permanently — every later read was one message behind. That module reads sequentially and had to
skip pushes; THIS one is callback-driven (`setMessageReceivedCallback`), so nothing is ever "the
next message" and a push cannot be mistaken for a reply. What it needs instead is to match each
reply to the request that caused it, which is what `_waiters` does:

    a new order   -> matched by `clientOrderId`, which we set and cTrader echoes back on the
                     execution event (`ProtoOAOrder.clientOrderId`)
    amend/cancel  -> matched by `orderId`, which we already know
    a request/response pair (symbols, reconcile) -> matched by (account, payloadType)

RATE LIMITED TO THE BROKER'S OWN RULE. From https://help.ctrader.com/open-api/ : *"a maximum of 50
requests per second per connection for any non-historical data requests"*. It is per CONNECTION, and
we hold two, so this is the platform's real external ceiling — no amount of hosting lifts it. The
token bucket here keeps us just under it so we throttle ourselves instead of being throttled.

HEARTBEAT EVERY 8 SECONDS, because the documentation requires one "at least once every 10 seconds"
or the server disconnects an idle connection.
"""
import asyncio
import logging
import time

from ctrader_open_api import Client, Protobuf, TcpProtocol
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes,
    ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
)

from config import (CT_LIVE_HOST, CT_DEMO_HOST, CT_PORT, RECONNECT_DELAY,
                    CTRADER_REQS_PER_SEC, CTRADER_HEARTBEAT_SEC, ctrader_app_creds)

log = logging.getLogger("copy.gateway")


class _Bucket:
    """A token bucket holding the broker's documented request budget for ONE connection.

    Not a sleep-per-request: bursts are allowed up to one second's worth, which is what makes a
    fan-out fast, and only sustained load waits. `take()` returns when a token is available.
    """

    def __init__(self, per_sec: float):
        self.per_sec = max(1.0, per_sec)
        self._tokens = self.per_sec
        self._at = time.monotonic()
        self._lock = asyncio.Lock()

    async def take(self) -> None:
        async with self._lock:
            while True:
                now = time.monotonic()
                self._tokens = min(self.per_sec, self._tokens + (now - self._at) * self.per_sec)
                self._at = now
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                # how long until one token exists, never a fixed poll
                await asyncio.sleep((1.0 - self._tokens) / self.per_sec)


class Gateway:
    """One authenticated connection, shared by every account of one environment."""

    def __init__(self, account_type: str):
        # Only "demo" uses the demo gateway; live AND funded/prop accounts are live — the same
        # rule the providers and executors already use, kept identical on purpose.
        self.env = "demo" if (account_type or "").lower() == "demo" else "live"
        self.host = CT_DEMO_HOST if self.env == "demo" else CT_LIVE_HOST
        self._client: Client | None = None
        self._app_ready = asyncio.Event()
        self._accounts: dict[int, asyncio.Event] = {}   # ctidTraderAccountId -> authenticated
        self._waiters: dict[str, asyncio.Future] = {}   # correlation key -> the caller waiting
        self._bucket = _Bucket(CTRADER_REQS_PER_SEC)
        self._connect_lock = asyncio.Lock()
        self._hb_task: asyncio.Task | None = None
        self._creds_for_app: dict | None = None

    # ── connection ─────────────────────────────────────────────────────────────

    async def ensure(self, creds: dict) -> None:
        """Connected and application-authenticated. Safe to call on every request."""
        if self._app_ready.is_set() and self._client is not None:
            return
        async with self._connect_lock:
            if self._app_ready.is_set() and self._client is not None:
                return
            self._creds_for_app = creds
            self._client = Client(self.host, CT_PORT, TcpProtocol)
            self._client.setConnectedCallback(self._on_connected)
            self._client.setDisconnectedCallback(self._on_disconnected)
            self._client.setMessageReceivedCallback(self._on_message)
            self._client.startService()
            log.info("[gateway:%s] connecting to %s", self.env, self.host)
        await asyncio.wait_for(self._app_ready.wait(), timeout=30)

    def _on_connected(self, client):
        cid, csec = ctrader_app_creds(self._creds_for_app)
        req = ProtoOAApplicationAuthReq()
        req.clientId, req.clientSecret = cid, csec
        client.send(req)

    def _on_disconnected(self, client, reason):
        # EVERY ACCOUNT MUST RE-AUTHENTICATE. Keeping the old set would make the next order believe
        # it is authorised on a socket that has never seen it, and the broker would simply refuse.
        log.warning("[gateway:%s] disconnected (%s) — will re-authenticate on next use", self.env, reason)
        self._app_ready.clear()
        self._accounts.clear()
        self._client = None
        for fut in self._waiters.values():
            if not fut.done():
                fut.set_exception(ConnectionError("gateway disconnected"))
        self._waiters.clear()

    async def _heartbeat(self):
        """The docs require one at least every 10 seconds or an idle connection is dropped."""
        while True:
            await asyncio.sleep(CTRADER_HEARTBEAT_SEC)
            try:
                if self._client is not None and self._app_ready.is_set():
                    self._client.send(ProtoHeartbeatEvent())
            except Exception as exc:                 # a heartbeat must never kill the gateway
                log.debug("[gateway:%s] heartbeat failed: %s", self.env, exc)

    # ── accounts ───────────────────────────────────────────────────────────────

    async def authorise(self, creds: dict) -> int:
        """Authenticate ONE account on this shared connection. Cached; returns its id."""
        await self.ensure(creds)
        acct = int(creds["ctraderId"])
        ev = self._accounts.get(acct)
        if ev is not None:
            await asyncio.wait_for(ev.wait(), timeout=30)
            return acct
        ev = self._accounts[acct] = asyncio.Event()
        req = ProtoOAAccountAuthReq()
        req.ctidTraderAccountId = acct
        req.accessToken = creds["accessToken"]
        await self.send(req)
        try:
            await asyncio.wait_for(ev.wait(), timeout=30)
        except asyncio.TimeoutError:
            self._accounts.pop(acct, None)           # let the next attempt try again
            raise
        return acct

    # ── sending ────────────────────────────────────────────────────────────────

    async def send(self, req) -> None:
        """Send one message, inside the broker's documented request budget."""
        await self._bucket.take()
        if self._client is None:
            raise ConnectionError(f"[gateway:{self.env}] not connected")
        self._client.send(req)

    async def request(self, req, key: str, timeout: float = 20.0):
        """Send, and wait for the reply THAT THIS REQUEST CAUSED, matched by `key`.

        The key is what makes one socket safe for many callers: without it a reply for somebody
        else's order would resolve this caller's future. See the module docstring for which field
        is used for which verb.
        """
        fut = asyncio.get_running_loop().create_future()
        self._waiters[key] = fut
        try:
            await self.send(req)
            return await asyncio.wait_for(fut, timeout=timeout)
        finally:
            self._waiters.pop(key, None)

    def resolve(self, key: str, value) -> bool:
        """Hand a reply to whoever is waiting for it. True when somebody was."""
        fut = self._waiters.get(key)
        if fut is not None and not fut.done():
            fut.set_result(value)
            return True
        return False

    # ── receiving ──────────────────────────────────────────────────────────────

    def _on_message(self, client, message):
        ptype = message.payloadType
        if ptype == ProtoOAApplicationAuthRes().payloadType:
            self._app_ready.set()
            if self._hb_task is None or self._hb_task.done():
                self._hb_task = asyncio.ensure_future(self._heartbeat())
            log.info("[gateway:%s] application authenticated", self.env)
            return
        if ptype == ProtoOAAccountAuthRes().payloadType:
            res = Protobuf.extract(message)
            acct = int(res.ctidTraderAccountId)
            ev = self._accounts.get(acct)
            if ev is not None:
                ev.set()
            log.info("[gateway:%s] account %s authenticated (%d on this connection)",
                     self.env, acct, len(self._accounts))
            return
        # Everything else belongs to a caller. The executor registers the handler, because it owns
        # what a reply MEANS for each verb; the gateway only knows how to deliver it.
        for handler in list(self._handlers):
            try:
                if handler(self, message):
                    return
            except Exception:
                log.exception("[gateway:%s] handler raised on payloadType %s", self.env, ptype)

    _handlers: list = []

    @classmethod
    def add_handler(cls, fn) -> None:
        """Register a reply reader. Returns True from `fn` when it consumed the message."""
        if fn not in cls._handlers:
            cls._handlers.append(fn)


# ── the two connections, and only two ──────────────────────────────────────────
_gateways: dict[str, Gateway] = {}


def for_account(account_type: str) -> Gateway:
    """The shared connection this account belongs on. Creates it once, then reuses it for ever."""
    env = "demo" if (account_type or "").lower() == "demo" else "live"
    gw = _gateways.get(env)
    if gw is None:
        gw = _gateways[env] = Gateway(env)
    return gw


def stats() -> dict:
    """What the gateways are holding — for the diagnostics endpoint and the logs."""
    return {env: {"connected": gw._client is not None,
                  "app_authenticated": gw._app_ready.is_set(),
                  "accounts_authenticated": len(gw._accounts),
                  "requests_in_flight": len(gw._waiters)}
            for env, gw in _gateways.items()}
