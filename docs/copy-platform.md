# Copy Trading Platform — Usage Guide

## Overview

The copy platform is a standalone Python engine (`copy_platform/`) that watches connected cTrader master accounts in real time and mirrors every trade they execute to all subscribed follower accounts — instantly, with no polling.

**Data flow:**
```
cTrader master account
    → TCP push event (ProtoOAExecutionEvent)
    → copy_platform/providers/ctrader.py
    → dispatcher.py (lot sizing, filters, retries)
    → copy_platform/executors/ctrader.py
    → follower's cTrader account
    → DB logs (copy_execution_logs)
```

---

## Prerequisites

### 1. Environment variables

Add to your project root `.env` (the Node server reads these and passes them to the Python process):

```env
CTRADER_CLIENT_ID=your_app_client_id
CTRADER_CLIENT_SECRET=your_app_client_secret
ENCRYPTION_KEY=32-byte-hex-key-matching-server-lib-crypto-ts
```

`ENCRYPTION_KEY` must be the **same key** used by `server/lib/crypto.ts` — the Python engine decrypts broker credentials that the Node server encrypted.

Also create `copy_platform/.env`:

```env
DATABASE_URL=postgresql://user:pass@host/dbname
CTRADER_CLIENT_ID=your_app_client_id
CTRADER_CLIENT_SECRET=your_app_client_secret
ENCRYPTION_KEY=same-key-as-above
```

### 2. Python dependencies

```bash
cd copy_platform
pip install -r requirements.txt
```

Key packages: `ctrader-open-api`, `sqlalchemy`, `aiohttp`, `twisted`, `cryptography`, `psycopg2-binary`.

### 3. Database schema

Run once after pulling the latest schema:

```bash
npm run db:push
```

This creates the tables: `copy_trades_master`, `copy_trades_follower`, `copy_execution_logs`, and adds `broker_account_id` columns to `copy_masters` and `copy_followers`.

---

## Starting the platform

The copy platform starts **automatically** when the Node server starts — no manual launch needed — as long as `CTRADER_CLIENT_ID` and `CTRADER_CLIENT_SECRET` are set:

```
server/index.ts
  └── startCopyPlatform()        ← spawns copy_platform/main.py as a child process
```

If cTrader env vars are absent, the platform is silently skipped (no error). You'll see this in the server log:

```
[CopyPlatform] CTRADER_CLIENT_ID / CLIENT_SECRET not set — skipping
```

When running, you'll see:

```
[CopyPlatform] starting python copy_platform/main.py
[boot] copy platform starting
[engine] starting copy engine
[engine] provider started for master <id> (Account Name)
[<master_id>] authenticated — requesting open positions
[<master_id>] loaded 3 open positions
```

**Auto-restart:** If the Python process crashes, it restarts automatically in 5 seconds.

---

## Step-by-step: Setting up a copy relationship

### Step 1 — Connect a cTrader broker account

In the app: **Accounts → Connect Account → cTrader**.

Enter your cTrader account credentials. The server:
1. Stores OAuth tokens (AES-256-GCM encrypted) in `broker_accounts.password_enc`
2. Sets `connection_type = "api"`
3. Starts a 2-year historical sync in the background
4. Returns the linked `defaultSessionId` so you can view performance immediately

### Step 2 — Register the account as a signal provider

Call the API once:

```bash
POST /api/broker-accounts/:id/register-as-provider
Authorization: Bearer <admin_secret>
```

Response:
```json
{
  "masterId": "uuid-of-new-copy-master",
  "alreadyExisted": false
}
```

This creates a row in `copy_masters` with `broker_account_id` pointing to the connected account. The engine picks it up within 60 seconds (its watch loop) and opens a TCP connection to cTrader.

The provider also appears in the **Trade Sync** page's signal provider list automatically.

### Step 3 — Add a follower

In the **Trade Sync** page, click the provider → **Add Follower**. Fill in:

| Field | Values | Meaning |
|---|---|---|
| Lot mode | `mult` | Multiply master lots by a factor |
| | `fixed` | Always trade a fixed lot size |
| | `risk` | Size by % of equity ÷ SL pips |
| Lot multiplier | e.g. `0.5` | Half the master's size (mult mode) |
| Direction | `same` / `reverse` / `hedge` | Trade direction |
| Symbol whitelist | `["EURUSD","GBPUSD"]` | Only copy these symbols (empty = all) |
| Symbol blacklist | `["XAUUSD"]` | Never copy these symbols |

The follower must also have a connected broker account (`broker_account_id` in `copy_followers`). This is set automatically when the follower links their account in the Accounts panel.

### Step 4 — Confirm risk acceptance

The follower must accept risk before copying begins:

```sql
UPDATE copy_followers SET risk_accepted = true WHERE id = '<follower_id>';
```

Or via the UI toggle in the Trade Sync page.

---

## How trades are copied

**A master's ORDER is mirrored as an order, not as a trade.** His instruction, 2026-09-21: *"it
should mirror what is happening in master exactly."* An order that is placed and later cancelled
without ever filling — which is most of what VIX.1 does — is copied as exactly that.

One `ProtoOAExecutionEvent` carries BOTH an `order` and a `position`, and the two are read
separately, because a resting order has no position at all:

| what the broker sends | what the follower does |
|---|---|
| `ORDER_ACCEPTED` | **PLACED** — an order of the master's own kind, at the master's own price, rests on the follower |
| `ORDER_REPLACED` | **AMENDED** — the mirror is moved to match. Amended, never cancelled-and-replaced: between the two the follower holds nothing, and that gap is exactly when price runs to the entry |
| `ORDER_CANCELLED` / `EXPIRED` / `REJECTED` | **CANCELLED** — the mirror comes off the book |
| `ORDER_FILLED` (with a position) | **OPEN** — and **nothing is sent.** The follower's own order is resting at the same price, so it fills by itself; a market order here would open the follower a second time, at a price the master never took |
| position closed | **CLOSE** |
| SL/TP moved on a live position | **MODIFY** (this is how the breakeven ladder reaches the follower) |

An order that is never mirrored: a `MARKET` order (it becomes a position at once), a
`STOP_LOSS_TAKE_PROFIT` order (protection is not an entry), and any `closingOrder`.

**Three different identifiers, and mixing them up acts on the wrong trade:**

* the master's **order id** — what a follower's mirror is filed under, and what an amend or a
  cancel is matched by. Never by symbol: a follower can hold several orders on one symbol.
* the follower's **order id** — what is actually sent to the follower's broker to amend or cancel.
* the **label** (`cp-<master order id>`, `mirror.mirror_label`) — the only field cTrader carries
  from an order onto the position it becomes. Nothing listens to follower accounts, so when a
  mirror fills this is the one thread back to it, and it is how the follower's POSITION id is found
  so the copy can later be closed. No fallback to "the newest position on that symbol" — that guess
  is wrong exactly when it matters, with two copies of one symbol resting at different prices.

**Every gate runs when the mirror is PLACED**, not when it fills: the symbol filter, the session
filter, the safety guards, risk-% sizing and the 3% per-trade cap. Placing first and checking later
would put an order on the account that the follower's own limits say must never be taken, and by
then it is the market's decision. Once the mirror is on the book the fill is simply recorded.

Then, for every event: **up to 3 retries** with exponential back-off (2s, 4s, 8s) — except an
entry, which is never retried, because a retry after an ambiguous failure could place a second live
order. And **every execution, success or failure, is recorded in `copy_execution_logs`.**

⚠ **Only cTrader can mirror a resting order.** The Binance, DXtrade and TradeLocker executors have
open/close/modify and nothing else. A PLACED/AMENDED/CANCELLED for one of those followers is
skipped with that reason in the log — never silently downgraded to a market order, which would
enter a trade the master has only placed an order for.

Total latency from master trade to follower order: **< 500ms** in normal conditions.

### The stop must be on the copy, and it lives on the ORDER

Risk-% sizing needs the distance to the stop and the per-trade cap needs the risk, so a trade with
no stop cannot be copied at all. **At the moment of a fill the stop is on the `order`, not on the
position** — `_protection()` in `providers/ctrader.py` reads the position first (it is the later
truth once a stop has been moved) and falls back to the order. Protobuf reports an unset number as
`0.0`, so `0.0` means "not set", never a real price.

This is what broke copying for 19 days: the handler read `event.position`, returned when there was
none, and every order event — the ones carrying the stop — was dropped at the door. All twelve
master events on record read stop-less and every single copy was refused. See the fix log below.

---

## Lot sizing modes

### `mult` — multiplier
```
follower_lots = master_lots × lot_multiplier
```
Example: master trades 1.0 lot, multiplier = 0.5 → follower trades 0.5 lots.

### `fixed` — fixed size
```
follower_lots = fixed_lot
```
Ignores master lot size entirely.

### `risk` — equity-based
```
follower_lots = (follower_equity × risk_percent / 100) / (sl_pips × pip_value)
```
Requires the event to have a stop loss. Falls back to `fixed_lot` if no SL is present.

All results are rounded to 2 decimal places and clamped to a minimum of `0.01` lots.

---

## Monitoring

### Logs

The copy platform logs to stdout (captured by the Node server and prefixed `[CopyPlatform]`):

```
[engine] provider started for master abc123 (My cTrader Account)
[abc123] INFO  OPEN: EURUSD 0.1 lots — ok
[follower-xyz] ERROR FAIL: Attempt 3 failed: Execution timed out after 15s
```

### Database tables

| Table | Purpose |
|---|---|
| `copy_masters` | One row per master account |
| `copy_followers` | One row per follower subscription |
| `copy_trades_master` | Every position event from master (de-duplicated) |
| `copy_trades_follower` | Every copy execution attempt per follower |
| `copy_execution_logs` | Verbose per-follower log with level + event type |

Query recent activity:

```sql
-- Last 50 copy executions
SELECT f.symbol, f.action, f.volume, f.status, f.error_message, f.executed_at
FROM copy_trades_follower f
ORDER BY f.created_at DESC
LIMIT 50;

-- Failures in last hour
SELECT l.message, l.event, l.created_at
FROM copy_execution_logs l
WHERE l.level = 'ERROR'
  AND l.created_at > NOW() - INTERVAL '1 hour'
ORDER BY l.created_at DESC;
```

---

## Token refresh

cTrader OAuth access tokens expire every ~1 hour. The engine refreshes them automatically:

- Every time the engine fetches credentials for a master or follower, it calls `token_manager.get_ctrader_creds()`
- This hits `https://connect.ctrader.com/oauth2/token` with the stored `refreshToken`
- The new `accessToken` is re-encrypted (AES-256-GCM) and saved back to `broker_accounts.password_enc`
- If refresh fails (e.g. token revoked), a warning is logged and the last known token is tried

---

## Architecture diagram

```
Node server (index.ts)
│
├── startCopyPlatform()
│     └── spawn: python copy_platform/main.py
│
copy_platform/main.py
├── asyncioreactor.install()        ← Twisted uses asyncio loop
├── reactor.callWhenRunning(startup)
└── reactor.run()                   ← drives asyncio + Twisted together

_startup()
└── CopyEngine.start()
    ├── _load_masters()             ← reads copy_masters from DB
    │   └── CTraderProvider(master) ← one per active master
    │       ├── TCP connect to cTrader
    │       ├── ApplicationAuth → AccountAuth → ReconcileReq
    │       └── on ProtoOAExecutionEvent:            ← carries an `order` AND a `position`
    │             ├── _handle_order()   → PLACED / AMENDED / CANCELLED   (a resting order)
    │             ├── _handle_execution → OPEN / CLOSE / MODIFY          (a position)
    │             └── dispatch(event, master_id)
    │                 ├── save copy_trades_master
    │                 └── for each follower:
    │                     ├── mirror.record_fill_for()  ← a mirrored order that filled:
    │                     │                                record it, SEND NOTHING
    │                     ├── get_ctrader_creds (+ refresh if needed)
    │                     ├── calc_lots / apply_direction / is_symbol_allowed
    │                     └── CTraderExecutor
    │                         ├── open / close / modify_position()       (a position)
    │                         ├── place / amend / cancel_pending()       (a resting order)
    │                         ├── find_position_by_label()               (read-only)
    │                         ├── one-shot TCP connect
    │                         ├── ApplicationAuth → AccountAuth
    │                         ├── send order
    │                         └── await ProtoOAExecutionEvent (20s timeout)
    │                             └── ⚠ ORDER_CANCELLED CONFIRMS a cancel
    │                                 and FAILS everything else
    └── _watch_loop()               ← polls DB every 60s for new masters
```

---

## Extending to other platforms

To add Binance, ByBit, or another platform:

1. Create `copy_platform/providers/binance.py` subclassing the same interface:
   ```python
   class BinanceProvider:
       def start(self): ...
       def stop(self): ...
   ```
   The provider must call `await self.on_event({"type": "OPEN"|"CLOSE"|"MODIFY", "snap": PositionSnapshot(...)}, self.master_id)` on every trade.

2. Create `copy_platform/executors/binance.py` implementing:
   ```python
   class BinanceExecutor:
       async def open_position(symbol, action, volume_lots, sl, tp) -> ExecResult
       async def close_position(position_id, volume_lots) -> ExecResult
       async def modify_position(position_id, sl, tp) -> ExecResult
   ```

3. Register in `engine.py`:
   ```python
   PROVIDER_MAP = {"ctrader", "ct", "binance"}
   ```

4. Register in `dispatcher.py`:
   ```python
   API_EXECUTOR_MAP = {
       "ctrader": "executors.ctrader.CTraderExecutor",
       "binance": "executors.binance.BinanceExecutor",
   }
   ```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[CopyPlatform] CTRADER_CLIENT_ID not set — skipping` | Missing env vars | Add `CTRADER_CLIENT_ID` + `CTRADER_CLIENT_SECRET` to `.env` |
| `[engine] cannot decrypt creds for master X` | Wrong `ENCRYPTION_KEY` | Ensure key matches `server/lib/crypto.ts` |
| Provider never authenticates | Wrong `ctraderId` stored | Re-connect the account via the Accounts panel |
| `Execution timed out` (20s) | cTrader API slow / order rejected | Check symbol name, account permissions, lot size limits |
| `Symbol XAUUSD filtered` | Blacklist match | Adjust `symbol_blacklist` on the follower row |
| Copy platform restarts every 5s | Python import error | Check `[CopyPlatform] ERR:` lines in server log |
| `Risk-% mode: can't size — the trade has no stop-loss` on EVERY trade | The stop was being read from the position, where it does not exist yet at a fill | **Fixed 2026-09-21** — see the fix log. If it returns, check `_protection()` is still reading `event.order` |
| The master placed an order and the follower got nothing | Either no mirror was placed (read the SKIP reason — session, risk cap, symbol filter) or the follower's platform cannot rest an order | Only cTrader can mirror a resting order today |
| `No resting follower order mirrors master order N` | The mirror was never placed, or was already cancelled | Not an error — the earlier PLACED row says why |
| `CANCEL FAILED for follower order N` | The cancel exhausted its 3 retries | ⚠ **That order is still resting and will fill if price reaches it.** Cancel it by hand |
| A mirror filled but `a later close will have to be done by hand` | The follower's position could not be identified by its label | The OPEN row has no `external_id`; close that position manually |

---

## Scale — what it can carry, and what caps it

**Rebuilt 2026-09-26** on his instruction: *"ensure copy trader can be used by many people and the
only limit is resources which is hosting."* It was SOFTWARE-bound, not resource-bound. All four
numbers below are measured, not estimated.

| ceiling | before | now |
|---|---|---|
| every database call ran ON the event loop (no `to_thread` anywhere in the package) | 50 x 200ms queries = **10.03 s**, engine fully stopped throughout | **0.41 s** on a worker pool (24.7x), and the loop serviced 30 other things during it |
| the account's symbol list, re-downloaded per order | **1,941 symbols / 312 KB every order** | fetched once per ACCOUNT, cached in `symbol_details` |
| follower fan-out | unbounded — 500 followers = 500 simultaneous broker requests | capped by `COPY_MAX_CONCURRENT_FOLLOWERS` (25) |
| the broker's own rate limit | not respected at all | token bucket at 45/sec; bursts inside one second are NOT slowed |
| database pool | 20 + 40, starved at ~8-12 concurrent followers | `COPY_DB_POOL` 40 + 80, sized with the thread pool so they cannot drift |

### ⚠ The ceiling that is NOT ours, and no hosting lifts it

> *"a maximum of 50 requests per second per connection for any non-historical data requests"*
> — https://help.ctrader.com/open-api/
> *"At most, you should create two connections: one for demo accounts and one for live accounts.
> Each connection can support an unlimited number of accounts of a certain type."*
> — https://help.ctrader.com/open-api/connection/

Rate limits are **per connection** and the guidance is **two connections for the whole platform**.
So the hard ceiling is roughly **50 orders/sec across all demo accounts and 50 across all live**,
shared by every user. 500 followers on one master event is ~10 seconds to place them all. Going past
it needs **more cTrader application registrations, not more servers** — a question for the broker.

`gateway.py` is built to exactly that shape: two long-lived connections, many accounts authenticated
on each (every message carries `ctidTraderAccountId`), heartbeat every 8s as the docs require.

---

## WHAT IS REMAINING — read this before starting anything on the copier

| # | item | state |
|---|---|---|
| 1 | **A real mirrored order has still never happened.** The engine is armed and both followers ready; the next VIX.1 signal is the proof. Look for a `PLACED` row naming the slave account in `/api/admin/copy/activity` | ⏳ waiting on a signal |
| 2 | **`gateway.py` is built but NOT wired.** `executors/ctrader.py` still opens its own connection per order. Wiring the transport through the gateway is the single riskiest change and was deliberately held back — copy trading only started working on 26 Sep | 🔨 next commit |
| 3 | **Durable fan-out.** A crash mid-fan-out silently drops the remaining followers. Needs a `dispatching` -> `dispatched` state on the master row and a replay on boot | 🔨 not started |
| 4 | **The horizontal lever is untested.** `COPY_WORKER_INDEX`/`COPY_WORKER_COUNT` shard masters by hash and production runs `worker 0/1`. Never run above one worker | 🔨 not started |
| 5 | **Cross-broker (Hola Prime).** Each broker's minimum stop distance (`slDistance`/`tpDistance`) is not read or enforced | ⏸ deferred by him |
| 6 | **`REMOVE BEFORE LAUNCH`** — the copy diagnostics endpoint is still live | ⏸ before launch |
| 7 | Only cTrader can mirror a RESTING order. Binance/DXtrade/TradeLocker followers skip PLACED/AMENDED/CANCELLED with that reason logged | by design, stated |

**Already done, do not redo:** the dry-run switch (26 Sep), the stop read off the order (21 Sep),
order mirroring (21 Sep), `clientOrderId` for idempotency, the four scale ceilings above.

## Fix log

### 2026-11-21 (i) — measured through the WHOLE copier: the database is now the limit (plan step 10)

`tests/capacity_dispatch.py` (run by hand: it needs Node) puts 2,000 followers in a real Postgres (PGlite over its
socket server — never Docker) and runs ONE master order through the real dispatcher, risk checks, job rows, follower
records, the pool and the executor, against the stand-in cTrader. Measured:

| followers | master order → last follower | broker over its limit | statements per follower |
|---|---|---|---|
| 200 | 3.7 s | 0 | 8 |
| 2,000 | **34.3 s** before the two fixes below | 0 | 8 |
| 2,000 | **25.8 s** after | 0 | 7 (5 once follower names are known) |

Every copy reached the broker, every job done, every copy recorded. **Two fixes from the measurement:** the Activity
log looked a follower's name up ON the event loop the first time it met it (two blocking queries per follower,
mid fan-out — the copier stood still meanwhile); it now prints the short id and fetches the name on a worker. And a
job is marked done in ONE write, not a read and a write. **What the number is and is not:** PGlite runs ONE query at a
time, so 25.8 s is the worst case; production Postgres runs up to 40 at once (COPY_DB_POOL) and was NOT measured
here. The sending side alone is 1.5 s for 2,000 (`tests/test_pool.py`). **Next cure (open):** write each fan-out's
follower records and log rows in batches instead of one follower at a time. `COPY_MAX_CONCURRENT_FOLLOWERS` stays 100:
the database, not this bound, is what waits.

### 2026-11-21 (h) — the delay of every copy, measured and shown (plan step 9)

Each copy job stores the broker's time on the master's event (`master_ms`) and on the follower's confirming event
(`follower_ms`) and the difference (`delay_ms`) — both from cTrader's own clock (`timing.broker_ms`: the deal's
execution time, else the order's/position's last update), so neither our clock nor the network distorts it. The
admin copy page's Activity tab opens with "Copy speed": copies today, the typical (median) and slowest delay today,
and the last 20 copies (`GET /api/admin/copy/delay`, `client/src/features/admin-copy/CopyDelayCard.tsx`). Columns
added with `ADD COLUMN IF NOT EXISTS` (migration rehearsed on PGlite). Checked in a browser (Playwright) in the light
and dark admin themes, empty and filled, at desktop and phone width. Proof: `tests/test_timing.py` 5.

### 2026-11-21 (g) — more than one machine when needed (plan step 8)

Follower ACCOUNTS are now shared out between workers by the same stable hash used for masters (`jobs.owner_of`), so
one account's connection lives in exactly one worker. A master event writes jobs for every follower; the master's
worker runs its own followers at once and wakes the others with `NOTIFY copy_jobs`; each other worker runs the jobs it
owns (`jobs.run_owned`, also checking every 5 s). Every job is CLAIMED atomically before it runs (`jobs.claim`:
pending → started only if still pending), so two workers — or the fan-out and the 5 s check — never both run it.
With one worker (production today) nothing changes. Proof: `tests/test_jobs.py` — 40 jobs, two workers: each run
exactly once, only by its owner, both got a share; a job already taken cannot be taken again. Not proven against the
stand-in broker with two worker processes (the plan said so) — proven at the database claim, which is where a double
run would come from.

### 2026-11-21 (f) — the repair sweep: copies that went their own way are put right (plan step 7)

Every minute, one account at a time, each pooled follower's open orders and trades are read and compared with EVERY
master that account copies (the master listener now keeps its resting orders, when it last read them, and which order
each open trade came from). Only copies (label `cp-…`) older than 2 minutes, and only against master reads under 90 s
old: a copy ORDER whose master order is gone → cancelled; a copy TRADE whose master trade is closed → closed (only if
the master listener was running when the copy opened — otherwise its origin cannot be known); a copy with NO STOP →
the master's stop through the normal stop path (the follower's risk cap still applies). Never opens a trade; every
repair in the Activity log (REPAIR). `sweep.py`, started with the pool. Proof: `tests/test_sweep.py` 10 — including
two masters on one account, where checking one master alone would have closed the other's copy (teeth).
Deviation from the plan, said plainly: repairs go to the Activity log and the container log, not to his DM — the
copier has no DM sender of its own.

### 2026-11-21 (e) — a crash mid fan-out no longer loses followers (plan step 6)

Every master event now writes one `copy_jobs` row per follower, in the SAME commit as the master's own row, before
anything is sent; each moves pending → started → done/failed (`jobs.py`, `dispatcher._exec_follower_bounded`). At
start-up (`engine`, 15 s after logins) unfinished jobs are finished: never started → sent; a started close / stop
change / order move or cancel → sent again (repeating it does no harm); a started ENTRY, PARTIAL CLOSE or order
placement → NOT resent (an entry is never retried — it could open a second trade), marked `unknown`, Activity log;
older than 10 minutes → `expired`, logged. Table in `docker-migrate.sql` + `shared/schema.ts` (migration run twice on
PGlite). Proof: `tests/test_jobs.py` 12 — a fan-out to three followers stopped mid-way: the one never reached gets its
copy once, the one mid-send is not repeated, a second restart sends nothing.

### 2026-11-21 (d) — the connection pool: many accounts on a few long-lived connections

His order: *"use the api we have for over 2000 users without the api even knowing it is serving 2000."* cTrader limits
CONNECTIONS (50 requests/s each), not users, and one connection carries many logged-in accounts. **Built:** `pool.py`
(accounts spread over connections, `COPY_ACCOUNTS_PER_CONN` = 50 each, per environment AND app; one client per
connection for life; on a drop the same client reconnects and logs everyone back in, staggered; a refused or logged-out
account logs in again with fresh credentials on next use); followers send through it (`executors/ctrader._run_pooled`,
one command per account at a time, every reply checked as its own by `_mine`); masters listen through it
(`providers/ctrader._start_pooled`); followers are logged in at start-up (`engine._warm_followers`, 10/s per
connection) and LISTENED to (`follower_watch.py`: a copy closed by hand or refused later is written as DRIFT).
"Too many requests" answers are resent a moment later, matched by the reply tag. Pace per connection 35/s (measured:
a busy machine flushes in bunches; at 45 and 30 messages ARRIVED over 50, at 25 none did). Followers at once: 100.
`gateway.py` (never wired) is DELETED. Switch: `COPY_USE_POOL` = off | demo | all.

**Measured on a stand-in cTrader in its own process** (`tests/fake_ctrader.py`, enforces 50/s per connection):
2,000 accounts logged in on 41 connections in 5.8 s, none over the limit; **one master trade copied to all 2,000 in
1.53 s**, no request over the limit, busiest connection 35 in a second; three accounts share one connection with one
login each; a drop → the same client, one connection, everyone back; another order's news is not taken as the reply;
a master on the pool hears its order before and after a drop. `tests/test_pool.py` 19, `test_follower_watch.py` 6.
NOT yet measured: 2,000 through the dispatcher (database included) — that is the next bottleneck to measure.

### 2026-11-21 (c) — every message waited for a once-a-second timer

**Found in the audit:** the cTrader library never writes a message when it is sent; it queues it and a ONE-SECOND
timer drains the queue (`ctrader_open_api/tcpProtocol.py`, `LoopingCall(_sendStrings).start(1)`), at 5 messages a
second by default. A copy is 3-4 messages in a row, each waiting for the reply to the one before, so each step waited
up to a second — most of the 3-5 s a copy took (20 Nov gold: master 02:03:08 → follower 02:03:13). **Fix:**
`ctrader_protocol.OwnQueueProtocol.send` writes at once while the connection has sent fewer than 45 in the current
second (cTrader allows 50); beyond that it queues in order, and every connection now drains its queue at 45/s
(`numberOfMessagesToSendPerSecond`), not 5. Proof: `tests/test_own_queue.py` 9 — on the wire at once (the library's
own class leaves it waiting), never more than 45 in a second, the rest kept in order. Step 2 (fault 1) of
`docs/copy-realtime-plan.md`, shipped early because it is safe on today's path.

### 2026-11-21 (b) — one master trade's events could overtake each other

**The audit (his ask: *"ensure slave copies every trade activity from the master account in almost real time"*).** Every
master event started as its own task (`providers/ctrader.py`, `asyncio.ensure_future`) and a follower copy takes 3-5 s
to place. So a move or cancel arriving meanwhile found no mirror and was SKIPPED (an orphan or stale order left on the
follower), and a fill arriving meanwhile was entered as a NEW trade — the follower in twice once the placement landed.
**Fix:** `lanes.py` — events name the master order and position they are about; each waits for the earlier events about
any of them, so placed → moved → filled → closed run in that order, while other trades and masters run side by side.
Proof: `tests/test_event_order.py` fires the four events 10 ms apart through the real listener against a slow fake
follower — copied once each, in order; with the lanes removed the move is skipped and the fill enters again.
This is step 1 of the plan in `docs/copy-realtime-plan.md`.

### 2026-11-21 — followers never got breakeven; a broker refusal read as "timed out"

**His ask (20 Nov):** *"I think copy trader is now working, can you check logs and see if its working fine?"* Copying
worked (open in 5 s, the half close and the close followed). Two faults, found on XAU/USD #265272334, master
`ctp2 · 5296567` → follower `ctrader4 · 5347048`; fixed on his order of 21 Nov (*"execute the copier plan"*):

1. **A master stop that protects profit was thrown away.** `risk_stop.follower_stop` only kept a master stop on the
   LOSING side of the entry; breakeven (3551.76 on a 3552.61 sell) fell through to "master had no stop" and the follower
   was reset to its full 1% loss stop (3577.73). The same rule runs on every master stop move, so no breakeven or lock
   had ever reached a follower. Now a stop at or past the entry on the winning side is kept exactly ("master's stop kept
   — protects profit"); every losing-side stop is still capped at the follower's %. Reversed followers are unaffected —
   their stop and target are swapped before this rule (`dispatcher`).
2. **The broker saying no was read as "timed out".** `executors/ctrader._on_message` ignored the order-error reply and
   the error response, so each refusal waited the full 20 s; three in a row (02:12-02:13) hid the reason. Now it
   resolves at once as `cTrader refused: <code> — <description>`. And a MODIFY to the stop and target the follower
   already has is no longer sent at all (`dispatcher._follower_levels` / `same_levels`) — the likely cause of those three.

Proof: `tests/test_risk_stop.py` 39 checks — the live trade's own numbers, breakeven kept for BUY and SELL, a losing
stop still capped, the refusal answered at once with its words (fails when the handler is switched off — tried), the
identical modify skipped.

### 2026-09-26 — the audit: it has never sent an order, and the reason is a switch

**His ask:** *"audit copy trader system, identify the problems and root causes and then fix it once
and for all. Since the last fix it has never worked."*

**ROOT CAUSE: `COPY_DRY_RUN=true`, set 2026-07-26 and never changed.** Every copy is computed in
full — filters, risk-% sizing, the 3% cap — and then LOGGED instead of sent. The two copies of
22 Sep are the proof that everything upstream works and stops at that one wall:

    2026-09-22T08:04:17  DRY_RUN  WOULD OPEN EURUSD 0.2  lots SL=1.14479 TP=1.14208 - nothing sent
    2026-09-22T15:05:43  DRY_RUN  WOULD OPEN GBPUSD 0.12 lots SL=1.33479 TP=1.33069 - nothing sent

`followerTradesTotal: 0` for two months is explained by this alone.

**The other blockers, in the order they bite:**

| | what | evidence | state |
|---|---|---|---|
| 1 | nothing to copy — the 5x-spread gate refused every VIX.1 signal 22-23 Sep, none since | `autotrade_refused` at 3.4x / 2.9x / 3.6x | removed 2026-09-26 |
| 2 | master events carried no stop, so risk-% sizing could not size | every OPEN 09-18 Sep has `stop_loss: None`; both 22 Sep OPENs carry theirs | fixed 21 Sep |
| 3 | **`COPY_DRY_RUN=true`** | the two rows above | **still on** |
| 4 | the session filter refuses his MANUAL evening trades | 4 rows 22:45-23:47 on 22 Sep, Sydney | working as configured |
| 5 | "No open follower position for master pos X" on closes | 7 rows | symptom of 3 |

**What the audit PROVED works, so nobody re-investigates it:** the order path fires (3 `PLACED`
master events recorded — the 21 Sep order-mirroring build is live); the stop fix works (no master
OPEN carried a stop before it, both did after); the engine is healthy (heartbeat ~1s, both
followers synced); and both follower accounts are DEMO, so switching dry-run off risks no real
money.

⚠ **Never exercised against a real broker:** `place_pending`, `amend_pending`, `cancel_pending` and
`find_position_by_label` have only met synthetic protobuf. The first real mirrored order is also
their first real test — watch that one.

**How to answer "is copy trading working" without reading any code:**

    GET /api/admin/copy/diagnostics   engine health + masterTradesTotal vs followerTradesTotal
    GET /api/admin/copy/activity      one row per ATTEMPT, each naming why it was skipped
    GET /api/admin/autotrade?days=N   whether the master produced anything to copy at all

⚠ `/api/admin/copy/all-trades` returned 0 rows while `masterTradesTotal` was 19 — do not trust it.

### Earlier entries

### 2026-09-21 — a resting order is mirrored; the stop is read from the order it arrives on

**What he saw.** *"if it was working then it would have copied that trade which was not filled and
later cancelled because it should mirror what is happening in master exactly."* His XAU/USD order
of 21 Sep was placed at 12:07 and cancelled at 12:10 without ever filling, and the follower saw
nothing. Separately, the record showed **12 activity rows, all SKIP, 0 follower trades** — copy
trading had never copied anything at all, in 19 days.

**Two symptoms, ONE root cause**, and it was three lines in `providers/ctrader.py`:

```python
pos = event.position if event.HasField("position") else None
if pos is None:
    return
```

A resting order has no position, so **every order event was discarded at the door** — accepted,
amended, cancelled, expired, rejected. That is the whole of symptom one. And symptom two followed
from it: VIX.1 attaches the stop when it PLACES the order, so the stop rides on those same
discarded events. By the time a fill produced a position the stop was not on it, risk-% sizing had
no distance to size by, the per-trade cap had no risk to measure, and every copy was refused.

**What was deleted, so it is not rebuilt.** A first fix on 2026-09-20 held the entry back, asked the
broker again, and waited up to three reconciles for the stop to turn up on the position
(`_awaiting_stop`, `MAX_STOP_WAITS`, `_release_awaiting`). It was aimed at the wrong layer — it was
chasing a number that was already in hand, on the same message. All of it is gone.

**What was built:** `_handle_order` and `_order_snap` on the listening end; `place_pending`,
`amend_pending`, `cancel_pending` and `find_position_by_label` on the acting end; `mirror.py` for
the matching and for the fill that sends nothing; `_protection()` for the stop.

**Measured:** the copy suite is 10 files and 227 checks, all passing
(`python copy_platform/tests/run_all.py`). `test_stop_before_copy.py` was rewritten against the new
mechanism rather than deleted — the requirement it protects is still real, only the mechanism
changed. **Not yet proved on his live accounts**, which is the only proof that counts: place a
VIX.1 order on the master, watch for a resting mirror on the slave, then confirm both endings —
a fill that sends no second order, and a cancel that takes the mirror off the book.
