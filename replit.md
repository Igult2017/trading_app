# FSD Journal (myfm | journal)

A professional-grade trading journal and signal analysis platform for Forex, Crypto, and Commodities traders.

## Run & Operate

- **Dev**: `npm run dev` — starts Express + Vite HMR on port 5000
- **Build**: `npm run build` — bundles frontend (Vite) + backend (esbuild) into `dist/`
- **Production**: `node dist/index.js`
- **DB push**: `npm run db:push` (drizzle-kit push)
- **Typecheck**: `npm run check`

Required env vars:
- `DATABASE_URL` — PostgreSQL connection (auto-set by Replit DB)
- `ADMIN_EMAIL` — admin login email (set)
- `ADMIN_SECRET` — admin login password/token (set)
- `GOOGLE_API_KEY` — Google Gemini AI (optional; AI features disabled without it)
- `TELEGRAM_BOT_TOKEN` — Telegram notifications (optional)
- `PYTHON_BIN` — Python executable path (set)

## Stack

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS v3, Radix UI, TanStack Query, Wouter routing
- **Backend**: Node.js + Express + TypeScript (tsx in dev, esbuild in prod)
- **ORM**: Drizzle ORM + node-postgres
- **Database**: Replit built-in PostgreSQL
- **AI**: Google Gemini via `@google/genai`
- **Python Services**: price daemon, OCR analyzer, signal scanner (called as subprocesses)

## Where things live

- `server/index.ts` — Express entry point
- `server/routes.ts` — All API routes (~3900 lines)
- `server/db.ts` — DB connection (Drizzle + pg pool)
- `server/db-init.ts` — Schema auto-creation on startup
- `shared/schema.ts` — Drizzle ORM schema (source of truth)
- `client/src/main.tsx` — React entry point
- `client/src/App.tsx` — Routing + providers
- `client/src/context/AuthContext.tsx` — Auth state (Supabase or local fallback)
- `server/lib/supabaseAdmin.ts` — Server-side Supabase client (nullable)

## Architecture decisions

- **Auth dual-mode**: Supabase auth when `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; falls back to local admin login via `ADMIN_EMAIL`/`ADMIN_SECRET` env vars. Currently running in local-only mode on Replit.
- **DB auto-init**: Tables are created via raw SQL in `server/db-init.ts` at startup (not Drizzle migrations), making the app self-bootstrapping.
- **Python as subprocesses**: Price daemon and AI/OCR scripts are spawned as child processes from Node; price daemon is currently disabled at startup (commented out).
- **Single port**: Both API and static/Vite frontend served on port 5000.
- **Graceful degradation**: Missing `GOOGLE_API_KEY` or Supabase credentials produce warnings, not crashes — AI and auth features degrade gracefully.

## Product

- Trading journal: log trades, capture decisions, track psychology
- Performance analytics: metrics, drawdown, timeframe analysis, strategy audit
- Trader AI chat: Gemini-powered Q&A with chat history persistence
- Economic calendar: live events scraped from multiple sources
- Market data: live prices, crypto data, interest rates
- Signal detection and copy trading infrastructure
- Admin panel for user management

## User preferences

- Keep price daemon disabled at startup (too slow / resource-heavy for Replit dev)
- Signal monitor disabled by default

## Gotchas

- `server/db-init.ts` runs raw SQL DDL on every startup — idempotent (`IF NOT EXISTS`) so safe
- Blog comments table creation fails if `blog_posts` table doesn't exist yet — non-fatal, handled with try/catch
- Supabase console warnings on startup are expected when running in local auth mode
- `npm run build` also runs `uv sync` for Python deps — ensure `uv` is available

## Pointers

- DB skill: `.local/skills/database/SKILL.md`
- Workflows skill: `.local/skills/workflows/SKILL.md`
- Env secrets skill: `.local/skills/environment-secrets/SKILL.md`
