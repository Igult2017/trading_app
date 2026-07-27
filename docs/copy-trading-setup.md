# Copy Trading — Operational Setup & Verification

The copy engine ships inside the app container (a watchdog in `start.sh`, default-on) and the code path is complete for all four roles + Telegram. What it needs to actually run is **environment configuration** — set these in Coolify (the same env the Node server uses; the engine reads the shared container env).

## Required env (engine crash-loops without these)
| Var | Used for | Notes |
|---|---|---|
| `DATABASE_URL` | everything | already set |
| `COPY_ENCRYPTION_KEY` | decrypting cTrader OAuth tokens | **Must be set BEFORE connecting any cTrader account.** Accounts connected before this was set store base64, not encrypted, tokens → decrypt-to-None → no trades. Reconnect any such account. |
| `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` | cTrader Open API | missing → engine import-crashes, watchdog loops every 60s |
| `CTRADER_SYNC_CLIENT_ID` / `CTRADER_SYNC_CLIENT_SECRET` | selects the **second** Open API app for NEW account connects | ⚠️ **OPEN ISSUE — these are currently SET in production and the second app is NOT approved, so its credentials fail.** `newConnectApp()` switches to it the moment both are present, so every new broker-account connect is issued under a credential that does not work. The signal platform is unaffected (pinned to `legacy`). Unset both + redeploy to fall back to the approved app. Full diagnosis, blast radius and the Open API research: [ctrader-open-api-apps.md](./ctrader-open-api-apps.md) |

## Telegram-channel copying (the bot path)
| Var | Notes |
|---|---|
| `TELEGRAM_COPY_BOT_TOKEN` | A **dedicated** bot from @BotFather, **different** from your signal-alert bot (`TELEGRAM_BOT_TOKEN`). Reusing the same token makes both pollers 409-conflict. Without this, "follow a channel" succeeds in the UI but **nothing copies** (now surfaced as a "bot not configured" warning + `botConfigured:false` in the API response). |

Then, per followed channel: **add the copy bot as an ADMIN of the channel.** A non-admin bot receives no channel posts. (Channel admin is the gate — BotFather "privacy mode" only affects groups.)

## Telegram "my own account" relay (advanced, optional)
| Var | Notes |
|---|---|
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | from my.telegram.org. Enables the Telethon user-session relay for private channels the bot can't admin. `telethon` must be in `copy_platform/requirements.txt`. |

## Verify it's alive
`GET /api/copy/engine-status` (auth required) now reports:
```json
{ "engineAlive": true, "lastHeartbeat": "...", "heartbeatAgeSec": 12,
  "mastersLoaded": 3, "providersRunning": 3,
  "ctraderConfigured": true, "copyBotConfigured": false,
  "relayConfigured": false, "encryptionKeySet": true }
```
- `engineAlive:false` (or a stale `heartbeatAgeSec`) → the engine isn't running — almost always a missing `CTRADER_*`/`COPY_ENCRYPTION_KEY` crash-loop. Check the container logs for a Python traceback.
- `copyBotConfigured:false` → set `TELEGRAM_COPY_BOT_TOKEN`.

## End-to-end smoke test (cTrader DEMO only)
1. Connect **two** cTrader **demo** accounts on the Accounts page (A, B).
2. Self-Copy: source A → target B → deploy.
3. Confirm in DB: `copy_masters`(broker_account_id=A, source_type=ctrader, is_active) + `copy_followers`(broker_account_id=B, master_id=…, is_active, risk_accepted) — **no** `copy_accounts` row.
4. Place a market order on A → within ~1–2 s it mirrors to B (`copy_trades_follower` executed; `copy_execution_logs` OPEN).
5. Telegram: only after the bot token is set + bot is channel admin; post a clean signal (`EURUSD BUY 1.0950 SL 1.0900 TP 1.1000`) and watch it mirror onto the connected demo account. Follower **must** be Fixed or Risk lot mode (multiplier copies 0 lots — now blocked server-side).

## Known engine semantics (by design)
- `max_daily_loss` is a **percent** of balance (default 2%), not a dollar amount — the wizard now labels it %.
- Risk-% lot sizing needs a signal SL **and** a synced `broker_accounts.balance`, else it sizes to 0 and skips.
- `hedge` direction on a cTrader **netting** account nets rather than truly hedges.
