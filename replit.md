# FSD Journal

A professional-grade trading journal and signal analysis platform for Forex, Crypto, and Commodities traders.

## Trader AI chat persistence (Apr 2026)
- New tables `ai_chats` and `ai_chat_messages` created in `server/db-init.ts`.
- Storage helpers: `server/services/aiChatStore.ts` (raw `db.execute(sql\`…\`)`).
- Endpoints in `server/routes.ts`:
  - `GET    /api/trader-ai/chats[?sessionId=…]` — list user's chats
  - `GET    /api/trader-ai/chats/:id`           — load one chat with messages
  - `POST   /api/trader-ai/chats`               — create empty chat
  - `PATCH  /api/trader-ai/chats/:id`           — rename
  - `DELETE /api/trader-ai/chats/:id`           — delete (cascades to messages)
  - `POST   /api/trader-ai/chat` now accepts/returns `chatId`; persists user + assistant turns; auto-titles from first question.
- Frontend `client/src/components/TraderAI.tsx` has a left sidebar with chat history, "New chat" button, rename + delete actions, and active-chat highlight.

## Architecture

**Full-stack application:**
- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, Radix UI, TanStack Query, Wouter routing
- **Backend**: Node.js + Express, TypeScript (tsx in dev), Drizzle ORM
- **Database**: PostgreSQL (Replit built-in), managed with Drizzle Kit
- **Python Services**: Flask-based internal services for OCR, analytics, price daemon

## Running the App

The app starts with `npm run dev` which runs `tsx server/index.ts`.

- Server listens on port 5000 (set via `PORT` env var)
- In development, Vite middleware is mounted on the Express server for HMR
- In production, built static files are served from `server/public`

## Key Files

| Path | Description |
|------|-------------|
| `server/index.ts` | Main Express server entry point |
| `server/routes.ts` | All API route definitions |
| `server/db.ts` | Database connection (Drizzle + pg) |
| `server/db-init.ts` | Schema initialization on startup |
| `shared/schema.ts` | Drizzle ORM schema definitions |
| `client/src/main.tsx` | React app entry point |
| `client/src/App.tsx` | Routing and layout |
| `server/python/price_daemon.py` | Python price service (optional) |

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (set by Replit database integration)
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` - Individual DB credentials
- `PORT` - Server port (default 5000)
- `PYTHON_BIN` - Path to Python executable
- `GOOGLE_GEMINI_API_KEY` / `GEMINI_API_KEY` - For AI signal analysis (optional)
- `TELEGRAM_BOT_TOKEN` - For Telegram notifications (optional)

## Database

Uses Replit's built-in PostgreSQL. Tables are auto-created on startup via `server/db-init.ts`.

To push schema changes: `npm run db:push`

## Deployment

Build: `npm run build` (builds Vite frontend + bundles server with esbuild)
Run: `node dist/index.js`
