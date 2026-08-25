# Trading App

A full-stack forex/crypto/stocks trading journal and signal platform. Built for retail traders to log trades, run analytics, receive AI-validated trade signals via Telegram, and monitor live market setups.

---

## ⚠ READ THESE TWO FIRST — before the code, before answering anything

His instruction, 2026-08-25: *"everytime i ask you a question about this code we start from scratch
which introduces bugs along the way. Keep its map and progress."*

| file | when |
|---|---|
| **[docs/MAP.md](docs/MAP.md)** | **always.** Where everything lives, what state it is in, and the SETTLED rulings that must not be re-derived |
| **[docs/OPEN.md](docs/OPEN.md)** | whenever something is broken or you are picking up work. The single list of what we have NOT addressed |

`docs/MAP.md` points at the one deeper doc each question needs. **Do not go straight to the code and
work it out** — that is what keeps reintroducing defects. `docs/open-items.md` is now a HISTORICAL
log only; `OPEN.md` supersedes it for anything still open.

---

## Tech Stack

- **Runtime**: Node.js (ESM, `"type": "module"`), TypeScript via `tsx` (dev) / `esbuild` (prod)
- **Server**: Express 4.x — single monolithic `server/routes.ts` (4,358 lines), no sub-router files
- **Client**: React 18 + Vite 5 + TailwindCSS 3 + `wouter` (SPA routing, not Next.js)
- **UI**: Radix UI primitives + shadcn/ui pattern + Lucide icons + Recharts + `lightweight-charts`
- **State**: TanStack React Query 5
- **ORM**: Drizzle ORM + `drizzle-kit push` (no migration files, schema-push only)
- **DB**: PostgreSQL via `pg` / `@neondatabase/serverless`; signal platform uses SQLite (`signal_platform/signals.db`)
- **Auth**: Supabase JWT (`@supabase/supabase-js`) + Passport.js local fallback + `express-session`
- **AI**: Google Gemini 2.5 Flash (`@google/genai`) for screenshot analysis and AI Q&A (Node side only — signal-platform AI validation removed 2026-07-22)
- **Signal Platform**: Python 3, asyncio, APScheduler, SQLAlchemy, yfinance, mplfinance, `python-telegram-bot`
- **Real-time**: WebSockets (`ws`), Telegram Bot API (event-driven, never polled)

---

## Directory Structure

```
client/          React SPA — pages, components, context, hooks, lib
server/          Express API — routes.ts, services/, scrapers/, lib/, strategies/
shared/          schema.ts only — Drizzle table definitions + Zod insert schemas
signal_platform/ Standalone Python signal engine — own SQLite DB, asyncio event loop
python/          Server-side Python helpers (price_daemon.py, metrics calculators)
uploads/         Blog image uploads
dist/            Build output (dist/public/ for client, dist/index.js for server)
docs/            Project documentation
```

**Aliases**: `@` → `client/src`, `@shared` → `shared/`, `@assets` → `attached_assets/`

---

## Key Workflows

### Start dev server
```bash
npm run dev
# Runs: NODE_ENV=development tsx server/index.ts
# Server listens on PORT (default 5000)
# Vite dev middleware serves client HMR
```

### Build for production
```bash
npm run build
# 1. uv sync (Python deps)
# 2. vite build (client → dist/public/)
# 3. esbuild (server → dist/index.js)
npm start
# Runs: npm run db:push && NODE_ENV=production node dist/index.js
```

### Push DB schema changes
```bash
npm run db:push   # drizzle-kit push — no migration files generated
```

### Run signal platform
```bash
cd signal_platform && python main.py
# Boots: DB, plugin registry, event bus, APScheduler (60s scan, 30s monitor)
# Requires: signal_platform/.env with DATABASE_URL, TELEGRAM_BOT_TOKEN, etc.
```

---

## Signal Platform Architecture

**Entry**: `signal_platform/main.py` wires asyncio loop, DB, plugin registries, scheduler.

**Scan loop** (every 60s via APScheduler):
1. `instrument_filter` — returns open forex pairs (Mon 00:00 – Fri 22:00 UTC)
2. `candle_fetcher.prefetch_all()` — concurrent yfinance fetch, skips cache hits
3. `candle_cache` — TTL cache keyed `(symbol, tf)`. **A copy NEVER spans a bar close**, and inside
   the last 6 minutes of a bar it refreshes every ~55s so the FORMING bar is current. (Was a flat
   `max(55s, bar_duration * 0.80)` until 2026-08-20 — 48 minutes on H1, which is right for closed
   bars and wrong both for the forming bar and for noticing that a bar has closed at all. That is
   what made signal delivery intermittently late. M1/M2 keep their flat 20s.)
4. Per instrument × strategy: 4 pre-filters (whitelist, session, trend, news) then `strategy.analyze()`
5. `signal_validator` — drops signals below `min_rr=2.0` or the strategy's confidence floor (`min_confidence=0.70` global, per-strategy overrides e.g. `vix1:0.60`), deduplicates
6. `charting/signal_card.render_async()` — the PNG card (candles + entry/stop/target + the numbers
   set in **Playfair Display**, bundled at `charting/fonts/`). Attached at ONE place,
   `orchestrator/strategy_runner._attach_chart`, for BOTH the confirmed and the alert emit — never
   inside a strategy, which would drift at the next `return` added. Rebuilt from scratch 2026-08-03;
   the old `chart_generator.py` was orphaned and was deleted, not revived. A render failure returns
   None and the dispatcher falls back to text — **a chart must never take a signal down.**
7. `signal_repo.save()` → PostgreSQL `trading_signals` table
8. `event_bus.emit(SIGNAL_CONFIRMED)` → `dispatcher` sends Telegram photo

(AI/Gemini signal validation was REMOVED 2026-07-22 — the user no longer uses it; there is no `ai_validator` step.)

**Monitor loop** (every 30s): latest M1 bar's high/low from cTrader. Two phases per signal, split by `triggered_at`: PENDING (stop order — entry touch stamps `triggered_at`; SL touch first = CANCELLED/expired, never a loss) then TRIGGERED (TP/SL as a real position). Emits `SIGNAL_CLOSED`; releases dedup keys on close AND on 24h expiry.

**Signals display on the existing `AssetPage.tsx` — never create a new signals dashboard.**

### Before touching VIX.1 or BX-S/D — READ THE DOC FIRST
`docs/strategies/vix1.md` and `docs/strategies/bx-sd.md` hold the SETTLED rules (in the user's own
words / the book's own quotes), the fix log, and what is still open. They exist because the same rules
kept being re-derived and re-broken. Do not re-derive them; if a change contradicts one, it is wrong.

**Each strategy has an ARCHITECTURE doc — read it FIRST**: `docs/strategies/bx-sd-architecture.md`
and `docs/strategies/vix1-architecture.md`.

**BX-S/D also has a MEASURED doc — `docs/strategies/bx-sd-measured.md`.** Read it before asking "is
BX working?", before quoting any number about how often it fires, and before reporting a finding from
a measurement. It holds the one-year setup counts, the two commands that re-create them, what each
number does NOT mean, and the five false alarms of 2026-08-23 with the rules that came out of them.

**BX-S/D: read `docs/strategies/bx-sd-architecture.md` FIRST** — it holds the SHAPE (module map,
the zone-book model, the lifecycle, and the KNOWN OPEN DEFECTS). `bx-sd.md` holds the RULES; parts of
its implementation description are superseded and it says so at the top.

### STRATEGIES ARE INDEPENDENT — never reference one while discussing another
User, 2026-07-27: *"Do not reference another strategy when talking about one. All strategies are
independent."* This covers **docs, audits, reports and explanations**, not just code. No "unlike X",
no "X does it this way", no "the same bug we found in X", no comparing their coverage or results.

Describe, judge and fix each strategy on **its own terms and its own playbook**. If something is
genuinely shared platform infrastructure (candle feed, monitor, dispatcher), name the INFRASTRUCTURE,
never the other strategy that also uses it. Comparison is how one strategy's rules leak into another.

### NEVER RUN A BACKTEST WITHOUT EXPLICIT APPROVAL
User, 2026-07-27: *"Never backtest without my approval."* Ask first, every time — **including when an
approved plan lists one under verification. Plan approval is not backtest approval.**

Covers any historical simulation that scores the strategy (`bx_winrate.py`, `bx_walkforward.py`,
win-rate / frequency / fixed-R sweeps). Unit tests, invariants, regressions and live-log checks need
no approval; a backtest does.

**Why:** every BX number produced so far measured parameters that were NOT the user's — a ~3-pip stop
off the M1 POI instead of his 4H-distal stop, and a ~20R structural target instead of his 3R. Poor
results from the wrong parameters are noise presented as evidence. Never present a backtest as a
verdict on his method; at most it is a check on the CODE, once the parameters are confirmed to be his.

### THE STRATEGY DOCS ARE UPDATED IN THE SAME CHANGE — never afterwards, never "later"
**Any change to a strategy updates its doc as part of that change**, before it is committed. User's
instruction, 2026-07-27: *"you will be changing that documentation every time we make a change so that
you dont forget any change and how the strategy works."*

What must be updated, every time:
- **architecture doc** — if the SHAPE moved (a module added/deleted/rewired, a new state, a new
  invariant, a changed constant)
- **fix log in `bx-sd.md` / `vix1.md`** — what broke, the ROOT CAUSE, the fix, and the measured
  before/after
- **KNOWN OPEN DEFECTS** — add what you found and did not fix; delete what you actually fixed. A stale
  "open defect" list is worse than none, because the next session trusts it.

A change is not done until the doc matches the code. This exists because the code has repeatedly
drifted from the doc, and the next session then guesses — which is how the same defects came back.

**The rule that spans both:** a **LEVEL must be read from a CLOSED candle** (`shared/mtf_utils.closed_only`),
a **TRIGGER or current price stays LIVE**. The feed returns the still-forming bar as its newest — both
strategies shipped a bug from reading it as a level, and a backtest can never catch it (every
historical bar is closed).

### Adding a Strategy
1. Subclass `core.base_strategy.BaseStrategy`
2. Declare all 8 required class attributes: `name`, `id`, `enabled`, `required_timeframes`, `required_indicators`, `required_patterns`, `allowed_sessions`, `allowed_trends`; also `allowed_instruments`, `news_stance`, `news_impact_filter`
3. Implement `async analyze(self, context: StrategyContext) -> StrategyResult`. **One argument.** The
   platform builds the context (`core/strategy_context.py`) and it carries `symbol`, `candles`
   (`MTFCandles`, read with `.get(TF.H4)`), `indicators`, `patterns`, `features`, `session`, `news`,
   `spread`, `volatility`. Build `MTFCandles` as `MTFCandles(_data={TF.H4: bars})` — it has no
   `symbol` field.
4. Register in `strategies/__init__.py`: `strategy_registry.register(MyStrategy())`

**Registered**: two strategies — `Vix1Strategy` (`vix1`) and `BXStrategy` (`bx_sd`). Zero *indicators*
are registered; both strategies compute what they need internally, so the scan loop produces signals
without the indicator registry. (This block read "zero strategies registered, the scan loop produces
no signals" until 2026-07-30, long after both shipped.)

### Key shared utilities for strategy authors
- `shared/pullback_detector.py` — `latest_pullback()`, full Fibonacci analysis (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0)
- `shared/zone_detection.py` — `find_zones()`, `unmitigated()` supply/demand zones
- `shared/liquidity_sweep.py` — `detect_sweeps()` stop-hunt signatures
- `shared/candle_math.py` — `body_size`, `upper_wick`, `lower_wick`, `body_ratio`, `avg_body`, `is_bullish`
- `shared/swing_points.py` — `find_swing_points()`, `classify_structure()` (labels HH/HL/LH/LL)
- `shared/trend_detector.py` — `detect()` returns `Trend.UPTREND / DOWNTREND / RANGING`

### 21 Candle Patterns (all TF-agnostic, `required_timeframes = []`)
`volume_candle`, `marubozu`, `long_upper_wick`, `long_lower_wick`, `violent_candle`, `doji`, `gravestone_doji`, `dragonfly_doji`, `long_legged_doji`, `hammer`, `shooting_star`, `inverted_hammer`, `hanging_man`, `bullish_engulfing`, `bearish_engulfing`, `institutional`, `impulse`, `rejection`, `inside_bar`, `outside_bar`, `spinning_top`

---

## Database

**ORM**: Drizzle ORM. Schema file: `shared/schema.ts`. Config: `drizzle.config.ts`. Connection: `server/db.ts` reads `DATABASE_URL`. No migration files — use `npm run db:push`.

**Key tables**: `trades`, `journal_entries`, `trading_sessions`, `trading_signals`, `pending_setups`, `user_profiles`, `blog_posts`, `copy_accounts`, `copy_masters`, `copy_followers`, `economic_events`, `broker_accounts`, `synced_trades`, `notifications`

All IDs are UUID strings (`varchar`, `gen_random_uuid()`). All categoricals are plain `text` columns (no PG enums). Signal platform writes to `trading_signals` via SQLAlchemy `storage/models.py` — schema matches exactly so Node API reads these without changes.

---

## Data Sources

- **yfinance**: current candle source for signal platform — being replaced
- **OANDA demo** (planned): free live forex candles; swap in by replacing `candle_fetcher._fetch_sync()` — same signature, nothing else changes; credentials go in `signal_platform/.env`
- **TradingView Screener**: live indicator values across all timeframes, no API key required
- **MyFXBook scraper**: homepage economic calendar and central bank rates
- **Gemini 2.5 Flash**: screenshot OCR, Trader AI Q&A (Node side only)

---

## Environment Variables

All vars live in `.env` at project root (loaded by `dotenv/config`). Signal platform reads its own `signal_platform/.env`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_SECRET` | Yes | Admin login password / bearer token |
| `GOOGLE_API_KEY` | Optional | Gemini AI (screenshot analysis, AI Q&A — Node side only) |
| `TELEGRAM_BOT_TOKEN` | Optional | Telegram trade alerts (event-driven only, never polled) |
| `VITE_SUPABASE_URL` | Optional | Supabase auth URL |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase service role (admin ops) |
| `PORT` | Optional | Default: 5000 |
| `DB_SSL` | Optional | `true`/`false` to force SSL on DB connection |
| `ADMIN_EMAIL` | Optional | Email for local admin account |

---

## Important Rules

- **No new signal dashboards** — signals always display on the existing `client/src/pages/AssetPage.tsx`
- **File length: aim for 150 lines, 200 is the limit** — split when a file passes 200 or when it
  stops having one responsibility. A 160-line file is fine and should be left alone; splitting it to
  reach 150 is churn. (Corrected 2026-08-09 — this read as a flat 150 and caused needless splits.)
- **Dynamic timeframes only** — never hardcode TF values as enum constants; use string literals (`"M15"`, `"H4"`) or derive from `shared/mtf_utils.py`
- **Telegram is event-driven** — `dispatcher.py` fires on `SIGNAL_CONFIRMED` / `SIGNAL_CLOSED` events; never add polling loops
- **OANDA replaces yfinance** — when `OANDA_API_TOKEN` is present, swap `candle_fetcher._fetch_sync()`; no other code changes needed
- **Auto-push to GitHub** — a Stop hook is configured to push to `origin/main` after every session; do not disable it
- **Schema changes** — edit `shared/schema.ts` then run `npm run db:push`; never write raw SQL migrations
- **Server routes** — all API endpoints go in `server/routes.ts` via the `registerRoutes(app)` function; there is no `routes/` subdirectory

