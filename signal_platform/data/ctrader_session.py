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
_HOSTS      = {"demo": "demo.ctraderapi.com", "live": "live.ctraderapi.com"}
_PORT       = 5035
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

        # Last resort — Node truly unreachable. Use the env token but keep it SHORT-lived so we
        # retry Node almost immediately (the env snapshot may be stale after a rotation).
        from config.settings import settings as _s
        if _s.ctrader_access_token:
            _access_token = _s.ctrader_access_token
            _token_expiry = time.monotonic() + 30
            log.warning("[ctrader] Node unreachable — using env fallback token (may be stale); retrying Node soon")
            return _access_token
        raise ValueError("[ctrader] no access token from Node — reconnect the cTrader account")


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

        host = _HOSTS.get(_env, _HOSTS["demo"])
        ctx  = ssl.create_default_context()
        _reader, _writer = await asyncio.wait_for(
            asyncio.open_connection(host, _PORT, ssl=ctx), timeout=15
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
    global _writer
    _writer = None
