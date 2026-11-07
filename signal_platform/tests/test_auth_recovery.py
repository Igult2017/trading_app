"""
test_auth_recovery.py — run with:
    cd signal_platform && python tests/test_auth_recovery.py

THE OUTAGE THIS GUARDS. Sat 07 Nov 2026, production, 1,556 times in 48 minutes — one every two
seconds, and it would not have stopped on its own:

    [ctrader_positions] broker answered 2142
      (ProtoOAErrorRes code='INVALID_REQUEST' desc='Trading account is not authorized')

The account's session on that socket had ended; the SOCKET stayed open, so `get_connection` kept
handing the dead session back for ever, and no module anywhere reacted to an error REPLY.

⚠ THE CHECKS THAT MATTER MOST ARE THE ONES THAT SAY *DON'T* RECONNECT. The previous cTrader outage
(D63) ran the other way round: being refused made the code open MORE connections. A rate limit, a
connection-limit refusal or maintenance answered with a fresh handshake is a storm, not a recovery.
So "an ordinary refusal does nothing" is tested harder here than "an auth refusal recovers".
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from data import ctrader_auth_state as auth          # noqa: E402

_pass = _fail = 0


def check(what, got, want):
    global _pass, _fail
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {what}" + ("" if ok else f": got {got!r}, want {want!r}"))
    if ok:
        _pass += 1
    else:
        _fail += 1


def teeth(what, broke_it_and_failed):
    global _pass, _fail
    print(f"  {'PASS' if broke_it_and_failed else 'FAIL'}  TEETH — {what}")
    if broke_it_and_failed:
        _pass += 1
    else:
        _fail += 1


print("\nLOSING BROKER AUTHORIZATION, AND ASKING FOR IT BACK\n")

# ── 1. the two events are what the PROTOBUF says, not what we remember ────────────────────────────
# Both were mislabelled in the code for months ("margin change", "trailing SL change"), and that
# wrong label is precisely why nobody noticed the outage. Read the installed protobuf, so the next
# mislabel fails here instead of rotting.
print("1. the event numbers come from the installed protobuf:")
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAPayloadType  # noqa: E402
from data import ctrader_session as sess                                           # noqa: E402

check("2147 is the token-invalidated event",
      ProtoOAPayloadType.Name(sess.PT_TOKEN_INVALIDATED),
      "PROTO_OA_ACCOUNTS_TOKEN_INVALIDATED_EVENT")
check("2164 is the account-disconnect event",
      ProtoOAPayloadType.Name(sess.PT_ACCOUNT_DISCONNECT),
      "PROTO_OA_ACCOUNT_DISCONNECT_EVENT")
teeth("and neither is still described as a margin or trailing-stop change",
      "margin change" not in sess._PUSH_NAMES.values()
      and "trailing SL change" not in sess._PUSH_NAMES.values())

# ── 2. the exact production refusal is recognised ─────────────────────────────────────────────────
print("\n2. the refusal that caused the outage is recognised:")
check("the real production pair, verbatim",
      auth.is_auth_failure("INVALID_REQUEST", "Trading account is not authorized"), True)
for code in ("ACCOUNT_NOT_AUTHORIZED", "CH_CLIENT_NOT_AUTHENTICATED", "CH_ACCESS_TOKEN_INVALID",
             "OA_AUTH_TOKEN_EXPIRED", "CH_CLIENT_AUTH_FAILURE"):
    check(f"{code} on its own", auth.is_auth_failure(code, ""), True)
check("the wording alone is enough, whatever the code says",
      auth.is_auth_failure("SOMETHING_NEW", "client is not authenticated"), True)
check("case and spelling do not decide it",
      auth.is_auth_failure("ch_access_token_invalid", ""), True)

# ── 3. ⚠ THE IMPORTANT HALF: an ordinary refusal must NOT reconnect ───────────────────────────────
print("\n3. refusals that must NEVER cause a reconnect:")
for code in ("REQUEST_FREQUENCY_EXCEEDED", "CHANNEL_IS_BLOCKED", "BLOCKED_PAYLOAD_TYPE",
             "CONNECTIONS_LIMIT_EXCEEDED", "SERVER_IS_UNDER_MAINTENANCE", "ALREADY_LOGGED_IN"):
    teeth(f"{code} is not an auth failure", auth.is_auth_failure(code, "") is False)
# The rate limit is the one that built the last storm, so it is tested with hostile wording too.
teeth("a rate limit is still refused even if its text mentions authorization",
      auth.is_auth_failure("REQUEST_FREQUENCY_EXCEEDED", "not authorized to send this often") is False)
for code in ("NO_QUOTES", "SYMBOL_NOT_FOUND", "POSITION_NOT_FOUND", "INCORRECT_BOUNDARIES"):
    teeth(f"{code} is left alone", auth.is_auth_failure(code, "") is False)
teeth("an empty error is not treated as a lost session", auth.is_auth_failure("", "") is False)

# ── 4. the floor, so a 2-second caller cannot hammer the broker ───────────────────────────────────
print("\n4. one re-login attempt per floor, not one per request:")
auth._reset_for_test()
check("nothing to do while authorized", auth.should_reauth(), False)
auth.mark_lost("test")
check("the flag is set", auth.is_lost(), True)
check("the first request after the loss reconnects", auth.should_reauth(), True)
teeth("and the next 30 requests do NOT",
      all(auth.should_reauth() is False for _ in range(30)))
check("the loss is still recorded while it waits", auth.is_lost(), True)

# Wind the clock back past the floor rather than sleeping 60 real seconds.
auth._last_attempt -= auth.REAUTH_FLOOR_S + 1
check("once the floor passes, it tries again", auth.should_reauth(), True)

print("\n5. the recovery clears it:")
auth.mark_authenticated()
check("no longer lost", auth.is_lost(), False)
check("and no reconnect is asked for", auth.should_reauth(), False)
teeth("a second success on an already-fine session is harmless",
      (auth.mark_authenticated(), auth.is_lost())[1] is False)

# ── 6. it is actually WIRED — the flag means nothing if nothing reads it ──────────────────────────
# `test_request_pacing.py` proves the send gate the same way: by reading the source, because the
# failure that matters is a call site that forgot, not a function that misbehaves.
print("\n6. the one reply gate and the one reconnect point are wired:")
src = (Path(__file__).resolve().parent.parent / "data/ctrader_session.py").read_text(encoding="utf-8")
body = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
recv_expect = body.split("async def recv_expect")[1].split("\ndef ")[0]
get_conn = body.split("async def get_connection")[1].split("\ndef ")[0]

check("recv_expect notices both pushes",
      "PT_TOKEN_INVALIDATED" in recv_expect and "PT_ACCOUNT_DISCONNECT" in recv_expect, True)
check("recv_expect inspects error replies too", "_note_if_unauthorized" in recv_expect, True)
check("get_connection asks whether to re-authenticate", "should_reauth()" in get_conn, True)
check("get_connection drops the dead socket first", "reset_connection()" in get_conn, True)
check("get_connection reports the recovery", "mark_authenticated()" in get_conn, True)
teeth("an open socket alone is no longer enough to be handed back",
      get_conn.index("should_reauth()") < get_conn.index("is_closing()"))

# ── 7. the re-login must not retry with the token that was just invalidated ───────────────────────
# `get_access_token` holds Node's token for 180s. The likeliest reason we were logged out is that
# Node ROTATED it — so the copy in hand is the very token cTrader just invalidated, and
# re-authenticating with it fails for up to three minutes while logging a misleading "account auth
# failed". The cache is therefore cleared on the re-auth path.
#
# ⚠ TESTED BY BEHAVIOUR, NOT BY READING THE LINE, because the trap here is invisible in the source:
# `_token_expiry = 0.0` inside a function that does not declare it `global` quietly makes a LOCAL
# float and changes nothing whatsoever. The assignment looks completely correct either way.
print("\n7. the re-login throws away the token that was just invalidated:")
import asyncio                                                                      # noqa: E402

sess._token_expiry, sess._access_token = 9_999_999.0, "the-rotated-token"
auth._reset_for_test()
auth.mark_lost("test: Node rotated the shared token")

_real_open = asyncio.open_connection


async def _refuse(*a, **k):
    raise OSError("no network in a test")


asyncio.open_connection = _refuse
try:
    asyncio.run(asyncio.wait_for(sess.get_connection(), timeout=5))
except Exception:
    pass          # the connect is meant to fail; the cache is what is under test
finally:
    asyncio.open_connection = _real_open

check("the cached token was discarded, so Node is re-read", sess._token_expiry, 0.0)
auth._reset_for_test()

print(f"\n{'ALL PASS' if _fail == 0 else f'{_fail} FAILED'} — {_pass + _fail} checks\n")
sys.exit(0 if _fail == 0 else 1)
