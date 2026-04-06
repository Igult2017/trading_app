# FSD Journal — Trading Journal & Signal Analysis Platform

## Overview
A professional-grade trading journal and signal analysis platform for forex, cryptocurrency, and commodity traders. Features real-time market data, AI-driven signal validation, automated trade journaling with OCR, and advanced performance analytics.

## Architecture

### Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + Radix UI + TanStack Query
- **Backend**: Node.js + Express + TypeScript (tsx for dev)
- **Database**: PostgreSQL via Drizzle ORM (Replit built-in DB)
- **Python**: Sub-process scripts for advanced analytics (metrics_calculator.py, price_daemon.py)
- **Charts**: lightweight-charts for technical analysis views
- **Auth**: Passport.js (local strategy) + express-session

### Project Structure
```
client/          React frontend (Vite)
  src/
    components/  UI components (trading charts, metrics panels, forms)
    pages/       Dashboard, Journal, Analytics, Economic Calendar
server/          Express backend (TypeScript)
  routes.ts      All API endpoints
  db.ts          PostgreSQL connection (Drizzle ORM)
  db-init.ts     Schema initialization
  services/      OCR, signal detection, sentiment analysis, Python bridges
  python/        Python scripts (metrics_calculator.py, price_daemon.py)
  scrapers/      Economic calendar, interest rate scrapers
  strategies/    Trading strategies (Smart Money Concepts)
  lib/           Shared utilities (priceService, pythonBin, etc.)
shared/          Shared schema (schema.ts) used by both client and server
python/          Root-level signal scanner utility
```

### Key Files
- `shared/schema.ts` — Database schema and Zod validation (source of truth)
- `server/routes.ts` — All API routes
- `server/db.ts` — Database connection
- `server/index.ts` — App entry point (dev)
- `server/index.prod.ts` — App entry point (prod)
- `client/src/main.tsx` — React entry point
- `vite.config.ts` — Vite configuration

## Running the App

### Development
```
npm run dev
```
Runs on port 5000 (Express serves both API and Vite dev server).

### Production Build
```
npm run build
npm start
```

### Database
```
npm run db:push   # Push schema changes to database
```

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` — DB credentials
- `GEMINI_API_KEY` — Google Gemini AI (for signal validation/OCR)
- `TELEGRAM_BOT_TOKEN` — Telegram bot for notifications

## Workflow
- **Start application**: `npm run dev` — runs on port 5000 (webview)
