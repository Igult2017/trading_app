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

## Fix log

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
