"""
cTrader Open API — wire protocol + OAuth2 + authenticated TCP session.

Message format: [4-byte big-endian length][ProtoMessage bytes]
Auth flow:
  1. POST https://openapi.ctrader.com/apps/token (client_credentials) → access_token
  2. TCP connect → ProtoOAApplicationAuthReq → ProtoOAApplicationAuthRes
  3. ProtoOAAccountAuthReq(ctidTraderAccountId, accessToken) → ProtoOAAccountAuthRes

Dependencies: ctrader-open-api  httpx
  pip install ctrader-open-api httpx
"""

import asyncio
import logging
import ssl
import struct
import time
from typing import Optional

import httpx
from ctrader_open_api.messages.OpenApiCommonMessages_pb2 import ProtoMessage
from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAApplicationAuthReq,
    ProtoOAAccountAuthReq,
)

log = logging.getLogger(__name__)

_TOKEN_URL = "https://openapi.ctrader.com/apps/token"
_HOSTS     = {"demo": "demo.ctraderapi.com", "live": "live.ctraderapi.com"}
_PORT      = 5035
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB safety cap

# Payload type IDs (ProtoOAPayloadType enum values)
TYPE_APP_AUTH_RES     = 2101
TYPE_ACCOUNT_AUTH_RES = 2103
TYPE_ERROR            = 5   # ProtoErrorRes

# Module state — populated via configure()
_client_id:     str = ""
_client_secret: str = ""
_account_id:    int = 0
_env:           str = "demo"

_access_token: str   = ""
_token_expiry: float = 0.0
_reader: Optional[asyncio.StreamReader] = None
_writer: Optional[asyncio.StreamWriter] = None
_conn_lock = asyncio.Lock()


def configure(client_id: str, client_secret: str,
              account_id: int, env: str = "demo") -> None:
    global _client_id, _client_secret, _account_id, _env
    _client_id     = client_id
    _client_secret = client_secret
    _account_id    = account_id
    _env           = env
    log.info(f"[ctrader] configured — account {account_id} ({env})")


async def get_access_token() -> str:
    """OAuth2 client_credentials → access token, cached until near expiry."""
    global _access_token, _token_expiry
    if _access_token and time.monotonic() < _token_expiry:
        return _access_token
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.post(_TOKEN_URL, data={
            "grant_type":    "client_credentials",
            "client_id":     _client_id,
            "client_secret": _client_secret,
        })
        r.raise_for_status()
        j = r.json()
    _access_token = j["access_token"]
    _token_expiry = time.monotonic() + j.get("expires_in", 2_592_000) - 60
    log.debug("[ctrader] OAuth2 token refreshed")
    return _access_token


async def send(writer: asyncio.StreamWriter,
               payload_type: int, inner: bytes) -> None:
    wrapper = ProtoMessage(payloadType=payload_type, payload=inner)
    data    = wrapper.SerializeToString()
    writer.write(struct.pack(">I", len(data)) + data)
    await writer.drain()


async def recv(reader: asyncio.StreamReader) -> ProtoMessage:
    header = await reader.readexactly(4)
    length = struct.unpack(">I", header)[0]
    if length > _MAX_BYTES:
        raise ValueError(f"[ctrader] oversized message: {length} bytes")
    raw = await reader.readexactly(length)
    msg = ProtoMessage()
    msg.ParseFromString(raw)
    return msg


async def get_connection() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
    """Return an authenticated (app + account) TCP connection, connecting if needed."""
    global _reader, _writer
    async with _conn_lock:
        if _writer is not None and not _writer.is_closing():
            return _reader, _writer

        host = _HOSTS[_env]
        ctx  = ssl.create_default_context()
        _reader, _writer = await asyncio.wait_for(
            asyncio.open_connection(host, _PORT, ssl=ctx), timeout=15
        )
        log.debug(f"[ctrader] TCP connected → {host}:{_PORT}")

        # App authentication
        req = ProtoOAApplicationAuthReq(
            clientId=_client_id, clientSecret=_client_secret
        )
        await send(_writer, req.payloadType, req.SerializeToString())
        resp = await asyncio.wait_for(recv(_reader), timeout=10)
        if resp.payloadType != TYPE_APP_AUTH_RES:
            raise RuntimeError(
                f"[ctrader] app auth failed (type={resp.payloadType}). "
                "Check CLIENT_ID and CLIENT_SECRET."
            )
        log.debug("[ctrader] app authenticated")

        # Account authentication
        tok  = await get_access_token()
        req2 = ProtoOAAccountAuthReq(
            ctidTraderAccountId=_account_id, accessToken=tok
        )
        await send(_writer, req2.payloadType, req2.SerializeToString())
        resp2 = await asyncio.wait_for(recv(_reader), timeout=10)
        if resp2.payloadType != TYPE_ACCOUNT_AUTH_RES:
            raise RuntimeError(
                f"[ctrader] account auth failed (type={resp2.payloadType}). "
                "Check CTRADER_ACCOUNT_ID."
            )
        log.debug(f"[ctrader] account {_account_id} authenticated")

    return _reader, _writer


def reset_connection() -> None:
    """Force reconnect on next get_connection() call (called after TCP errors)."""
    global _writer
    _writer = None
