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

## Coolify deployment (Docker — recommended)

The app ships with a `Dockerfile` and `docker-compose.yml` for single-command deployment on any VPS.

### Critical: where to set environment variables

> **Hostinger's VPS server panel ≠ Coolify environment variables.**
> Variables set in Hostinger's control panel live at the *OS level* and are invisible inside
> Docker containers. You must enter them inside **Coolify → your service → Environment → Variables**.

Set every variable below inside Coolify's Environment Variables UI:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✓ | Auto-set if using Coolify's managed Postgres |
| `ADMIN_EMAIL` | ✓ | Admin login email |
| `ADMIN_SECRET` | ✓ | Admin login password |
| `GOOGLE_API_KEY` | optional | Gemini AI — AI features disabled without it |
| `TELEGRAM_BOT_TOKEN` | optional | Telegram alerts |
| `VITE_SUPABASE_URL` | optional | Supabase auth (falls back to local login without it) |
| `VITE_SUPABASE_ANON_KEY` | optional | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Supabase service key |
| `PYTHON_BIN` | optional | Default: `/usr/bin/python3` |
| `PORT` | optional | Default: `5000` |

### How docker-compose.yml passes env vars

The `docker-compose.yml` uses **null-value map entries** (`KEY:` with no value) for user-supplied vars.
This means Docker Compose reads the real value from whatever Coolify injected into the container
environment. It never writes an empty string — so Coolify's values are always preserved.

Do NOT use `${VAR:-}` in docker-compose overrides — the `:-` (empty default) silently sets the
var to `""`, which wipes out the Coolify-injected value and makes the service check show MISSING.

### Deploy steps

1. Push your code to the git repo connected to Coolify
2. In Coolify → your service → Environment → Variables, add every var from the table above
3. Trigger a new deployment (Coolify rebuilds the image and restarts the container)
4. Check the container logs — the startup SERVICE STATUS CHECK table will confirm all vars are OK

## Hostinger (external VPS) deployment — PM2 without Docker

Step-by-step for deploying directly on the VPS (no Docker), using PM2:

1. **Install Node.js 20+** and **Python 3.11+** on the server
2. **Clone / upload** the project files
3. **Install Python packages** (one-time, after any pyproject.toml change):
   ```bash
   pip install -r requirements.txt
   ```
4. **Install Node packages**:
   ```bash
   npm install
   ```
5. **Build the app**:
   ```bash
   npm run build
   ```
6. **Set environment variables** in Hostinger's control panel (or however your VPS exposes them):
   ```
   DATABASE_URL=postgres://user:pass@host:5432/dbname
   ADMIN_EMAIL=your@email.com
   ADMIN_SECRET=yourpassword
   GOOGLE_API_KEY=your_gemini_key_here
   TELEGRAM_BOT_TOKEN=...      # optional
   PYTHON_BIN=/usr/bin/python3 # set to whichever python has the packages installed
   NODE_ENV=production
   PORT=5000
   ```

7. **Run with PM2** (auto-restart on crash):
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   ```
   The `ecosystem.config.cjs` file captures the current shell environment at startup,
   so all env vars set in Hostinger's panel are automatically passed in.
   After changing any env var in the panel, just run:
   ```bash
   pm2 restart myfmjournal --update-env
   ```
   Or for a plain one-off run without PM2:
   ```bash
   node dist/index.js
   ```

> **Key rule**: `PYTHON_BIN` must point to the Python that has `cloudscraper` and `google-genai` installed.
> The server verifies this automatically at startup and logs a clear warning if it's missing.
> `requirements.txt` is generated from `pyproject.toml` — re-run `pip install -r requirements.txt` after any Python dependency change.

## Gotchas

- `server/db-init.ts` runs raw SQL DDL on every startup — idempotent (`IF NOT EXISTS`) so safe
- Blog comments table creation fails if `blog_posts` table doesn't exist yet — non-fatal, handled with try/catch
- Supabase console warnings on startup are expected when running in local auth mode
- `npm run build` also runs `uv sync` for Python deps — ensure `uv` is available
- `requirements.txt` is auto-generated via `uv export` — do not hand-edit it

## Pointers

- DB skill: `.local/skills/database/SKILL.md`
- Workflows skill: `.local/skills/workflows/SKILL.md`
- Env secrets skill: `.local/skills/environment-secrets/SKILL.md`
