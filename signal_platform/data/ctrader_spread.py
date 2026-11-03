"""
THE LIVE SPREAD — the number the platform has never had.

`core/strategy_context_builder.build` has accepted a `spread` argument since it was written and
NOTHING HAS EVER PASSED ONE. So `context.spread` was always None, and `risk/spread_filter.py` — a
whole module with its own threshold and its own log lines — has never once run on real data. This
file fills that slot.

WHY IT MATTERS, measured 2026-08-20. cTrader triggers a BUY stop on the ASK; candles are BID. So a
buy order placed one tick beyond a bid high actually fires when the real price is still a whole
spread BELOW that high — a fill on a break that never happened. Sell stops trigger on the bid, the
same frame the candles are in, so they are untouched. The error is one-sided and the code had no way
to know, because it could not see a spread. Against a median VIX.1 stop of 3.7 pips (EUR/USD), a 1.2
pip spread is a third of the risk.

REQUEST/RESPONSE, NOT A SUBSCRIPTION, AND THAT IS THE WHOLE DESIGN CONSTRAINT. The obvious source is
`ProtoOASubscribeSpotsReq`, but spot events then arrive unsolicited and forever on the SAME stream the
candle fetch reads with `send -> await recv`. Interleaving them risks the platform's lifeblood — a
trendbar reply arriving after a spot event that the reader was not expecting. `ProtoOAGetTickDataReq`
asks for one side at a time and answers once, which composes with the existing pattern exactly.

THE NEWEST TICK IS ABSOLUTE. cTrader returns tick data newest-first, with `tickData[0]` carrying a
full price and everything after it a delta going backwards in time. We want only the newest, so there
is no delta decoding here at all — the one thing about this encoding that most often goes wrong is
simply not done.

CACHED, BECAUSE A SPREAD IS NOT A LEVEL. Two requests per symbol against a ~5/s account-wide budget
shared with the candle fetch would be a real cost on every tick. Spreads move slowly inside a session,
so a few-minute-old spread is fine for sizing a stop; `_TTL` is deliberately far below the timescale
on which they widen (session edges), and a miss simply returns None and the caller carries on.
"""
import asyncio
import logging
import time

from ctrader_open_api.messages.OpenApiMessages_pb2 import (
    ProtoOAGetTickDataReq, ProtoOAGetTickDataRes,
)
from ctrader_open_api.messages.OpenApiModelMessages_pb2 import ProtoOAQuoteType

from data import ctrader_session as _sess
# THE SAME LOCK THE CANDLE FETCH USES, and this is not optional. `_req_lock` serialises every
# request/response pair on the ONE shared TCP stream; a spread request sent without holding it would
# land between a trendbar request and its reply, and the candle fetch would parse the wrong message.
# The whole reason this module is request/response rather than a spot subscription is to be able to
# take this lock — a subscription cannot.
from data import ctrader_client as _cc
from data.ctrader_client import _load_symbols, _req_lock, _symbols

log = logging.getLogger(__name__)

_DIVISOR = 100_000        # same fixed 1e5 as trendbars — NOT the symbol's display digits
# THE QUOTE IS A PRICE, AND A PRICE GOES STALE FAST. The spread was cached for 300s because spreads
# move on the timescale of session edges. The bid and ask from the SAME request are now kept too, and
# they are a live price — so the TTL is sized to one scan tick instead. The spread simply rides along
# and gets fresher; nothing about it needed the longer window, that was only there to save requests.
#
# 25s: under the 30s London/NY-overlap scan cadence, so a scan never reuses the previous scan's quote.
# Cost is 3 symbols x 2 requests per scan — measured 0.40 -> ~0.60 req/s against cTrader's 5/s cap.
_TTL     = 25.0           # seconds a quote (and the spread taken with it) stays usable
_WINDOW  = 10 * 60_000    # ms of history asked for; wide enough that a quiet minute still has a tick
_TYPE_TICK_RES = ProtoOAGetTickDataRes().payloadType

# symbol -> (bid, ask, expires_at). The spread is `ask - bid`, derived rather than stored, so the two
# can never disagree about the same instant.
_cache: dict[str, tuple[float, float, float]] = {}


async def _newest(reader, writer, sid: int, quote_type: int) -> float | None:
    """The newest price on one side, or None. `tickData[0]` is absolute; the rest are deltas."""
    now_ms = int(time.time() * 1000)
    req = ProtoOAGetTickDataReq(
        ctidTraderAccountId=_sess._account_id, symbolId=sid, type=quote_type,
        fromTimestamp=now_ms - _WINDOW, toTimestamp=now_ms,
    )
    # ⚠ PACED, AND IT WAS NOT UNTIL 2026-11-03. `ProtoOAGetTickDataReq` is a HISTORICAL request, so
    # it spends the same scarce ~5/s budget the candle fetch lives on — and `quote_for` sends two of
    # them per symbol per call (bid, then ask). Unpaced, that was ~312 requests in an 18-minute
    # window going straight past the gate, and because they never stamped the shared clock the NEXT
    # candle fetch measured its gap from a stale timestamp and fired immediately too. The candle
    # fetcher was pacing perfectly and still being refused. See `ctrader_client.await_turn`.
    await _cc.await_turn()
    await _sess.send(writer, req.payloadType, req.SerializeToString())
    # recv_expect: the shared socket carries unsolicited pushes, and reading one as the reply leaves
    # the real reply behind to desynchronise every later reader. See ctrader_session.recv_expect.
    resp = await asyncio.wait_for(_sess.recv_expect(reader, _TYPE_TICK_RES), timeout=15)
    if resp.payloadType != _TYPE_TICK_RES:
        return None
    res = ProtoOAGetTickDataRes()
    res.ParseFromString(resp.payload)
    if not res.tickData:
        return None
    return res.tickData[0].tick / _DIVISOR


def _live_quote_if_trusted(symbol: str) -> tuple[float, float] | None:
    """The streamed (bid, ask) when this symbol has earned it, else None so the broker is asked.

    THREE WAYS TO GET None, and each one falls back to exactly today's behaviour:
      * the symbol has not earned trust (`tick_bar_audit.trusted` — a minimum sample and no mismatch
        anywhere in the recent window; one wrong bar withdraws it);
      * no stream, or no quote for this symbol;
      * the quote is older than `fix_quotes` considers fresh.

    ⚠ THE CROSSED-BOOK TEST IS REPEATED HERE and that is deliberate, not an oversight. `quote_for`
    refuses `ask <= bid` from the broker because it is "not a book, it is a crossed or stale one" —
    a zero or negative spread fed into a stop calculation or a side-of-the-line test. A streamed
    quote can be crossed for the same reasons, so it faces the same test rather than being trusted
    because of where it came from.

    Never raises: an enrichment that can throw is a new way to lose a quote.
    """
    try:
        from data import fix_quotes
        from data.tick_bar_audit import audit
        if not audit.trusted(symbol):
            return None
        live = fix_quotes.live_quote(symbol)
        if live is None:
            return None
        bid, ask = live
        if ask <= bid:
            return None
        return (bid, ask)
    except Exception as exc:
        log.debug(f"[ctrader_spread] live quote unavailable for {symbol}: {type(exc).__name__}: {exc}")
        return None


async def quote_for(symbol: str) -> tuple[float, float] | None:
    """The live (bid, ask), or None if it cannot be read.

    THE PRICES WERE ALREADY ON THE WIRE AND WERE BEING THROWN AWAY. This function did the same two
    tick requests, subtracted them and discarded both. Keeping them costs nothing and answers the
    other question the platform could not: what is the price RIGHT NOW.

    WHY THAT QUESTION HAD NO ANSWER. The feed serves CLOSED bars only, so the newest M1 close is up to
    ~2 minutes old once the 10-70s publication lag is counted. The 1M entry used it for two decisions
    that are about this instant — which side of the line price is on, and whether a stop order would
    fill immediately. Those are TRIGGERS, and the levels-vs-triggers rule says a trigger stays LIVE.

    NEVER RAISES. A quote is an input, not a decision: if it cannot be fetched the caller falls back
    to the last closed bar rather than the instrument going silent.
    """
    # ── FIX FIRST, THE BROKER ONLY WHEN FIX IS SILENT ──────────────────────────────────────────
    #
    # HIS INSTRUCTION, documented in D40: *"when trade is placed and even when watching 1HR candle to
    # close, we should rely more on FIX data … because it is real time data."* And the division of
    # labour is the broker's own: FIX is real-time and "does not support requests for historical
    # market data" (fix_quotes.py:13); the Open API is where history lives. Asking the Open API for a
    # price THIS INSTANT was the wrong source for the question.
    #
    # ⚠ IT WAS ALSO EXPENSIVE IN THE ONE CURRENCY THAT MATTERS HERE. `_newest` sends
    # `ProtoOAGetTickDataReq`, which is a HISTORICAL request on the scarce ~5/s budget, and this
    # function sends TWO of them per symbol per call — about 312 in an 18-minute window on
    # 2026-11-03, while the candle fetcher was being refused.
    #
    # ⚠ WHY THIS WAS NOT DONE SOONER, AND WHAT CHANGED. The note below this one recorded that the
    # stream was "not yet trusted to decide an ENTRY" because the evidence covered the BID only and
    # "nothing has ever compared the streamed ASK against the broker's ask". The `quote-compare` line
    # has been gathering exactly that, and 165 production samples now answer it — |difference|
    # mean / max:
    #
    #     EUR/USD  bid 0.000002 / 0.000020   ask 0.000000 / 0.000010
    #     GBP/USD  bid 0.000003 / 0.000020   ask 0.000001 / 0.000010
    #     GBP/JPY  bid 0.005021 / 0.008      ask 0.005021 / 0.006     <- the known constant offset
    #     XAU/USD  bid 0.033    / 0.29       ask 0.016    / 0.29
    #
    # So the ask is proven for the two symbols whose bars already match the broker exactly, and is
    # NOT proven for GBP/JPY or gold. Hence the per-symbol gate rather than a blanket switch — and
    # `tick_bar_audit.trusted` is reused rather than a second list invented, because it already
    # admits exactly those two and already withdraws trust the moment one bar disagrees.
    live = _live_quote_if_trusted(symbol)
    if live is not None:
        return live

    hit = _cache.get(symbol)
    if hit and time.monotonic() < hit[2]:
        return (hit[0], hit[1])
    try:
        async with _req_lock:
            reader, writer = await _sess.get_connection()
            await _load_symbols(reader, writer)
            sid = _symbols.get(symbol.replace("/", ""))   # the broker's form: EUR/USD -> EURUSD
            if sid is None:
                return None
            bid = await _newest(reader, writer, sid, ProtoOAQuoteType.BID)
            ask = await _newest(reader, writer, sid, ProtoOAQuoteType.ASK)
        if bid is None or ask is None or ask <= bid:
            # ask <= bid is not a book, it is a crossed or stale one — refuse it rather than feed a
            # zero or a negative into a stop calculation or a side-of-the-line test.
            return None
        _cache[symbol] = (bid, ask, time.monotonic() + _TTL)
        _compare_live(symbol, bid, ask)
        return (bid, ask)
    except Exception as exc:
        log.warning(f"[ctrader_spread] {symbol}: {type(exc).__name__}: {exc} — quote unknown")
        return None


def _compare_live(symbol: str, bid: float, ask: float) -> None:
    """Log the live streamed quote beside the broker's, and DECIDE NOTHING WITH IT.

    WHY THIS EXISTS. The live price stream is already trusted for one thing — moving a stop, where
    `trade_watcher` reads the bid for a buy and the ASK for a sell. It is not yet trusted to decide
    an ENTRY. The evidence we have covers the BID only: `tick_bar_audit` scores tick-built candles
    against the broker's, and candles are bid-based on both sides of that comparison (cTrader:
    *"It is not possible to get trendbars based on ask prices"*). **Nothing has ever compared the
    streamed ASK against the broker's ask, because there is no broker ask-candle to compare with.**

    WHY THAT IS WORTH A MEASUREMENT RATHER THAN AN ASSUMPTION. `breakeven.py:78` records a real demo
    position CLOSED INSTANTLY on 2026-08-21 by a stop placed the wrong side of the market. Being
    slightly wrong about which side price is on is exactly that failure, and an entry decision asks
    precisely that question.

    So this runs only where the broker was ALREADY being asked — no extra request, no extra latency,
    and no behaviour attached. It prints on every real fetch (which the 25s cache makes infrequent)
    so the two sources can be compared over days before either side of the book is relied on.
    """
    try:
        from data import fix_quotes
        live = fix_quotes.live_quote(symbol)
        if live is None:
            return
        lb, la = live
        log.info(f"[quote-compare] {symbol} broker bid {bid:.5f} ask {ask:.5f} "
                 f"(spread {(ask - bid):.5f}) | live bid {lb:.5f} ask {la:.5f} "
                 f"(spread {(la - lb):.5f}) | dBid {(lb - bid):+.5f} dAsk {(la - ask):+.5f}")
    except Exception as exc:
        # An observation must never be able to cost a quote.
        log.debug(f"[quote-compare] {symbol}: {type(exc).__name__}: {exc}")


async def spread_for(symbol: str) -> float | None:
    """Live spread in PRICE units (ask - bid), or None if it cannot be read.

    Derived from `quote_for` rather than stored, so the spread and the quote can never disagree about
    the same instant. Callers are unchanged.
    """
    q = await quote_for(symbol)
    return None if q is None else q[1] - q[0]


def cached(symbol: str) -> float | None:
    """The last known spread without touching the network — for callers that must not block."""
    hit = _cache.get(symbol)
    return (hit[1] - hit[0]) if hit else None


def cached_quote(symbol: str) -> tuple[float, float] | None:
    """The last known (bid, ask) without touching the network."""
    hit = _cache.get(symbol)
    return (hit[0], hit[1]) if hit else None
