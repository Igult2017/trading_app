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

When the master executes a trade on cTrader:

1. **cTrader pushes** a `ProtoOAExecutionEvent` over the open TCP connection.
2. The provider classifies the event:
   - `executionType = 2` → position opened → `OPEN`
   - `executionType = 3 or 4` → position closed → `CLOSE`
   - SL/TP changed on an existing position → `MODIFY`
3. **Dispatcher** fans out to all active followers of that master:
   - Filters by symbol whitelist/blacklist
   - Calculates lot size (`lot_calc.py`)
   - Applies direction (same/reverse/hedge)
   - Opens a short-lived TCP connection to the follower's cTrader account
   - Sends the matching order (`ProtoOANewOrderReq` / `ProtoOAClosePositionReq` / `ProtoOAAmendPositionSLTPReq`)
4. Up to **3 retries** with exponential back-off (2s, 4s, 8s) on failure.
5. **Every execution** — success or failure — is recorded in `copy_execution_logs`.

Total latency from master trade to follower order: **< 500ms** in normal conditions.

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
    │       └── on ProtoOAExecutionEvent:
    │             └── dispatch(event, master_id)
    │                 ├── save copy_trades_master
    │                 └── for each follower:
    │                     ├── get_ctrader_creds (+ refresh if needed)
    │                     ├── calc_lots / apply_direction / is_symbol_allowed
    │                     └── CTraderExecutor.open/close/modify_position()
    │                         ├── one-shot TCP connect
    │                         ├── ApplicationAuth → AccountAuth
    │                         ├── send order
    │                         └── await ProtoOAExecutionEvent (15s timeout)
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
| `Execution timed out after 15s` | cTrader API slow / order rejected | Check symbol name, account permissions, lot size limits |
| `Symbol XAUUSD filtered` | Blacklist match | Adjust `symbol_blacklist` on the follower row |
| Copy platform restarts every 5s | Python import error | Check `[CopyPlatform] ERR:` lines in server log |
