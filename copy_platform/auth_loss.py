"""
Has this connection lost its broker login — and is this refusal the kind that means it?

WHY THIS EXISTS. The copier's detection side could lose its cTrader login, keep believing it had
one, and go permanently deaf WITH NO LOG LINE OF ANY KIND. Its login is a strict chain where each
step is triggered only by the previous step's success reply (`providers/ctrader.py:245-270`), it
reacted to exactly six kinds of message, and the chain ENDED WITH NO `else` — so the broker's
refusal (2142) and the two events that announce the end of a session (2147, 2164) were all dropped
in silence. `_authed` cleared only on a TCP disconnect, `needs_recycle()` asked only about the
socket, and the client library heartbeats by itself — so the socket never dropped and nothing ever
rescued it.

The documented trigger: Node refreshes the SHARED cTrader token, and cTrader ends that account's
session on every other connection and pushes 2147 — `docs/ctrader-open-api-apps.md:92`,
*"Fires on: ... token refreshed ..."*.

⚠ WHY THE LIST IS COPIED HERE RATHER THAN IMPORTED. The identical judgement lives in
`signal_platform/data/ctrader_auth_state.py`. Importing it would be the obvious way to keep one
truth — and it is the thing that must not be done: the two platforms are separate processes started
from separate directories (`start.sh:27` and `:52`), and a cross-platform import has already taken
the whole order path down once, recorded at `signal_platform/data/ctrader_session.py:29-32`
(*"`execution/broker.py` used to import the same three values from copy_platform, which does not
import from `cd /app/signal_platform` ... and took the entire order path down with it"*).

So the values are duplicated and the DRIFT IS MADE UNSHIPPABLE INSTEAD: a check in
`tests/test_auth_loss.py` reads the other file and fails if the two ever disagree. That is a
test-time dependency, which costs nothing in production, rather than a runtime one, which has
already cost an outage.
"""

# The two pushes that mean "your session has ended". Names verified against the installed protobuf
# (`ProtoOAPayloadType`), not from memory — they were mislabelled as a margin change and a trailing
# stop change in the other platform for months, and that wrong label is why a 48-hour-silent outage
# went unnoticed there.
PT_TOKEN_INVALIDATED = 2147    # ProtoOAAccountsTokenInvalidatedEvent
PT_ACCOUNT_DISCONNECT = 2164   # ProtoOAAccountDisconnectEvent
PT_OA_ERROR = 2142             # ProtoOAErrorRes — carries the real errorCode + description

AUTH_CODES = frozenset({
    "ACCOUNT_NOT_AUTHORIZED", "CH_CLIENT_NOT_AUTHENTICATED", "CH_ACCESS_TOKEN_INVALID",
    "ACCESS_TOKEN_INVALID", "OA_AUTH_TOKEN_EXPIRED", "CH_CLIENT_AUTH_FAILURE",
})

# The description must be read as well as the code. The real event arrived as
# errorCode='INVALID_REQUEST' — not in cTrader's published enum at all — because `errorCode` is a
# free-form STRING field on ProtoOAErrorRes. The reason was only in the description.
AUTH_PHRASES = ("not authorized", "not authorised", "not authenticated")

# ⚠ REFUSALS THAT MUST NEVER CAUSE A RECONNECT. Every one of these gets WORSE if answered with a
# fresh login, and answering a refusal with more connections is exactly what built the rate-limit
# storm (D63). This is the most important name in the file.
NEVER = frozenset({
    "REQUEST_FREQUENCY_EXCEEDED", "CHANNEL_IS_BLOCKED", "BLOCKED_PAYLOAD_TYPE",
    "CONNECTIONS_LIMIT_EXCEEDED", "SERVER_IS_UNDER_MAINTENANCE", "ALREADY_LOGGED_IN",
})


def is_auth_failure(error_code: str, description: str = "") -> bool:
    """Does this refusal mean we are no longer logged in (as opposed to simply refused)?"""
    code = (error_code or "").strip().upper()
    if code in NEVER:
        return False
    if code in AUTH_CODES:
        return True
    text = (description or "").lower()
    return any(p in text for p in AUTH_PHRASES)
