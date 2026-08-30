"""
cTrader Open API — wire protocol + OAuth2 + authenticated TCP session.
Run auth_setup.py once to write .ctrader_token.json. Connects directly to
Spotware servers — no desktop terminal required.
Requires: app status = "Active" in the cTrader Portal.
"""

import asyncio
import json
import logging
import ssl
import struct
import time
from pathlib import Path
from typing import Optional

import httpx
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage, ProtoErrorRes
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq,
    ProtoOAAccountAuthReq,
    ProtoOAErrorRes,
)

log = logging.getLogger(__name__)

_TOKEN_URL  = "https://openapi.ctrader.com/apps/token"

# PUBLIC — this module owns "where cTrader lives" for the whole signal platform, so anything that
# opens its own connection reads these rather than restating them. `execution/broker.py` used to
# import the same three values from copy_platform, which does not import from
# `cd /app/signal_platform` (start.sh:27) and took the entire order path down with it.
HOSTS       = {"demo": "demo.ctraderapi.com", "live": "live.ctraderapi.com"}
PORT        = 5035
_MAX_BYTES  = 20 * 1024 * 1024
_TOKEN_FILE = Path(__file__).parent.parent / ".ctrader_token.json"

TYPE_APP_AUTH_RES, TYPE_ACCOUNT_AUTH_RES, TYPE_ERROR = 2101, 2103, 5
_HEARTBEAT_EVENT = 51   # ProtoOA keep-alive pushed unsolicited on the shared stream

_client_id = _client_secret = _env = ""
_account_id:    int = 0
_access_token:  str   = ""
_token_expiry:  float = 0.0
_refresh_backoff_until: float = 0.0
_reader: Optional[asyncio.StreamReader] = None
_writer: Optional[asyncio.StreamWriter] = None
_conn_lock  = asyncio.Lock()
_token_lock = asyncio.Lock()


def set_node_bridge(account_id: str, admin_secret: str, node_api_url: str) -> None:
    """Delegate to node_bridge module — kept here so startup_helpers imports one place."""
    from data.node_bridge import set_node_bridge as _set
    _set(account_id, admin_secret, node_api_url)


def configure(client_id: str, client_secret: str,
              account_id: int, env: str = "demo") -> None:
    global _client_id, _client_secret, _account_id, _env
    _client_id, _client_secret, _account_id, _env = client_id, client_secret, account_id, env
    log.info(f"[ctrader] configured — account {account_id} ({env})")


def _has_env_tokens() -> bool:
    from config.settings import settings
    return bool(settings.ctrader_access_token and settings.ctrader_refresh_token)


def is_configured() -> bool:
    return bool(_client_id and _client_secret and (_has_env_tokens() or _TOKEN_FILE.exists()))


def _read_tokens() -> dict:
    from config.settings import settings
    if settings.ctrader_access_token and settings.ctrader_refresh_token:
        return {
            "access_token":  settings.ctrader_access_token,
            "refresh_token": settings.ctrader_refresh_token,
        }
    try:
        return json.loads(_TOKEN_FILE.read_text())
    except Exception:
        return {}


def _write_tokens(data: dict) -> None:
    try:
        _TOKEN_FILE.write_text(json.dumps(data, indent=2))
    except OSError:
        pass
    new_rt = data.get("refresh_token", "")
    if new_rt:
        from config.settings import settings
        if settings.ctrader_refresh_token and new_rt != settings.ctrader_refresh_token:
            log.warning(
                "[ctrader] refresh token rotated — update CTRADER_REFRESH_TOKEN "
                f"in Coolify to: {new_rt}"
            )


async def get_access_token() -> str:
    """Single source of truth = NODE. The scanner READS Node's current cTrader access token
    (Node keeps it fresh, near-expiry + coalesced, for its own sync) and NEVER independently
    refreshes. An independent refresh here re-exchanged the refresh token on every boot, rotating
    the shared cTrader token and invalidating everyone — the scanner then auth'd with an already-
    rotated token and cTrader returned CH_ACCESS_TOKEN_INVALID, crash-looping the platform.
    Only Node mutates the token now; we just consume it."""
    global _access_token, _token_expiry
    async with _token_lock:
        if _access_token and time.monotonic() < _token_expiry:
            return _access_token

        # Pull Node's CURRENT token (GET /api/internal/ctrader-credentials — Node refreshes it
        # near-expiry, coalesced, and returns a still-working account even across add/reconnect/
        # delete). Retry a few times before EVER using the env fallback: Node boots after the
        # scanner in start.sh, and the env token is a static snapshot that goes stale on rotation.
        # This is what decouples the scanner from account-page activity.
        fresh = None
        for _ in range(4):
            try:
                from data.node_bridge import refetch_from_node
                fresh = await refetch_from_node()
            except Exception:
                fresh = None
            if fresh and fresh.get("access_token"):
                break
            await asyncio.sleep(2)
        if fresh and fresh.get("access_token"):
            _access_token = fresh["access_token"]
            _token_expiry = time.monotonic() + 180   # re-read Node's token every ~3 min
            from config.settings import settings as _s
            object.__setattr__(_s, "ctrader_access_token", fresh["access_token"])
            if fresh.get("refresh_token"):
                object.__setattr__(_s, "ctrader_refresh_token", fresh["refresh_token"])
            log.info("[ctrader] using live token from Node DB")
            return _access_token

        # NO env fallback. A static env token can't be kept fresh — it only masks the failure by
        # crash-looping on a stale, invalid token. Fail loudly instead: the boot probe reports it
        # and write_status("error") fires an immediate coded S3 alert to the private admin chat.
        raise ValueError("[ctrader] could not get a live token from Node after retries — check Node/DB")


async def send(writer: asyncio.StreamWriter,
               payload_type: int, inner: bytes) -> None:
    wrapper = ProtoMessage(payloadType=payload_type, payload=inner)
    data    = wrapper.SerializeToString()
    writer.write(struct.pack(">I", len(data)) + data)
    await writer.drain()


async def recv(reader: asyncio.StreamReader) -> ProtoMessage:
    # Skip server keep-alive heartbeats (payloadType 51) that arrive unsolicited
    # on the shared stream. Otherwise a heartbeat landing between a request and its
    # response is misread as the response ("unexpected response type 51"), which
    # then resets the connection and empties the candle fetch. Callers always wrap
    # recv() in asyncio.wait_for, so this loop stays time-bounded.
    while True:
        header = await reader.readexactly(4)
        length = struct.unpack(">I", header)[0]
        if length > _MAX_BYTES:
            raise ValueError(f"[ctrader] oversized message: {length} bytes")
        raw = await reader.readexactly(length)
        msg = ProtoMessage()
        msg.ParseFromString(raw)
        if msg.payloadType == _HEARTBEAT_EVENT:
            continue
        return msg


PT_OA_ERROR = 2142   # ProtoOAErrorRes — carries cTrader's real errorCode + description
PT_ERROR    = 50     # ProtoErrorRes (common protocol error)

# Unsolicited pushes we may safely step over while waiting for a reply. Named for the log line, not
# used as a whitelist — `recv_expect` skips ANYTHING that is not the reply it wants, because the set
# of things cTrader can push is not knowable from here and a whitelist would rot silently.
_PUSH_NAMES = {51: "heartbeat", 2126: "execution event", 2131: "spot", 2132: "order error",
               2142: "error", 2147: "margin change", 2164: "trailing SL change"}


async def recv_expect(reader: asyncio.StreamReader, want: int,
                      max_skip: int = 64) -> ProtoMessage:
    """Read until the reply we actually asked for arrives, stepping over unsolicited pushes.

    WHY THIS EXISTS — a real outage, 2026-08-21, caused by the code that was supposed to avoid it.
    The shared socket carries PUSHES as well as replies. `recv` already skipped heartbeats for
    exactly this reason ("a heartbeat landing between a request and its response is misread as the
    response"), but only heartbeats. The moment a POSITION was opened, cTrader pushed a
    ProtoOAExecutionEvent (2126); the reconcile request read that as its answer, and its real reply
    (ProtoOAReconcileRes, 2125) stayed in the buffer for the NEXT reader — the candle fetch — which
    then reported `unexpected payloadType=2125` and `MISALIGNED response`. One push desynchronises
    the stream permanently, because every subsequent read is one message behind.

    `_req_lock` does not help: it serialises REQUESTS, and the pushes arrive between a request and
    its reply regardless of who holds the lock.

    A REAL ERROR IS RETURNED, NOT SKIPPED. If the broker answers our request with ProtoOAErrorRes the
    caller must see it; skipping it would spin until the timeout and report "no reply" instead of the
    reason. The caller checks payloadType and decides.
    """
    for _ in range(max_skip):
        msg = await recv(reader)
        if msg.payloadType in (want, PT_OA_ERROR, PT_ERROR):
            return msg
        log.debug("[ctrader] skipped %s (%d) while waiting for %d",
                  _PUSH_NAMES.get(msg.payloadType, "push"), msg.payloadType, want)
    raise RuntimeError(f"[ctrader] {max_skip} messages arrived without a reply of type {want}")


def _describe_resp(resp) -> str:
    """Decode a cTrader error response so auth failures show the REAL errorCode, not just a
    payload type. e.g. CH_CTID_TRADER_ACCOUNT_NOT_FOUND (wrong/foreign account),
    ACCESS_TOKEN_INVALID / CH_ACCESS_TOKEN_INVALID (token), ALREADY_LOGGED_IN (contention)."""
    try:
        if resp.payloadType == PT_OA_ERROR:
            e = ProtoOAErrorRes(); e.ParseFromString(resp.payload)
            return f"ProtoOAErrorRes code={e.errorCode!r} desc={e.description!r}"
        if resp.payloadType == PT_ERROR:
            e = ProtoErrorRes(); e.ParseFromString(resp.payload)
            return f"ProtoErrorRes code={e.errorCode!r} desc={e.description!r}"
    except Exception as exc:
        return f"type={resp.payloadType} (undecodable: {exc})"
    return f"unexpected payloadType={resp.payloadType}"


async def get_connection() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    """Return an authenticated TCP connection, reconnecting if needed."""
    global _reader, _writer
    async with _conn_lock:
        if _writer is not None and not _writer.is_closing():
            return _reader, _writer

        host = HOSTS.get(_env, HOSTS["demo"])
        ctx  = ssl.create_default_context()
        _reader, _writer = await asyncio.wait_for(
            asyncio.open_connection(host, PORT, ssl=ctx), timeout=15
        )
        req = ProtoOAApplicationAuthReq(clientId=_client_id, clientSecret=_client_secret)
        await send(_writer, req.payloadType, req.SerializeToString())
        resp = await asyncio.wait_for(recv(_reader), timeout=10)
        if resp.payloadType != TYPE_APP_AUTH_RES:
            raise RuntimeError(f"[ctrader] app auth failed — {_describe_resp(resp)}")

        tok  = await get_access_token()
        req2 = ProtoOAAccountAuthReq(ctidTraderAccountId=_account_id, accessToken=tok)
        await send(_writer, req2.payloadType, req2.SerializeToString())
        resp2 = await asyncio.wait_for(recv(_reader), timeout=10)
        if resp2.payloadType != TYPE_ACCOUNT_AUTH_RES:
            raise RuntimeError(f"[ctrader] account auth failed — acct={_account_id} {_describe_resp(resp2)}")
        log.info(f"[ctrader] account {_account_id} authenticated")

    return _reader, _writer


def reset_connection() -> None:
    # CLOSE the socket and drop BOTH ends, not just the writer. Nulling only _writer left the old
    # StreamReader (with any buffered/late reply) alive; the next request could then read a stale
    # message off it — a source of response misalignment. Closing forces get_connection() to build a
    # fully fresh reader+writer, so no leftover data can cross into the next request.
    global _reader, _writer
    if _writer is not None:
        try:
            _writer.close()
        except Exception:
            pass
    _reader = None
    _writer = None
