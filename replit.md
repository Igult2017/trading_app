# Overview

The Infod Trading Partner System is a professional financial analysis platform designed for real-time market scanning, signal generation, trade history tracking, and advanced analytics. It specializes in Smart Money Concepts (SMC), multi-timeframe analysis, and various trading strategies including scalping, day trading, swing trading, and Opening Range Breakout (ORB). The system provides a Bloomberg Terminal-inspired interface, optimized for displaying dense financial information and supporting high-frequency trading decisions. Its primary purpose is to empower traders with sophisticated tools for identifying and acting on market opportunities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React 18 with TypeScript, using Vite for building.
- **UI/UX**: Custom magazine-style dark theme using Tailwind CSS with glass-card components, Montserrat/Playfair Display/JetBrains Mono fonts, and blue accent color scheme. Also uses Radix UI with shadcn/ui components on inner pages.
- **Homepage**: Self-contained component at `client/src/pages/HomePage.tsx` with its own navigation (3-tier: utility bar, main nav, sub-nav), search bar, content cards (Journal, Calendar, Major Pairs, US Stocks, Crypto, Strategies, Blog), and footer. Has built-in dark/light theme toggle.
- **Journal Dashboard**: Self-contained page at `client/src/pages/Journal.tsx` with its own internal header, collapsible sidebar (FSD AI, Dashboard, Journal, Metrics, etc.), KPI stat cards, equity curve chart, performance mix panel, trade log table, and activity calendar. Renders as standalone route at `/journal`. Sidebar navigation switches between views: Dashboard (default), Journal (`JournalForm` component), and Metrics (`MetricsPanel` component). Sidebar and main body scroll independently (height:100dvh, overflow:hidden on outer container).
- **Journal Form**: 4-step trade logging wizard at `client/src/components/JournalForm.tsx`. Steps: Decision (thesis, triggers, impulse checks, rule governance), Execution (screenshots, position details, timing, timeframes, entry management), Context (market environment, TF context, liquidity, session timing, quality scores, technical signals), Review (exit causation, performance data, planning vs execution, trade metrics, psychology, reflections). Renders when sidebar nav `activeNav === 'journal'`.
- **Metrics Panel**: Full trading analytics dashboard at `client/src/components/MetricsPanel.tsx` wired to `GET /api/metrics/compute` via TanStack Query. Fetches journal entries from DB, computes metrics on-demand via Python (`server/python/metrics_calculator.py` CLI mode). Displays: KPI cards (P&L, win rate, expectancy, trades, profit factor, R:R, rules adherence), market regime analysis, execution precision, clarity/confluence, psychology/discipline, direction bias, setup tags, trade grades, exit analysis, session/instrument/risk breakdowns, win/loss streaks, recovery stats, equity curve (from real trade data), risk of ruin, strategy performance table, and setup frequency table. Shows loading spinner while computing, empty state when no trades exist.
- **Strategy Audit**: AI Strategy Auditor at `client/src/components/StrategyAudit.tsx` with 4 levels: Strategy Audit (executive summary, edge detection, edge drivers, monitor items, weaknesses, psychology, probabilistic edge, risk/failure, edge components, logical verification), Evidence & Proof (variance/distribution, drawdown, equity variance, trade quality, conditional edge, heatmap profiles), Diagnostics (core robustness, loss clusters, execution asymmetry, regime transition, capital heat, automation risk), Action & Iteration (AI policy suggestions, guardrails, edge decay, final audit verdict). Renders when sidebar nav `activeNav === 'strategy'`.
- **Trade Vault**: Performance ledger at `client/src/components/TradeVault.tsx` wired to `GET /api/journal/entries` via TanStack Query. Displays journal entries as trade rows (date, asset, strategy, session, outcome, P/L) with summary stats. Edit via `PUT /api/journal/entries/:id`, delete via `DELETE /api/journal/entries/:id`. No separate DB table — reads directly from `journal_entries`. Uses JetBrains Mono + Montserrat fonts. Renders when sidebar nav `activeNav === 'vault'`.
- **Trading Calendar**: Monthly P&L calendar at `client/src/components/TradingCalendar.tsx` with day cells showing profit/loss amounts, trade counts, win rates; hover tooltips; month navigation; stat cards (Net P&L, Win Rate, Total Trades, W/L Ratio); color-coded profit/loss bars; responsive layout. Uses Montserrat font. Renders when sidebar nav `activeNav === 'calendar'`.
- **Inner Pages**: Legacy pages still use shared `Header.tsx` and `Footer.tsx` components with the old layout (to be migrated to new header/footer).
- **New Header/Footer Standard**: The homepage's built-in header (3-tier nav) and footer are the new design standard for all pages going forward. The old `Header.tsx`/`Footer.tsx` components in `components/` are legacy and should NOT be used for new pages.
  - `NewHeader.tsx`: Full 3-tier header (utility bar, main nav with logo, sub-nav). Used on the HomePage and any standard pages.
  - `JournalHeader.tsx`: Compact 2-row header specifically for the Journal dashboard. Row 1 is the utility bar (Telegram, Subscribe, theme toggle, auth). Row 2 merges the logo + all nav links (Home, Free Journal, TSC, Economic Calendar, Blog, Major Pairs, US Stocks, Commodities, Cryptocurrency, Verified Strategies) into a single row with smaller font sizes (8px). This eliminates the sub-nav row to maximize vertical space for the journal dashboard content.
  - `NewFooter.tsx`: Standard footer used on the HomePage. The Journal dashboard does NOT use a footer to maximize content space.
- **State Management**: TanStack React Query for data fetching and caching.
- **Routing**: Wouter for client-side navigation with `Link` component for instant page transitions (no full reloads). Root "/" and "/journal" render as standalone pages (no shared old header/footer), other routes use the legacy shared layout wrapper.

## Backend
- **Runtime**: Node.js with Express.js, written in TypeScript.
- **Session Management**: PostgreSQL-backed sessions using `connect-pg-simple`.

## Data Storage
- **Database**: PostgreSQL, hosted on Neon serverless.
- **ORM**: Drizzle ORM with Zod for schema validation.
- **Data**: Stores comprehensive trade history, real-time trading metrics, and scraped economic calendar data (15-minute cache, 7-day retention).

## Real-time Capabilities
- **Market Data**: Live price feeds for various asset classes via Python/tessa integration (Yahoo Finance, CoinGecko).
- **Session Monitoring**: Real-time tracking of major trading sessions (London, New York, Tokyo, Sydney).
- **Signal Generation**: Live scanning and notification system for trading opportunities, utilizing a modular strategy engine.
- **In-App Notifications**: PostgreSQL-backed system for trading sessions, economic events, and signals, with real-time updates.
- **Telegram Notifications**: Critical alerts for trading sessions and high/medium impact economic events via `node-telegram-bot-api`.

## Trading Analysis Framework
- **Methodologies**: Multi-timeframe analysis (1D, 4H, 30M, 15M, 1M), institutional candle patterns, Fair Value Gaps (FVG), order blocks, liquidity sweeps, Supply/Demand zone detection, and Change of Character (CHoCH) detection.
- **Risk Management**: Integrated stop-loss/take-profit with risk-reward ratios.
- **Strategy Engine**: Modular architecture (`server/strategies/`) allowing independent, isolated strategies with shared utilities (zone detection, swing points, candle patterns, multi-timeframe data).
- **SMC Strategy Implementation**: A 5-step adaptive timeframe analysis process (Clarity Analysis, Context Analysis, Zone Detection, Zone Refinement, Entry Detection with LTF Confirmation) focusing on quality setups with confidence scoring.

## AI Integration (Google Gemini)
- **Role**: Gemini acts as an ASSISTANT for signal validation, confidence adjustment, risk assessment, and quick market scans for the refined SMC strategy.
- **Screenshot Analysis**: Python service (`server/python/screenshot_analyzer.py`) uses `google.genai` (google-genai package) to analyze trading chart screenshots via Gemini 2.0 Flash. Runs as CLI child process spawned by Node.js (`server/services/screenshotAnalyzer.ts`), reads base64 image from stdin, outputs JSON to stdout. Extracts instrument, direction, prices, SL/TP, lot size, R:R, session, outcome, P/L, MAE/MFE, and more.
- **Metrics Computation**: Python service (`server/python/metrics_calculator.py`) computes trading analytics from journal entries. Runs as CLI child process spawned by Node.js (`server/services/metricsCalculator.ts`), receives journal entries JSON via stdin, outputs computed metrics JSON to stdout. On-demand computation only — no caching, no background jobs. API endpoint: `GET /api/metrics/compute`. Computes: core stats, streaks, session/instrument/direction/exit/risk breakdowns, equity curve, strategy performance, setup frequency, trade grades, psychology/discipline scores, day-of-week and timeframe breakdowns.
- **Critical Validation Rules**: Enforces no counter-trend trading unless CHoCH is confirmed, avoids unclear markets, and ensures trend alignment for signals.

## PNG Chart Generation
- **Functionality**: Generates professional, dark-themed trading charts with supply/demand zones, entry/SL/TP markers, and confidence percentages for Telegram. Utilizes `mplfinance` and `matplotlib` in Python.

## Real-Time Signal Management
- **Scanning**: Scans 62 instruments every minute using the modular strategy engine.
- **Lifecycle**: Signals move through stages (Forming, Monitoring, Ready, Active, Expired, Archived). Active signals have a 4-hour expiry.
- **Watchlist & Monitoring**: Tracks pending signals and monitors active signals for SL/TP hits, automatically archiving outcomes.

## Trading Journal
- **Purpose**: Records only confirmed/executed trades when signals hit stop-loss or take-profit levels.
- **Persistent Storage**: Uses PostgreSQL database for unlimited trade history (no more 60-trade limit from in-memory storage).
- **Journal Fields**: Symbol, type, strategy, entry/exit prices, stop-loss, take-profit, P&L, risk-reward ratio, duration, entry reason, lessons learned, asset class.
- **Filtering**: Time-based filters (Today, Week, Month, All Time) and outcome filters (Wins/Losses).
- **Statistics**: Total P&L, win rate, average win/loss, profit factor, wins/losses count.
- **Export**: CSV export functionality for further analysis.

# External Dependencies

## UI and Component Libraries
- **@radix-ui/**: Accessible UI primitives.
- **class-variance-authority**: Type-safe styling variants.
- **cmdk**: Command palette.
- **embla-carousel-react**: Touch-friendly carousels.
- **lucide-react**: Icon library.

## Database and Data Management
- **@neondatabase/serverless**: Serverless PostgreSQL.
- **drizzle-orm**: Type-safe ORM.
- **drizzle-zod**: Schema validation.
- **connect-pg-simple**: PostgreSQL session store.
- **@tanstack/react-query**: Data fetching and caching.

## Web Scraping and Data Collection
- **cheerio**: HTML parsing.
- **axios**: HTTP client.
- **node-cron**: Task scheduler.

## AI and Analysis
- **@google/genai**: Google Gemini AI SDK.
- **mplfinance**: Python library for generating trading charts.
- **matplotlib**: Chart rendering backend.
- **tessa**, **yfinance**, **pycoingecko** (Python libraries): Market data fetching.

## External APIs
- **Google Gemini API**: AI-powered signal validation and market scanning.
- **Yahoo Finance**: Free price data for stocks, forex, commodities.
- **CoinGecko**: Free cryptocurrency price data.
- **Telegram Bot API**: Signal notifications with PNG charts.
- **MyFXBook**: Primary economic calendar data source (web scraped). Located at `server/scrapers/economicCalendarScraper.ts` with scheduled scraping pre-London session (7:50 UTC), pre-NY session (14:20 UTC), and every 2 hours on weekdays.