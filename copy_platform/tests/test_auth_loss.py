"""THE COPIER MUST NOTICE IT HAS LOST ITS BROKER LOGIN — an open socket is not a logged-in session.

WHY THIS EXISTS. He asked, on 2026-11-07, why the copier had never worked. It has had four separate
faults, each genuinely fixed and none ever seen placing a copy. This is the one that was still open,
and it would have defeated all of the earlier fixes, because it stops the engine HEARING anything.

The detection side logs in as a strict chain — each step is sent only when the previous one succeeds
(`providers/ctrader._dispatch`). It reacted to exactly six kinds of message and THE CHAIN ENDED WITH
NO `else`, so everything else was dropped without even a debug line. Among the dropped:

    2142  the broker's refusal      — "Trading account is not authorized"
    2147  token invalidated         — "your session has ended"
    2164  account disconnected

Three silent deaths followed, and nothing could recover from any of them:

 1. A refusal anywhere in that chain stops it dead — and `_reconcile_scheduled` is never set, so the
    30-second safety net NEVER STARTS.
 2. `_authed`/`_connected` cleared only on a TCP DISCONNECT, and `needs_recycle()` asked only about
    the socket. A dead SESSION on a live SOCKET returned False for ever.
 3. The socket never drops: the installed `TcpProtocol` heartbeats by itself. No rescue.

The documented trigger is routine: Node refreshes the SHARED cTrader token, and cTrader ends that
account's session on every other connection and pushes 2147 (`docs/ctrader-open-api-apps.md:92`).

⚠ THE CHECKS THAT MATTER MOST HERE ARE THE ONES THAT SAY *DON'T* REBUILD. The other cTrader outage
(D63) was built the opposite way round: being refused made the code open MORE connections. A rate
limit answered with a fresh login is a storm, not a recovery. So "an ordinary refusal changes
nothing" is tested harder than "a login failure recovers".
"""
import asyncio
import os
import time

from _harness import Suite, repo_path
import auth_loss
from providers.ctrader import CTraderProvider

s = Suite("LOSING THE BROKER LOGIN — the copier must notice, and the supervisor must rebuild it")


def make_provider() -> CTraderProvider:
    """A real provider with no socket — `__init__` would open one, so its fields are set directly.
    Same approach as `test_provider_resilience.make_provider`; kept here so this file stands alone."""
    p = object.__new__(CTraderProvider)
    p.master_id = "test-master"
    p.creds = {"ctraderId": "123", "accessToken": "t"}
    p.account_type = "demo"
    p.on_event = lambda *a, **k: None
    p._positions = {}
    p._spec_requested = set()
    p._symbols = {1: "EURUSD"}
    p._authed = p._reconciled = p._reconcile_scheduled = False
    p._connected = True            # THE POINT OF THIS FILE: the socket is UP throughout
    p._disconnected_since = None
    p._auth_lost = ""
    p._connected_since = time.monotonic()
    p._stopped = False
    p._loop = asyncio.new_event_loop()
    p.client = None
    return p


class FakeError:
    """A ProtoOAErrorRes as the provider reads it — payloadType, errorCode, description."""

    def __init__(self, code, desc=""):
        self.payloadType = auth_loss.PT_OA_ERROR
        self.errorCode = code
        self.description = desc


class FakePush:
    def __init__(self, ptype):
        self.payloadType = ptype


# `Protobuf.extract` is the real library call in `_dispatch`; these fakes already ARE the decoded
# message, so extract is stubbed to hand them straight back. Nothing else is replaced — the method
# under test is the real one.
import providers.ctrader as prov
prov.Protobuf = type("P", (), {"extract": staticmethod(lambda m: m)})


# ── 1. THE TWO PUSHES THAT END A SESSION ────────────────────────────────────
print("\n1. the broker says the session is over:")

for ptype, label in ((auth_loss.PT_TOKEN_INVALIDATED, "token invalidated (2147)"),
                     (auth_loss.PT_ACCOUNT_DISCONNECT, "account disconnected (2164)")):
    p = make_provider()
    p._authed = True
    p._on_message(None, FakePush(ptype))
    s.check(f"{label} is noticed", bool(p._auth_lost), True)
    s.check(f"...{label} no longer counts as authenticated", p._authed, False)
    # THE CHECK THE OLD CODE COULD NOT PASS: the socket is still up, and it must STILL be rebuilt.
    s.check(f"...and it is recycled even though the socket is still open", p.needs_recycle(), True)

p = make_provider()
p._authed = True
p._on_message(None, FakePush(auth_loss.PT_TOKEN_INVALIDATED))
s.check("the socket really was up the whole time (so the old test would have said False)",
        p._connected, True)


# ── 2. THE REFUSAL THAT ACTUALLY APPEARED IN PRODUCTION ─────────────────────
print("\n2. the refusal that was logged 1,556 times in 48 minutes on the other platform:")

p = make_provider()
p._authed = True
p._on_message(None, FakeError("INVALID_REQUEST", "Trading account is not authorized"))
s.check("'INVALID_REQUEST' + 'Trading account is not authorized' is a lost login",
        bool(p._auth_lost), True)
s.check("...so the provider is rebuilt", p.needs_recycle(), True)
s.check("...and the reason is recorded, not just a flag",
        "not authorized" in p._auth_lost, True)


# ── 3. ⚠ THE IMPORTANT HALF — AN ORDINARY REFUSAL MUST CHANGE NOTHING ───────
print("\n3. refusals that must NOT cause a rebuild (this is how D63's storm was built):")

for code in ("REQUEST_FREQUENCY_EXCEEDED", "CHANNEL_IS_BLOCKED", "BLOCKED_PAYLOAD_TYPE",
             "CONNECTIONS_LIMIT_EXCEEDED", "SERVER_IS_UNDER_MAINTENANCE", "ALREADY_LOGGED_IN",
             "NO_QUOTES", "SYMBOL_NOT_FOUND"):
    p = make_provider()
    p._authed = True
    p._on_message(None, FakeError(code, "some description"))
    s.teeth(f"{code} leaves the connection alone",
            p._auth_lost == "" and p.needs_recycle() is False and p._authed is True)

# The rate limit with hostile wording — the one most likely to be misread.
p = make_provider()
p._authed = True
p._on_message(None, FakeError("REQUEST_FREQUENCY_EXCEEDED", "not authorized to send this often"))
s.teeth("a rate limit whose TEXT mentions authorization is still not a login failure",
        p._auth_lost == "" and p.needs_recycle() is False)

# An unknown push must be harmless — it is the common case, and it used to be the silent one.
p = make_provider()
p._authed = True
p._on_message(None, FakePush(2131))          # a spot price event
s.teeth("an ordinary unhandled push changes nothing",
        p._auth_lost == "" and p.needs_recycle() is False and p._authed is True)


# ── 4. THE OTHER SILENT DEATH: A LOGIN THAT NEVER FINISHED ──────────────────
# Connected, never authenticated, nothing scheduled, nothing logged — for ever. This is the state a
# provider sits in when the very first account login is refused, and it is why the 30-second safety
# net was never even started.
print("\n4. a login chain that never finished is caught too:")

p = make_provider()
s.check("not yet — a login is allowed time to complete", p.needs_recycle(), False)
p._connected_since = time.monotonic() - 121          # past the 120s grace
s.check("connected but never authenticated, past the grace period -> rebuild",
        p.needs_recycle(), True)
s.teeth("...and that is NOT just the socket test firing", p._connected is True)

p = make_provider()
p._authed = True
p._connected_since = time.monotonic() - 10_000       # logged in long ago, perfectly healthy
s.check("a healthy long-lived provider is never recycled", p.needs_recycle(), False)


# ── 5. REPORTED ONCE, NOT THIRTY TIMES A MINUTE ─────────────────────────────
print("\n5. the loss is recorded once, not on every refused request:")

p = make_provider()
p._authed = True
p._on_message(None, FakeError("INVALID_REQUEST", "Trading account is not authorized"))
first = p._auth_lost
p._on_message(None, FakeError("INVALID_REQUEST", "something else entirely"))
s.check("the first reason is kept, not overwritten by every later refusal", p._auth_lost, first)


# ── 5b. A REPLACED PROVIDER MUST NOT KEEP A TIMER RUNNING FOR EVER ──────────
# The 30-second safety net re-arms itself unconditionally, and it lives on the event loop rather
# than on the socket — so `stop()` ended the connection but NOT the chain, and every stopped
# provider left a callback firing every 30 seconds on an object nobody holds. Survivable while
# recycling was rare; this change makes recycling the normal recovery, so it would have multiplied
# a pre-existing leak once per lost login.
print("\n5b. a replaced provider's timer chain actually ends:")

rearmed = []
p = make_provider()
p._loop = type("L", (), {"call_later": staticmethod(lambda d, fn: rearmed.append(fn))})()
p._authed = False
p._request_reconcile()
s.check("a live provider re-arms the safety net", len(rearmed), 1)

p.client = type("C", (), {"stopService": staticmethod(lambda: None)})()
p.stop()
rearmed.clear()
p._request_reconcile()
s.teeth("a stopped provider does NOT re-arm it", len(rearmed) == 0)


# ── 6. ⚠ ONE LIST, OR THE DRIFT IS SILENT ───────────────────────────────────
# The identical judgement lives in `signal_platform/data/ctrader_auth_state.py`. It is NOT imported
# at runtime on purpose: the two platforms start from separate directories and a cross-platform
# import has already taken the whole order path down once
# (`signal_platform/data/ctrader_session.py:29-32`). So the values are duplicated and the drift is
# made unshippable here instead — a test-time dependency costs nothing in production.
print("\n6. the two copies of this judgement cannot drift apart:")

other = repo_path("signal_platform", "data", "ctrader_auth_state.py")
s.check("the other platform's copy is where this check expects it", os.path.exists(other), True)
src = open(other, encoding="utf-8").read()

ns: dict = {}
exec(compile(src, other, "exec"), ns)        # it imports only logging + time; nothing runs on import

s.check("the codes match exactly", set(auth_loss.AUTH_CODES), set(ns["_AUTH_CODES"]))
s.check("the refusals that must never reconnect match exactly",
        set(auth_loss.NEVER), set(ns["_NEVER"]))
s.check("the wording match exactly", set(auth_loss.AUTH_PHRASES), set(ns["_AUTH_PHRASES"]))
# And the two really do answer the same way, not merely hold the same lists.
cases = [("INVALID_REQUEST", "Trading account is not authorized"),
         ("REQUEST_FREQUENCY_EXCEEDED", ""), ("CH_ACCESS_TOKEN_INVALID", ""), ("NO_QUOTES", ""),
         ("", ""), ("ALREADY_LOGGED_IN", "not authorized")]
s.check("...and both answer every case identically",
        [auth_loss.is_auth_failure(c, d) for c, d in cases],
        [ns["is_auth_failure"](c, d) for c, d in cases])

s.done()
