"""
An authenticated cTrader socket that belongs to the ORDER PATH ALONE.

ITS OWN SOCKET, AND THAT IS THE WHOLE POINT. `ctrader_session.get_connection()` returns the
SCANNER's shared connection, and this module deliberately never calls it:

  * `recv_expect`'s docstring records a real outage on 2026-08-21 caused by exactly this sharing. An
    execution event (payloadType 2126) is an unsolicited PUSH. One arriving on the shared socket
    desynchronised the stream permanently — the reconcile read the push as its answer, and its real
    reply was left for the candle fetch, which then reported MISALIGNED. Placing an order is the
    single most reliable way to make cTrader emit that push. Putting order traffic on the scanner's
    socket would be re-creating a known production outage on purpose.
  * A stuck order must never be able to hold up a candle fetch. Separate sockets, separate fates.

THE RATE LIMIT IS PER CONNECTION, AND THAT IS MEASURED, NOT READ. Earlier scripts asserted it from
cTrader's documentation, which is a claim. Tested 2026-08-30 by saturating the SCANNER's connection
until the broker refused it, then immediately issuing a request on a second, already-authenticated
connection — no setup delay to explain the result away. Three runs, identical: scanner blocked 35 of
40, second connection answered OK in 235 / 250 / 234 ms, its ordinary round trip. So a busy scan
cannot starve a trade, and a trade cannot eat the scanner's allowance.

AND THE ACCOUNT ALLOWS AT LEAST 15 SIMULTANEOUS CONNECTIONS — also measured, 2026-08-30, because
this file opens one alongside the scanner's and a cap of 1 would have made the whole design
impossible. Connections were opened one at a time while watching production's own heartbeat, ready
to abort. One round reached **15 with no failure at all** (the test's own stop, not a broker limit);
other rounds stopped at 8 and 11. **A ceiling that moves is not a ceiling** — every failure was
`could not reach demo.ctraderapi.com:5035 within 30s`, a network timeout on a link that was dropping
connections all evening, and never an explicit refusal. When cTrader really does enforce a limit it
says so with an error code, the way it returns BLOCKED_PAYLOAD_TYPE for the request rate. So: no
evidence of a connection cap, at least 15 observed, and the design needs 2. Production's heartbeat
stayed healthy throughout every round.

THE TOKEN IS NEVER REFRESHED HERE. `creds["accessToken"]` is passed in by `execution/account.py`,
which reads it from Node — the single writer. Four consumers share that credential and cTrader
rotates it on refresh, so a refresh from this path would hand the other three a dead token. This
module only ever spends the token it is given.

Split out of broker.py 2026-08-30 when that file passed 200 lines and stopped having one
responsibility. This owns GETTING A SOCKET; broker.py owns the conversation held on it.
"""
import asyncio
import logging
import ssl
import time

log = logging.getLogger(__name__)

# MEASURED, NOT GUESSED. Opening a fresh TLS socket to demo.ctraderapi.com was timed at 15.4s on a
# slow link (and a plain socket to the same host failed outright in the same minute), while the
# scanner's already-open connection answered in 5.1s. Under a single 20s budget covering connect +
# auth + the 1,938-symbol list + the order, a slow CONNECT alone consumed almost all of it and the
# order timed out having never been sent — reported as "state UNKNOWN", the most alarming result the
# order path can produce, and it was not even true. Each phase gets its own budget instead.
CONNECT_TIMEOUT = 30    # TCP + TLS + app auth + account auth
SYMBOLS_TIMEOUT = 25    # the symbol list is ~1,938 entries, and only a new order needs it
COMMAND_TIMEOUT = 20    # send the request and wait for the broker's verdict


class NotSent(Exception):
    """Raised while it is still PROVABLE that no order reached the broker.

    The distinction matters more than it looks. `placer.py` and whoever reads the log treat "order
    state UNKNOWN" as "something may be live — reconcile before touching anything". If a slow network
    or a refused login produced that message, every connection hiccup would look like a possible
    duplicate order. Anything raised before the request is written to the socket is reported as
    "not sent", which is a fact rather than a worry.
    """


async def open_authenticated(creds: dict, account_type: str):
    """(reader, writer) on a NEW socket, application- and account-authenticated.

    Raises NotSent on every failure, because nothing has been sent at this stage — by construction,
    this function returns before any order request is written.
    """
    from data import ctrader_session as sess
    from ctrader_open_api.messages.OpenApiMessages_pb2 import (
        ProtoOAApplicationAuthReq, ProtoOAAccountAuthReq)
    from config.settings import settings

    acct = int(creds["ctraderId"])
    host = sess.HOSTS["demo"] if account_type == "demo" else sess.HOSTS["live"]
    t0 = time.monotonic()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, sess.PORT, ssl=ssl.create_default_context()),
            timeout=CONNECT_TIMEOUT)
    except asyncio.TimeoutError as exc:
        raise NotSent(f"could not reach {host}:{sess.PORT} within {CONNECT_TIMEOUT}s") from exc
    except OSError as exc:
        raise NotSent(f"network error connecting: {type(exc).__name__}") from exc

    try:
        req = ProtoOAApplicationAuthReq(clientId=settings.ctrader_client_id,
                                        clientSecret=settings.ctrader_client_secret)
        await sess.send(writer, req.payloadType, req.SerializeToString())
        resp = await asyncio.wait_for(sess.recv(reader), timeout=CONNECT_TIMEOUT)
        if resp.payloadType != sess.TYPE_APP_AUTH_RES:
            raise NotSent(f"app auth refused — {sess._describe_resp(resp)}")

        req2 = ProtoOAAccountAuthReq(ctidTraderAccountId=acct,
                                     accessToken=creds["accessToken"])
        await sess.send(writer, req2.payloadType, req2.SerializeToString())
        resp2 = await asyncio.wait_for(sess.recv(reader), timeout=CONNECT_TIMEOUT)
        if resp2.payloadType != sess.TYPE_ACCOUNT_AUTH_RES:
            raise NotSent(f"account auth refused — acct={acct} {sess._describe_resp(resp2)}")
    except NotSent:
        writer.close()
        raise
    except asyncio.TimeoutError as exc:
        writer.close()
        raise NotSent(f"authentication did not complete within {CONNECT_TIMEOUT}s") from exc
    except OSError as exc:
        writer.close()
        raise NotSent(f"network error during authentication: {type(exc).__name__}") from exc

    log.info(f"[execution] own socket connected+authenticated in {time.monotonic()-t0:.1f}s")
    return reader, writer


async def load_symbol_map(reader, writer, acct: int) -> dict[str, int]:
    """{symbolName: symbolId} for the account. Only a NEW order needs this — a cancel keys on
    orderId and an amend on positionId, so both skip it and its cost entirely."""
    from data import ctrader_session as sess
    from ctrader_open_api.messages.OpenApiMessages_pb2 import (
        ProtoOASymbolsListReq, ProtoOASymbolsListRes)
    want = ProtoOASymbolsListRes().payloadType
    try:
        req = ProtoOASymbolsListReq(ctidTraderAccountId=acct)
        await sess.send(writer, req.payloadType, req.SerializeToString())
        resp = await asyncio.wait_for(sess.recv_expect(reader, want), timeout=SYMBOLS_TIMEOUT)
    except asyncio.TimeoutError as exc:
        raise NotSent(f"symbol list did not arrive within {SYMBOLS_TIMEOUT}s") from exc
    except OSError as exc:
        raise NotSent(f"network error fetching symbols: {type(exc).__name__}") from exc
    if resp.payloadType != want:
        raise NotSent(f"symbol list refused — {sess._describe_resp(resp)}")
    res = ProtoOASymbolsListRes()
    res.ParseFromString(resp.payload)
    return {s.symbolName: s.symbolId for s in res.symbol}
