"""
Candle fetcher — TTL cache + in-flight deduplication over any data source.

data_source.py owns which provider is active — **cTrader, and only cTrader**. This line used to read
"cTrader → MT5 → yfinance", describing a fallback chain that does not exist: `data_source` imports
`ctrader_client` and nothing else. The MT5 and yfinance clients were orphaned modules and were
deleted 2026-08-01.
This module owns caching and concurrency: strategies always call
fetch_candles() and two concurrent requests for the same (symbol, tf)
share exactly one network call via the in-flight future registry.

The cache is count-aware: a cached series only satisfies a request when it
holds at least as many bars as asked for. A small request (e.g. the monitor's
M1 count=1) can therefore never starve a later large request (a strategy's
M1 count=250) — the large request re-fetches instead of slicing 1 bar.
"""

import asyncio
import logging
import math
import time

from core.types import Candle
from data import candle_cache
from data.candle_aggregator import aggregate
from data.data_source import fetch_raw
from shared.mtf_utils import to_minutes, is_native, native_base_for
from shared import market_clock

log = logging.getLogger(__name__)

_in_flight: dict[tuple[str, str], asyncio.Future] = {}


def _is_valid_row(o: float, h: float, l: float, c: float) -> bool:
    for v in (o, h, l, c):
        if math.isnan(v) or math.isinf(v) or v <= 0:
            return False
    return h >= max(o, c) and l <= min(o, c)


# Price-continuity guard. The AGE fail-safe only catches OLD-timestamped bars. On 2026-07-20 the
# USD/JPY feed served bars with recent-enough timestamps to pass the 20h H4 age gate but PRICES from
# 2023 (~134 while the market was ~162) — BX fired a "fresh demand zone" on a level that had not
# existed for 3.2 years. Age cannot see that; a price jump can. We keep the most recent accepted
# close PER SYMBOL (shared across TFs, so a good M5 fetch protects a corrupt H4 fetch on the same
# symbol) and reject any series whose latest close deviates more than _MAX_JUMP from it. FX never
# moves this much between 60s scans — a bigger jump is corrupt/stale data, not a real move. Erring
# toward rejection is SAFE: the worst case is no data -> no signal, never a false signal.
_last_good_close: dict[str, float] = {}
_MAX_JUMP = 0.10   # 10% — orders of magnitude above any real between-fetch FX move, well below the
                   # 18% USD/JPY corruption that triggered this


def _price_continuity_ok(latest_close: float, symbol: str, tf: str) -> bool:
    ref = _last_good_close.get(symbol)
    if ref and ref > 0:
        dev = abs(latest_close - ref) / ref
        if dev > _MAX_JUMP:
            log.error(f"[candle_fetcher] {symbol} {tf}: latest close {latest_close:g} deviates "
                      f"{dev:.0%} from the last good {symbol} price {ref:g} — corrupt/stale feed, "
                      f"dropping the series (does NOT re-baseline on a rejected value)")
            return False
    _last_good_close[symbol] = latest_close   # only good data updates the reference
    return True


def _validate(candles: list[Candle], symbol: str, tf: str) -> list[Candle]:
    valid = [c for c in candles if _is_valid_row(c.open, c.high, c.low, c.close)]
    if len(valid) < len(candles):
        log.warning(f"[candle_fetcher] {symbol} {tf}: dropped {len(candles)-len(valid)} invalid rows")
    if not valid:
        return []
    bar_secs = to_minutes(tf) * 60
    # AGE IS MEASURED FROM THE BAR'S CLOSE, IN MARKET-OPEN TIME ONLY.
    #
    # It used to be `time.time() - valid[-1].time`, i.e. wall-clock age from the bar's OPEN. That is
    # wrong twice on any higher timeframe:
    #   * a bar is stamped at its open, so the newest CLOSED daily bar is already `bar_secs` old the
    #     instant it closes — a full day for D1;
    #   * the market is shut all weekend, and nothing published then is late.
    # Together they logged `D1: data is stale (5353m old)` for every pair on every Monday against a
    # feed that was current, and pushed a healthy series toward the DROP threshold below — which
    # would have discarded the Daily context that HTF zone confluence grades on.
    age = market_clock.bar_age_seconds(valid[-1].time, bar_secs)
    # Fail-safe: an egregiously old last bar means a feed gap / outage. Returning
    # it would let strategies trade on stale prices, so drop the whole series —
    # downstream length guards then reject the tick. Floor at 15m so a single
    # slightly-late bar on fast TFs is not nuked.
    if age > max(5 * bar_secs, 900):
        log.error(f"[candle_fetcher] {symbol} {tf}: last bar closed {age/60:.0f}m of market time ago "
                  f"— dropping (stale fail-safe)")
        return []
    if age > 2 * bar_secs:
        log.warning(f"[candle_fetcher] {symbol} {tf}: data is stale ({age/60:.0f}m of market time "
                    f"since the last bar closed)")
    # Price-sanity: a wild jump from the last good price for this symbol = corrupt feed (see above).
    if not _price_continuity_ok(valid[-1].close, symbol, tf):
        return []
    return valid


async def _do_fetch(symbol: str, tf: str, count: int) -> list[Candle]:
    # Non-native TF: recurse through fetch_candles so the base enters cache
    if not is_native(tf):
        base  = native_base_for(tf)
        ratio = to_minutes(tf) // to_minutes(base)
        base_bars = await fetch_candles(symbol, base, count * ratio + ratio)
        return aggregate(base_bars, tf)[-count:]

    raw = await fetch_raw(symbol, tf, count)
    if not raw:
        return []
    candles = [
        Candle(time=int(b["time"]), open=b["open"], high=b["high"],
               low=b["low"], close=b["close"], volume=b["volume"], timeframe=tf)
        for b in raw
    ]
    validated = _validate(candles, symbol, tf)
    # OBSERVE ONLY. The broker's M1 bars are the answer sheet for the candles being built from the
    # FIX tick stream: every one we built gets marked right or wrong here, the moment its official
    # version lands. Nothing is served from ticks yet and nothing about this return value changes —
    # `serve_enabled` is a separate decision, taken only once a live session has shown an exact
    # match. See `data/tick_bar_audit`.
    if tf == "M1" and validated:
        _audit_against_ticks(symbol, validated)
    return validated


def _audit_against_ticks(symbol: str, broker_bars: list[Candle]) -> None:
    """Score our tick-built bars against the broker's. Never raises, never changes what is returned.

    A measurement on the data path must be incapable of costing a candle, so every failure here is
    swallowed — the worst case is that we learn nothing this tick.
    """
    try:
        from data.tick_bars import builder
        from data.tick_bar_audit import audit
        ours = {c.time: c for c in builder.bars(symbol)}
        if not ours:
            return
        for b in broker_bars:
            mine = ours.get(b.time)
            if mine is not None:
                audit.compare(symbol, mine, b)
    except Exception as exc:
        log.debug(f"[tick-audit] {symbol}: {type(exc).__name__}: {exc}")


async def fetch_candles(symbol: str, tf: str, count: int = 100) -> list[Candle]:
    """
    Public API — count-aware, cache-first, in-flight deduplicated candle fetch.

    Fast path:   cache holds >= count bars → return slice, zero network calls.
    Shared path: another coroutine fetching same key → await it, then re-check.
    Fetch path:  call data_source, cache result, resolve waiting coroutines.

    A cached series with fewer than `count` bars does NOT satisfy the request —
    the caller (re)fetches so an earlier small fetch can never short-change a
    later larger one.
    """
    key = (symbol, tf)

    while True:
        cached = candle_cache.get(symbol, tf)
        if cached is not None and len(cached) >= count:
            # SPLICED ON THE WAY OUT, not on the way into the cache. The cached series would freeze
            # the tick tail for the life of the entry (20s on M1), which is most of what this is
            # meant to remove; done here, every reader gets the newest whole minute we have.
            return _serve(symbol, tf, cached[-count:])

        inflight = _in_flight.get(key)
        if inflight is not None:
            # Someone else is already fetching this key — wait, then loop and
            # re-evaluate (their result may satisfy us, or we fetch ourselves).
            try:
                await inflight
            except Exception:
                pass
            continue

        # We own the fetch for this key.
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        _in_flight[key] = fut
        candles: list[Candle] = []
        try:
            candles = await _do_fetch(symbol, tf, count)
            if candles:
                candle_cache.put(symbol, tf, candles)
        except asyncio.TimeoutError:
            log.error(f"[candle_fetcher] {symbol} {tf}: timed out — treated as empty")
        except Exception as exc:
            log.error(f"[candle_fetcher] {symbol} {tf}: {exc} — treated as empty")
        finally:
            fut.set_result(None)
            _in_flight.pop(key, None)

        # The owner always returns its own result — never loops — so a data
        # source that returns fewer bars than `count` cannot spin forever.
        return _serve(symbol, tf, candles[-count:]) if candles else []


def _serve(symbol: str, tf: str, bars: list[Candle]) -> list[Candle]:
    """Append the minutes the broker has not published yet, when that is allowed. See tick_serving."""
    from data.tick_serving import extend_with_ticks
    return extend_with_ticks(symbol, tf, bars)
