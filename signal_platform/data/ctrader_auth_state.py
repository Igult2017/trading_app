"""
Does the broker still consider this connection logged in — and may we log in again yet?

WHY THIS EXISTS — a real outage, Sat 07 Nov 2026. Production logged this 1,556 times in 48 minutes,
one every two seconds, and would have gone on until the process was restarted:

    [ctrader_positions] broker answered 2142
      (ProtoOAErrorRes code='INVALID_REQUEST' desc='Trading account is not authorized')

The chain: Node refreshes the SHARED cTrader token (autoSyncService.ts:88, :196) -> cTrader ends the
account's session on every OTHER connection and pushes ProtoOAAccountsTokenInvalidatedEvent
(docs/ctrader-open-api-apps.md:92 — "Fires on: ... token refreshed ...") -> `recv_expect` stepped
over that notice with a log.debug, invisible at INFO -> the SOCKET was still open, so
`get_connection` kept handing the dead session back (it only re-authenticates when the socket is
CLOSED) -> every request refused, for ever. Not one module recovered: `grep -rn reset_connection`
found three lines in the whole platform, all in the candle fetcher and all on EXCEPTION paths, so an
error REPLY never reset anything.

⚠ THE MOST IMPORTANT LINE IN THIS FILE IS `_NEVER`. The previous outage ran the other way: being
refused made the code open MORE connections (D63). A rate limit, a connection-limit refusal or
maintenance must NEVER reconnect — that is how a 2-second loop becomes a storm. Reconnecting is only
ever the answer to "you are not logged in".
"""

import logging
import time

log = logging.getLogger(__name__)

# Minimum seconds between re-login attempts. A genuinely dead token must not turn the 2-second
# position tracker into 30 handshakes a minute; one a minute is plenty to recover from a token
# refresh, which is the case this is built for.
REAUTH_FLOOR_S = 60.0

# cTrader's own names for "this session is not logged in". From the installed protobuf's
# ProtoOAErrorCode, plus the bare ACCESS_TOKEN_INVALID the gateway also sends.
_AUTH_CODES = frozenset({
    "ACCOUNT_NOT_AUTHORIZED", "CH_CLIENT_NOT_AUTHENTICATED", "CH_ACCESS_TOKEN_INVALID",
    "ACCESS_TOKEN_INVALID", "OA_AUTH_TOKEN_EXPIRED", "CH_CLIENT_AUTH_FAILURE",
})

# The wording must be read as well as the code. The outage above arrived as
# errorCode='INVALID_REQUEST' — which is not in that enum at all — and `errorCode` is a free-form
# STRING field on ProtoOAErrorRes (field type 9, verified against the installed protobuf), so the
# broker is not limited to the names it publishes. The description is where the truth was.
_AUTH_PHRASES = ("not authorized", "not authorised", "not authenticated")

# ⚠ REFUSALS THAT MUST NOT CAUSE A RECONNECT, whatever their wording. Every one of these gets WORSE
# if answered with a fresh handshake.
_NEVER = frozenset({
    "REQUEST_FREQUENCY_EXCEEDED",   # the rate limit — reconnecting is what built D63's storm
    "CHANNEL_IS_BLOCKED", "BLOCKED_PAYLOAD_TYPE",
    "CONNECTIONS_LIMIT_EXCEEDED",   # too many sockets already; opening one more cannot help
    "SERVER_IS_UNDER_MAINTENANCE",  # nothing to log back into
    "ALREADY_LOGGED_IN",            # another connection holds it; retrying just ping-pongs
})

_lost_reason: str = ""
_last_attempt: float = 0.0
_last_log: float = 0.0


def is_auth_failure(error_code: str, description: str = "") -> bool:
    """Does this refusal mean we are no longer logged in (as opposed to simply refused)?"""
    code = (error_code or "").strip().upper()
    if code in _NEVER:
        return False
    if code in _AUTH_CODES:
        return True
    text = (description or "").lower()
    return any(p in text for p in _AUTH_PHRASES)


def mark_lost(reason: str) -> None:
    """Record that authorization is gone. Logged at WARNING on the first sight and then at most once
    per floor, so a 2-second caller reports the problem without burying the log in it."""
    global _lost_reason, _last_log
    first, now = not _lost_reason, time.monotonic()
    _lost_reason = reason or "unknown"
    if first or now - _last_log >= REAUTH_FLOOR_S:
        _last_log = now
        log.warning("[ctrader] AUTHORIZATION LOST — %s; will re-authenticate on the next request "
                    "(at most once per %.0fs)", _lost_reason, REAUTH_FLOOR_S)


def should_reauth() -> bool:
    """True when the session is known dead and the floor has passed. STAMPS the attempt, so two
    callers cannot both decide to reconnect. Call it only where the reconnect actually happens —
    `get_connection`, which holds `_conn_lock`."""
    global _last_attempt
    if not _lost_reason:
        return False
    now = time.monotonic()
    if now - _last_attempt < REAUTH_FLOOR_S:
        return False
    _last_attempt = now
    return True


def mark_authenticated() -> None:
    """A handshake succeeded. Says so when it follows a loss — the recovery has to be visible in the
    log, or there is no way to tell a fix from a silence."""
    global _lost_reason
    if _lost_reason:
        log.warning("[ctrader] authorization regained after %s", _lost_reason)
        _lost_reason = ""


def is_lost() -> bool:
    return bool(_lost_reason)


def _reset_for_test() -> None:
    global _lost_reason, _last_attempt, _last_log
    _lost_reason, _last_attempt, _last_log = "", 0.0, 0.0
