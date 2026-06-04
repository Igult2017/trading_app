# Trading App

A full-stack forex/crypto/stocks trading journal and signal platform. Built for retail traders to log trades, run analytics, receive AI-validated trade signals via Telegram, and monitor live market setups.

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
- **AI**: Google Gemini 2.5 Flash (`@google/genai`) for screenshot analysis, signal validation, AI Q&A
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
3. `candle_cache` — TTL cache keyed `(symbol, tf)`, TTL = `max(55s, bar_duration * 0.80)`
4. Per instrument × strategy: 4 pre-filters (whitelist, session, trend, news) then `strategy.analyze()`
5. `signal_validator` — drops signals below `min_rr=2.0` or `min_confidence=0.70`, deduplicates
6. `chart_generator` — mplfinance PNG to temp file
7. `ai_validator` — Gemini chart validation (no-op if `GEMINI_API_KEY` absent)
8. `signal_repo.save()` → PostgreSQL `trading_signals` table
9. `event_bus.emit(SIGNAL_CONFIRMED)` → `dispatcher` sends Telegram photo

**Monitor loop** (every 30s): fetches `yfinance.fast_info.last_price`, checks TP/SL, emits `SIGNAL_CLOSED`.

**Signals display on the existing `AssetPage.tsx` — never create a new signals dashboard.**

### Adding a Strategy
1. Subclass `core.base_strategy.BaseStrategy`
2. Declare all 8 required class attributes: `name`, `id`, `enabled`, `required_timeframes`, `required_indicators`, `required_patterns`, `allowed_sessions`, `allowed_trends`; also `allowed_instruments`, `news_stance`, `news_impact_filter`
3. Implement `async analyze(candles: MTFCandles, indicators: IndicatorBundle, patterns: PatternBundle, news_context: NewsContext) -> StrategyResult`
4. Register in `strategies/__init__.py`: `strategy_registry.register(MyStrategy())`

**Currently stubbed**: zero strategies registered, zero indicators registered. The scan loop runs but produces no signals.

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
- **Gemini 2.5 Flash**: screenshot OCR, chart AI validation, Trader AI Q&A

---

## Environment Variables

All vars live in `.env` at project root (loaded by `dotenv/config`). Signal platform reads its own `signal_platform/.env`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_SECRET` | Yes | Admin login password / bearer token |
| `GOOGLE_API_KEY` | Optional | Gemini AI (screenshot analysis, signal validation, AI Q&A) |
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
- **150-line file limit** — split files before they exceed this; one responsibility per file
- **Dynamic timeframes only** — never hardcode TF values as enum constants; use string literals (`"M15"`, `"H4"`) or derive from `shared/mtf_utils.py`
- **Telegram is event-driven** — `dispatcher.py` fires on `SIGNAL_CONFIRMED` / `SIGNAL_CLOSED` events; never add polling loops
- **OANDA replaces yfinance** — when `OANDA_API_TOKEN` is present, swap `candle_fetcher._fetch_sync()`; no other code changes needed
- **Auto-push to GitHub** — a Stop hook is configured to push to `origin/main` after every session; do not disable it
- **Schema changes** — edit `shared/schema.ts` then run `npm run db:push`; never write raw SQL migrations
- **Server routes** — all API endpoints go in `server/routes.ts` via the `registerRoutes(app)` function; there is no `routes/` subdirectory

---

## UI Design Rules

When doing ANY frontend, UI, or component work — automatically do both of these without being asked:

1. **Always use context7** for live library documentation before writing code that touches:
   - Tailwind CSS classes or config
   - shadcn/ui components
   - Radix UI primitives  
   - React Query / TanStack
   - Drizzle ORM
   - Any npm package in this project
   Add "use context7" internally before generating any component code.

2. **Always use magic** to search the 21st.dev component library before building any UI element from scratch:
   - Buttons, cards, modals, tables, forms, charts, navbars, sidebars
   - Any visual component that could plausibly exist in a design system
   Search magic first — install if found, build from scratch only if not found.

These rules apply automatically. The user does not need to say "use context7" or "use magic" — Claude must trigger them on any UI task.
