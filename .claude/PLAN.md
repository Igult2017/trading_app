# PLAN - Pace every broker request; read real-time prices from FIX, not the Open API

## Phase 1 - Architecture

MEASURED: the four refused candle requests fired at 48.377/48.677/48.979/49.279 - EXACTLY 0.300s
apart. _MIN_REQ_GAP works. He was right: the budget is spent by requests that never pass the gate.

DOCUMENTED SPLIT (fix_quotes.py:4-15, D40): FIX = real-time, asks for NOTHING, has NO history.
Open API = history. Fall back to Open API only when FIX goes silent.

His question "why did you take trade management / ladder / momentum closure to the Open API?":
I did not - those read FIX. But the SCAN they trigger does: strategy_runner.py:278 calls
ctrader_spread.quote_for() every scan and never tries FIX first, while position_tracker.py:182
already does it right (fix_quotes.live_quote(...) or await ctrader_spread.quote_for(...)).

Five Python send sites on one shared socket; two pace, three do not AND do not stamp the clock:
  ctrader_client.py:118    candles     paced     stamps
  ctrader_orders.py:49-57  deal list   paced     stamps
  ctrader_spread.py:107    quote       NO        NO   <- 156 requests in 18 min
  ctrader_positions.py:211 deal list   NO        NO   <- historical
  ctrader_positions.py:141 reconcile   NO        NO
A request that does not stamp _last_req makes the NEXT paced request measure from a stale timestamp
and fire immediately - which is how a correctly-paced fetcher still gets refused.

Node: NO pacing at all. 8 send sites; 2 historical (PT_DEALS_REQ :356, PT_ORDERS_REQ :796) and the
deal fetch RECURSES, firing back-to-back.

## Phase 2 - Tasks
1. REVERT the candle top-up (data/candle_topup.py + the _fetch_or_top_up hook). His warning: asking
   only for new data has a history of DELAYED data for VIX. It is also not the root cause - the
   refused requests were correctly paced.
2. One paced_request() in ctrader_client that takes _req_lock, waits the gap and stamps the clock;
   all five Python sites use it. No un-gated way to send.
3. Node: a ctraderPace helper awaited before each send, history and ordinary on separate budgets.
4. FIX-first inside ctrader_spread.quote_for (not at the call sites, so none can forget): try
   fix_quotes.live_quote(symbol); ask the broker only when that is None. Gated per symbol by
   tick_bar_audit.trusted() - admits EUR/USD + GBP/USD, excludes GBP/JPY, matching the measurement.
   KEEP the quote-compare line; it is how the ask was validated and must keep watching the rest.

EVIDENCE for 4 - 165 production samples, |difference| mean/max:
  EUR/USD bid 0.000002/0.000020  ask 0.000000/0.000010
  GBP/USD bid 0.000003/0.000020  ask 0.000001/0.000010
  GBP/JPY bid 0.005021/0.008     ask 0.005021/0.006    (known constant offset)
  XAU/USD bid 0.033/0.29         ask 0.016/0.29

## Phase 3 - Execute: in order.

## Phase 4 - Health check
ZERO BLOCKED_PAYLOAD_TYPE across an hour of open market (count before/after, not "it ran").
Broker requests per hour down; the ~156 quote requests/18min near zero for trusted symbols.
FRESHNESS MUST NOT REGRESS - quote-compare deltas stay within the measured bounds; candles untouched
because task 1 reverts the top-up. Source-read check that every send site goes through the gate.
Existing Python tests pass; tsc clean.

## NOT in scope
The calendar Actual (separate, still outstanding); the aggregated-timeframe path; a cross-process
budget shared between Node and Python (D63's deeper issue, its own work).
