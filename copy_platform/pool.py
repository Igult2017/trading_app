"""A POOL OF LONG-LIVED cTrader CONNECTIONS, MANY ACCOUNTS ON EACH — the copier's transport at scale.

THE IDEA (his order, 21 Nov 2026: *"use the api we have for over 2000 users"*). cTrader limits CONNECTIONS, not users:
50 requests/second per connection (https://help.ctrader.com/open-api/), and one connection carries any number of
logged-in accounts because every message names its account (`ctidTraderAccountId`). So accounts are spread over a few
connections — `COPY_ACCOUNTS_PER_CONN` each — all under our one application. Each connection logs the app in once and
each account once; after that a copy is ONE message. `docs/copy-realtime-plan.md` step 2.

THE FIVE FAULTS OF THE OLD `gateway.py` (`docs/copy-gateway-plan.md`), each closed here:
  1. pacing — `OwnQueueProtocol` writes at once within 45/s per connection; the library drains overflow at 45/s;
  2+3. leaks — ONE library client per connection for its whole life. On a drop the library reconnects that same client
     (it is a Twisted ClientService) and `_on_connected` logs the app and every account back in; nothing new is made;
  4. logouts — a refused login, "token invalidated" or "account disconnected" marks that account out; the next use
     logs it in again with the fresh credentials the caller brings (`cred_manager.get_creds`, never a second refresher);
  5. replies — every message is handed to the listeners of the account it names; whoever sent a command matches its
     own reply (`executors/ctrader._mine`). One command per account at a time (`account_lock`), so two commands for one
     account never read each other's replies.
"""
import asyncio
import logging
import os

import ctrader_send
from ctrader_open_api import Client, Protobuf
from ctrader_protocol import OwnQueueProtocol, PER_SECOND
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoHeartbeatEvent
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq, ProtoOAApplicationAuthRes, ProtoOAAccountAuthReq, ProtoOAAccountAuthRes,
    ProtoOAErrorRes, ProtoOAAccountsTokenInvalidatedEvent, ProtoOAAccountDisconnectEvent)

log = logging.getLogger("copy.pool")

ACCOUNTS_PER_CONN = max(1, int(os.environ.get("COPY_ACCOUNTS_PER_CONN", "50")))
# THE COPIER'S SHARE OF THE ONE cTRADER APP (22 Nov 2026, `usage.py`): the pool may hold at most this many connections;
# beyond it a new account goes on the least-loaded existing connection instead of opening another. With the copier's
# own-connection limit (COPY_OWN_CONNS, 3) the copier's total is 9 — the website (8) and the signal engine (3) make 20.
POOL_MAX_CONNS = max(1, int(os.environ.get("COPY_POOL_MAX_CONNS", "6")))
HEARTBEAT_S = 8.0                       # cTrader: "every 10 seconds"
_PT = {k: v().payloadType for k, v in dict(
    app=ProtoOAApplicationAuthRes, acct=ProtoOAAccountAuthRes, err=ProtoOAErrorRes,
    invalid=ProtoOAAccountsTokenInvalidatedEvent, gone=ProtoOAAccountDisconnectEvent).items()}


class Conn:
    """One long-lived connection carrying up to ACCOUNTS_PER_CONN accounts of one environment."""

    def __init__(self, env: str, host: str, port: int, index: int):
        self.env, self.host, self.port, self.index = env, host, port, index
        self.client: Client | None = None
        self.app_ready = asyncio.Event()
        self._app_creds: dict | None = None
        self.creds: dict[int, dict] = {}                 # accounts assigned to this connection
        self.authed: dict[int, asyncio.Event] = {}
        self.refused: dict[int, str] = {}
        self.pending: set[int] = set()                   # a login sent and not yet answered — never sent twice
        self.listeners: dict[int, list] = {}
        self.login_listeners: dict[int, list] = {}       # told when the account (re)logs in — master listeners
        self._hb: asyncio.Task | None = None

    def start(self, creds: dict) -> None:
        if self.client is not None:
            return                                       # ONE client for the life of the connection (faults 2-3)
        self._app_creds = creds
        self.client = Client(self.host, self.port, OwnQueueProtocol,
                             numberOfMessagesToSendPerSecond=int(PER_SECOND))
        self.client.setConnectedCallback(self._on_connected)
        self.client.setDisconnectedCallback(self._on_disconnected)
        self.client.setMessageReceivedCallback(self._on_message)
        self.client.startService()
        log.info("[pool:%s#%d] connecting to %s", self.env, self.index, self.host)

    def _on_connected(self, client):
        from config import ctrader_app_creds
        cid, csec = ctrader_app_creds(self._app_creds)
        ctrader_send.send(client, ProtoOAApplicationAuthReq(clientId=cid, clientSecret=csec))

    def _on_disconnected(self, client, reason):
        # THE SAME CLIENT RECONNECTS BY ITSELF. Everything logged in on it must log in again — mark them out.
        log.warning("[pool:%s#%d] disconnected (%s) — %d account(s) will log in again on reconnect",
                    self.env, self.index, getattr(reason, "value", reason), len(self.creds))
        self.app_ready.clear()
        self.pending.clear()
        for ev in self.authed.values():
            ev.clear()

    def _login(self, acct: int) -> None:
        c = self.creds.get(acct)
        if c is None or self.client is None or acct in self.pending:
            return
        self.pending.add(acct)
        self.refused.pop(acct, None)
        self.authed.setdefault(acct, asyncio.Event())
        d = ctrader_send.send(self.client, ProtoOAAccountAuthReq(ctidTraderAccountId=acct, accessToken=c["accessToken"]))
        if d is not None:
            d.addCallback(lambda msg, a=acct: self._login_reply(msg, a))

    def _login_reply(self, msg, acct: int):
        from executors.ctrader import is_too_many
        if is_too_many(msg) and acct in self.pending:    # too fast, not refused: log it in again in a moment
            self.pending.discard(acct)
            asyncio.get_event_loop().call_later(1.0, self._login, acct)
        return msg

    async def _heartbeat(self):
        while self.client is not None:
            await asyncio.sleep(HEARTBEAT_S)
            if self.app_ready.is_set():
                try:
                    ctrader_send.send(self.client, ProtoHeartbeatEvent())
                except Exception as exc:
                    log.debug("[pool:%s#%d] heartbeat failed: %s", self.env, self.index, exc)

    def _on_message(self, client, message):
        pt = message.payloadType
        if pt == _PT["app"]:
            self.app_ready.set()
            if self._hb is None or self._hb.done():
                self._hb = asyncio.ensure_future(self._heartbeat())
            # AFTER A RECONNECT, every account that was logged in goes back in — STAGGERED, 10 a second, not as one
            # burst (a busy machine flushes a burst in bunches). A first start logs nobody in here: `warm` / the first
            # use does, at its own pace.
            back = [a for a in self.creds if a in self.authed]
            log.info("[pool:%s#%d] application logged in — %d account(s) to log back in",
                     self.env, self.index, len(back))
            loop = asyncio.get_event_loop()
            for i, acct in enumerate(back):
                loop.call_later(i * 0.1, self._login, acct)
            return
        try:
            body = Protobuf.extract(message)
        except Exception:
            return
        acct = int(getattr(body, "ctidTraderAccountId", 0) or 0)
        if pt == _PT["acct"]:
            self.pending.discard(acct)
            if acct in self.authed:
                self.authed[acct].set()
            # BACK IN AFTER A GAP (22 Nov 2026, plan step 5): a follower's own news was not heard while it was out, so it
            # is checked — only if it holds a live copy (on a restart every follower logs in at once). A master's login
            # asks too; the check reads only follower accounts, so it is a no-op for him.
            try:
                import sweep
                sweep.request_check(acct, live_only=True)
            except Exception:
                pass
            # ONLY listeners that asked hear a login: a master reloads after a reconnect; a command in flight must
            # not restart its first step (it would send it twice).
            for fn in list(self.login_listeners.get(acct, ())):
                try:
                    fn(client, message)
                except Exception:
                    log.exception("[pool:%s#%d] login listener for %s raised", self.env, self.index, acct)
            return
        if pt == _PT["err"] and body.errorCode == "REQUEST_FREQUENCY_EXCEEDED":
            return                                       # handled by the reply tag (`_login_reply` / executor `_on_reply`)
        if pt == _PT["err"] and acct and acct in self.authed and not self.authed[acct].is_set():
            self.pending.discard(acct)
            self.refused[acct] = f"{body.errorCode} — {body.description}".strip(" —")
            self.authed[acct].set()                      # wake the waiter; `refused` says it failed
        if pt in (_PT["invalid"], _PT["gone"]):
            for a in (list(getattr(body, "ctidTraderAccountIds", [])) or [acct]):
                if a in self.authed:
                    self.authed[a].clear()
                    log.warning("[pool:%s#%d] account %s logged out by cTrader — logs in again on next use",
                                self.env, self.index, a)
        for fn in list(self.listeners.get(acct, ())):
            try:
                fn(client, message)
            except Exception:
                log.exception("[pool:%s#%d] listener for %s raised", self.env, self.index, acct)

    async def ensure_account(self, creds: dict, timeout: float = 30.0) -> None:
        acct = int(creds["ctraderId"])
        fresh = self.creds.get(acct, {}).get("accessToken") != creds.get("accessToken")
        self.creds[acct] = creds
        await asyncio.wait_for(self.app_ready.wait(), timeout)
        ev = self.authed.get(acct)
        if ev is None or not ev.is_set() or acct in self.refused or fresh:
            if ev is not None and (acct in self.refused or fresh):
                ev.clear()
            self._login(acct)                            # no-op when a login for it is already on its way
            await asyncio.wait_for(self.authed[acct].wait(), timeout)
        if acct in self.refused:
            raise PermissionError(f"cTrader refused the login for account {acct}: {self.refused[acct]}")

    def listen(self, acct: int, fn, logins: bool = False):
        """Hand every message for `acct` to `fn` until the returned function is called. `logins` = also its logins."""
        self.listeners.setdefault(acct, []).append(fn)
        if logins:
            self.login_listeners.setdefault(acct, []).append(fn)

        def stop():
            for book in (self.listeners, self.login_listeners):
                if fn in book.get(acct, []):
                    book[acct].remove(fn)
        return stop


class Pool:
    """Every connection of the copier. Accounts are placed on the least-loaded connection and stay there."""

    def __init__(self):
        # KEYED BY ENVIRONMENT AND APPLICATION. An account's tokens were issued by one of our apps (`config.ctrader_app_creds`)
        # and cTrader refuses it on a connection logged in as another, so each (env, app) has its own connections.
        self._conns: dict[tuple, list[Conn]] = {}
        self._home: dict[int, Conn] = {}
        self._locks: dict[int, asyncio.Lock] = {}

    def _conn_for(self, acct: int, env: str, app: str) -> Conn:
        c = self._home.get(acct)
        if c is not None:
            return c
        from config import CT_DEMO_HOST, CT_LIVE_HOST, CT_PORT
        conns = self._conns.setdefault((env, app), [])
        c = min((x for x in conns if len(x.creds) < ACCOUNTS_PER_CONN), key=lambda x: len(x.creds), default=None)
        if c is None and conns and self.count() >= POOL_MAX_CONNS:
            # AT THE COPIER'S CONNECTION LIMIT: share the least-loaded connection rather than open another.
            c = min(conns, key=lambda x: len(x.creds))
            log.warning("[pool:%s] at the %d-connection limit — account %s shares connection #%d (%d accounts)",
                        env, POOL_MAX_CONNS, acct, c.index, len(c.creds) + 1)
        if c is None:
            c = Conn(env, CT_DEMO_HOST if env == "demo" else CT_LIVE_HOST, CT_PORT, len(conns))
            conns.append(c)
        self._home[acct] = c
        return c

    async def connection(self, creds: dict, account_type: str) -> Conn:
        """The connection this account lives on — connected, the app logged in, the account logged in."""
        env = "demo" if (account_type or "").lower() == "demo" else "live"
        acct = int(creds["ctraderId"])
        from config import ctrader_app_creds
        c = self._conn_for(acct, env, ctrader_app_creds(creds)[0])
        c.creds.setdefault(acct, creds)
        c.start(creds)
        await c.ensure_account(creds)
        return c

    async def warm(self, accounts: list, per_conn_per_sec: float = 10.0) -> dict:
        """Log every account in AT START-UP, gently, so no copy ever waits for a login (plan step 3).

        `accounts` = [(creds, account_type)]. Each connection logs its own accounts in at `per_conn_per_sec`, all
        connections at once — 2,000 accounts on 40 connections is ~5 s. Returns {account: None | the refusal}."""
        by_conn: dict = {}
        for creds, kind in accounts:
            env = "demo" if (kind or "").lower() == "demo" else "live"
            from config import ctrader_app_creds
            acct = int(creds["ctraderId"])
            c = self._conn_for(acct, env, ctrader_app_creds(creds)[0])
            c.creds.setdefault(acct, creds)
            by_conn.setdefault(c, []).append(creds)
        out: dict = {}

        async def _one(c, creds_list):
            c.start(creds_list[0])
            for i, cr in enumerate(creds_list):
                await asyncio.sleep(0 if i == 0 else 1.0 / per_conn_per_sec)
                try:
                    await c.ensure_account(cr)
                    out[int(cr["ctraderId"])] = None
                except Exception as exc:
                    out[int(cr["ctraderId"])] = f"{type(exc).__name__}: {exc}"
        await asyncio.gather(*(_one(c, lst) for c, lst in by_conn.items()))
        return out

    def count(self) -> int:
        """Connections this pool has made."""
        return sum(1 for conns in self._conns.values() for c in conns if c.client is not None)

    def accounts(self) -> int:
        return len(self._home)

    def account_lock(self, acct: int) -> asyncio.Lock:
        return self._locks.setdefault(int(acct), asyncio.Lock())

    def stats(self) -> dict:
        return {f"{env}:{app[:6]}": [{"conn": c.index, "accounts": len(c.creds), "app": c.app_ready.is_set(),
                       "logged_in": sum(1 for e in c.authed.values() if e.is_set())} for c in conns]
                for (env, app), conns in self._conns.items()}


POOL = Pool()


def enabled_for(account_type: str) -> bool:
    """`COPY_USE_POOL`: off | demo | all. Demo first; live only after the demo proof (the plan's rule)."""
    mode = os.environ.get("COPY_USE_POOL", "off").strip().lower()
    return mode == "all" or (mode == "demo" and (account_type or "").lower() == "demo")
