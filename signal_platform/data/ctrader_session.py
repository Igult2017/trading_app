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
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq,
    ProtoOAAccountAuthReq,
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
    """Exchange refresh_token for access_token; persist any rotated refresh_token."""
    global _access_token, _token_expiry, _refresh_backoff_until
    async with _token_lock:
        if _access_token and time.monotonic() < _token_expiry:
            return _access_token

        if time.monotonic() < _refresh_backoff_until:
            raise ValueError("cTrader token refresh in backoff — re-run auth_setup.py to reset")

        tokens = _read_tokens()
        rt = tokens.get("refresh_token", "")
        if not rt:
            raise ValueError("No refresh token — run: python auth_setup.py")

        try:
            async with httpx.AsyncClient(timeout=10) as http:
                r = await http.post(_TOKEN_URL, data={
                    "grant_type":    "refresh_token",
                    "refresh_token": rt,
                    "client_id":     _client_id,
                    "client_secret": _client_secret,
                })
                r.raise_for_status()
                j = r.json()

            if "access_token" not in j:
                raise ValueError(f"cTrader token refresh failed: {j}")

            _access_token = j["access_token"]
            _token_expiry = time.monotonic() + j.get("expires_in", 86_400) - 60

            new_rt = j.get("refresh_token", "")
            if new_rt and new_rt != rt:
                _write_tokens({**tokens, "refresh_token": new_rt})
                # Keep in-memory settings in sync so _read_tokens() doesn't
                # return the pre-rotation value on the very next access token expiry.
                from config.settings import settings as _s
                object.__setattr__(_s, "ctrader_refresh_token", new_rt)
                log.debug("[ctrader] refresh token rotated and saved")
                from data.node_bridge import push_rotated_token
                asyncio.create_task(push_rotated_token(new_rt, _access_token))

            return _access_token

        except Exception:
            # Stale/invalid refresh token (or 429 from cTrader). Node keeps a fresh copy for the
            # copy engine — pull it and use it directly instead of hammering cTrader's token endpoint.
            fresh = None
            try:
                from data.node_bridge import refetch_from_node
                fresh = await refetch_from_node()
            except Exception:
                fresh = None
            if fresh and fresh.get("access_token"):
                _access_token = fresh["access_token"]
                _token_expiry = time.monotonic() + 600   # short; next expiry refreshes via the fresh refresh_token
                if fresh.get("refresh_token"):
                    _write_tokens({**tokens, "refresh_token": fresh["refresh_token"]})
                    from config.settings import settings as _s
                    object.__setattr__(_s, "ctrader_refresh_token", fresh["refresh_token"])
                log.info("[ctrader] recovered token from Node DB after refresh failure")
                return _access_token
            _refresh_backoff_until = time.monotonic() + 300
            log.warning("[ctrader] token refresh failed and Node recovery unavailable — backing off 5 min")
            raise


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
            raise RuntimeError(f"[ctrader] app auth failed (type={resp.payloadType})")

        tok  = await get_access_token()
        req2 = ProtoOAAccountAuthReq(ctidTraderAccountId=_account_id, accessToken=tok)
        await send(_writer, req2.payloadType, req2.SerializeToString())
        resp2 = await asyncio.wait_for(recv(_reader), timeout=10)
        if resp2.payloadType != TYPE_ACCOUNT_AUTH_RES:
            raise RuntimeError(f"[ctrader] account auth failed (type={resp2.payloadType})")
        log.info(f"[ctrader] account {_account_id} authenticated")

    return _reader, _writer


def reset_connection() -> None:
    global _writer
    _writer = None
