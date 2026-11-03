# PLAN - Stop unnecessary Open API requests (APPROVED); calendar Actual via Trading Economics

## Phase 1 - Architecture
His correction, confirmed in the code: the rate limiting is the cTrader NORMAL API (Open API,
port 5035), NOT FIX. ctrader_client.py:46-48 says cTrader rate-limits HISTORICAL (trendbar) requests
and blocks the payload type with exactly the observed message. fix_quotes.py imports only fix_book
and fix_wire - it makes NO Open API calls and cannot contribute to that budget.

The waste: candle_fetcher.fetch_candles(symbol, tf, count) asks for `count` bars on every cache
expiry, and the cache expires at every bar close by design. ~250 M5 bars re-downloaded to learn one
new bar. The wire call already takes fromTimestamp/toTimestamp (ctrader_client.py:112-113).

Files: signal_platform/data/candle_topup.py   (NEW - ask only for what is new, prove the join)
       signal_platform/data/candle_fetcher.py (_fetch_or_top_up wrapper + call site)
       signal_platform/data/tick_serving.py   (switch on for trusted symbols - A2)
       signal_platform/data/ctrader_client.py (hourly request count - A3)

## Phase 2 - Tasks
1. DONE candle_topup.py: bars_needed() + merge() + top_up(). Continuity proved by OVERLAP, not
   arithmetic (the bar grid has real holes - weekends, holidays). Anything unclean returns None and
   the caller does exactly what it does today.
2. DONE _fetch_or_top_up in candle_fetcher (native timeframes only; aggregates recurse to their base).
3. IN PROGRESS wire the call site: candles = await _fetch_or_top_up(...)
4. Tests for bars_needed/merge with no broker: clean join, hole -> None, forming bar replaced not
   duplicated, window as wide as the request -> None.
5. A2 turn on tick serving for trusted symbols (EUR/USD, GBP/USD trusted in the live audit).
6. A3 hourly count of trendbar requests, so before/after is a number.
7. PART B calendar: establish whether the :05 pass runs, fix what that shows, prove a released
   figure appears against a real past event.

## Phase 3 - Execute: in order.

## Phase 4 - Health check
Fewer trendbar requests per hour; zero BLOCKED_PAYLOAD_TYPE across an open-market hour; candle
series still complete; existing Python tests pass; tsc clean; a real Actual on the live calendar.

## NOT in scope
A cross-process request budget; the aggregated-timeframe fetch path; Scrapling.
