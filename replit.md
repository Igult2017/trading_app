# Overview

The Infod Trading Partner System is a professional financial analysis platform providing real-time market scanning, signal generation, trade history tracking, and analytics. It focuses on Smart Money Concepts (SMC), multi-timeframe analysis, and various trading strategies like scalping, day trading, swing trading, and Opening Range Breakout (ORB). The system features a Bloomberg Terminal-inspired interface, optimized for data-dense financial information and high-frequency decision-making.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Framework**: Radix UI with shadcn/ui
- **Styling**: Tailwind CSS with custom financial trading tokens

## Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript
- **Session Management**: Connect-pg-simple for PostgreSQL-backed sessions
- **Development**: Hot module replacement with Vite integration

## Data Storage
- **Primary Database**: PostgreSQL with Neon serverless hosting
- **ORM**: Drizzle ORM
- **Schema Validation**: Zod
- **Trade History**: Stores comprehensive trade records (entry/exit, P&L, strategy, timeframe).
- **Analytics Engine**: Real-time calculation of trading metrics (win rate, P&L, risk-reward).
- **Economic Calendar**: Web scraping-based system from Investing.com with 15-minute caching and 7-day retention.

## Economic Calendar Data Scraping
- **Primary Source**: Investing.com
- **Scraping Stack**: Cheerio (parsing), Axios (HTTP requests)
- **Rate Limiting**: 3-second delays, rotating user agents
- **Caching**: 15-minute cache, 7-day retention
- **Scheduling**: Upcoming events (15 mins), full week (daily at 00:00 UTC), hourly cleanup.
- **Data Standardization**: Normalizes event details (title, country, date/time, impact, forecast, actual, previous).
- **API Endpoints**: `/api/calendar/today`, `/api/calendar/week`, `/api/economic-events`.

## Design System
- **Color Palette**: Dark-mode with financial trading colors (blue, green, red, amber).
- **Typography**: Inter font for number readability.
- **Components**: Card-based layout with 18rem sidebar navigation.
- **Responsive Design**: Mobile-first with trading desk breakpoints.

## Real-time Capabilities
- **Market Data**: Live price feeds via Python/tessa integration (Yahoo Finance and CoinGecko).
- **Session Monitoring**: Real-time tracking of major trading sessions (London, New York, Tokyo, Sydney).
- **Signal Generation**: Live scanning and notification system for trading opportunities.

## Python Price Service (tessa Integration)
- **Location**: `server/python/price_service.py`
- **Libraries**: tessa, yfinance, pycoingecko
- **Data Sources**: 
  - Yahoo Finance for stocks, forex, commodities
  - CoinGecko for cryptocurrency (with Yahoo fallback)
- **Node.js Bridge**: `server/lib/priceService.ts` - spawns Python subprocess with JSON I/O
- **Caching**: 30-second in-memory cache to reduce API calls
- **API Endpoints**:
  - `GET /api/prices/status` - Check if price service is online
  - `GET /api/prices/:symbol?assetClass=stock|forex|commodity|crypto` - Single price
  - `POST /api/prices/batch` - Batch price requests (max 50 symbols)
- **Frontend Hook**: `client/src/hooks/usePrices.ts` - React Query integration with auto-refresh

## Trading Analysis Framework
- **Multi-timeframe Analysis**: 1D, 4H, 30M, 15M for analysis; 1M for entries.
- **Technical Indicators**: Non-lagging volume, momentum, and trend indicators.
- **Pattern Recognition**: Institutional candles, Fair Value Gaps (FVG), order blocks, liquidity sweeps.
- **Risk Management**: Integrated stop-loss/take-profit with risk-reward ratios.
- **Economic Calendar**: Tracks high/medium impact events with pre-release expectations and post-release analysis.

## In-App Notification System
- **Storage**: PostgreSQL table with read/unread status.
- **Types**: Trading sessions (5 min before London/NY open), economic events (30 min advance for all impacts), trading signals.
- **Real-time**: Unread count refreshes every 30 seconds.
- **API Endpoints**: CRUD for notifications, mark as read, delete, signal creation.
- **UI**: Popover in header with bell icon, badge, and management controls.

## Telegram Notification System
- **Integration**: node-telegram-bot-api for critical alerts.
- **Commands**: `/start`, `/stop`, `/resume`, `/status`.
- **Types**: Trading sessions (5 min before London/NY open), high/medium impact economic events (30 min advance).
- **Scheduling**: Checks every 5 minutes.
- **Frontend**: Telegram setup dropdown in header.

## Supply/Demand Zone Detection
- **Methodology**: Full range of base candle before institutional impulse.
- **Differentiation**: Impulse direction determines zone type (bearish = supply, bullish = demand).
- **Tracking**: Differentiates fresh vs. mitigated zones.
- **Strength**: Calculated based on impulse magnitude and price reaction.

## Liquidity Sweep Detection
- **Pool Identification**: Detects Equal Highs/Lows, Swing Highs/Lows, Session Highs/Lows, Daily/Weekly/Monthly Highs/Lows.
- **Sweep Detection**: Identifies price sweeping above/below liquidity pools.
- **Mitigation**: Requires price to mitigate supply/demand zones after a sweep with structural confirmation.
- **Entry Validation**: Close within zone AND next-candle reaction.
- **Scoring**: +15 for sweep, +35+ for confirmed zone mitigation.
- **Strategy Assignment**: "liquidity_sweep_mitigation" when criteria met.
- **Reasoning**: Provides descriptive details of swept pools.

## CHoCH (Change of Character) Detection
- **Pattern Definition**: Identifies trend reversals through structural changes (HH/HL to LH/LL or vice versa).
- **Swing Point Analysis**: Identifies HH, HL, LH, LL.
- **Trend Change**: Bullish CHoCH (downtrend to HH), Bearish CHoCH (uptrend to LL).
- **Entry Validation**: Confirmed CHoCH, targets unmitigated S/D zone, breaks 2+ S/D levels without mitigation, entry invalid if from unmitigated zone, rapid price push away from zone.
- **Scoring**: +40 for valid CHoCH, +10 for 3+ levels broken, +10 for strong zone targeting.
- **Priority**: Highest priority (CHoCH > liquidity sweep > traditional).
- **Risk-Reward**: 1:3 R:R.

## Modular Strategy Engine Architecture
- **Location**: `server/strategies/`
- **Core Components**:
  - `core/strategyRegistry.ts` - Central registry for all trading strategies
  - `core/baseStrategy.ts` - Abstract base class for all strategies
  - `core/types.ts` - Shared TypeScript types for strategies
- **Shared Utilities**: `server/strategies/shared/`
  - `zoneDetection.ts` - Supply/demand zone detection and tracking
  - `swingPoints.ts` - Swing point detection (HH, HL, LH, LL) and broken structure
  - `candlePatterns.ts` - Institutional candles, engulfing, pin bars, rejection candles
  - `multiTimeframe.ts` - Multi-timeframe data fetching and candle generation
- **Design Principles**:
  - Strategies are independent and isolated - one failure doesn't affect others
  - Shared utilities layer for common trading analysis functions
  - Strategy registry enables easy enable/disable and stats tracking
  - Each strategy implements `analyze()` method with standardized output

## SMC Strategy #1 (Smart Money Concepts)
- **Location**: `server/strategies/smc/`
- **Files**: config.ts, h4Context.ts, m15Zones.ts, zoneRefinement.ts, entryDetection.ts, index.ts
- **4-Step Analysis Process**:
  1. **H4 Context**: Determines market control (supply/demand/neutral) and trend direction
  2. **M15 Zone Detection**: Identifies unmitigated supply/demand zones, filters tradable zones
  3. **Zone Refinement**: Refines M15 zones to M5 (1.3 pips) → M1 (3 pips), stays M5 if M1 is messy
  4. **Entry Detection**: CHoCH, D/S-S/D flips, continuation patterns with zone reaction
- **Entry Types**: CHoCH (40 base confidence), D/S-S/D Flip (35), Continuation (30)
- **Confirmations**: Zone reaction (+15-20), reaction candle (+10), rejection candle (+10), strong zone (+10)
- **Targets**: Nearest unmitigated zone → H4 supply/demand → default 3:1 R:R

## Real-Time Signal Generation
- **Scanning Frequency**: Every 1 minute for 62 instruments (28 forex, 20 US stocks, 4 commodities, 4 crypto).
- **Strategy Engine**: Modular architecture runs all enabled strategies per instrument
- **Multi-Timeframe Analysis**: H4 for context/targets; M15 for zones; M5/M1 for refinement and entry.
- **Pending Setups System**: Multi-stage validation (Forming <75% confidence, Monitoring, Ready >=70% confidence).
- **Signal Thresholds**: Immediate (>=75%), Pending (50-74%), Ready (>=70%).
- **Signal Lifecycle**: Active (4-hour expiry window) → Expired → Auto-archived to trade history.
- **Expiry Tracking**: Live countdown timer displays time remaining until signal expires.
- **Auto-Archival**: Expired signals automatically moved to trade history with duration and outcome tracking.
- **Cleanup Scheduling**: Every 2 hours, expired signals are archived and removed from active list.

# External Dependencies

## UI and Component Libraries
- **@radix-ui/**: Accessible UI primitives.
- **class-variance-authority**: Type-safe variant API for styling.
- **cmdk**: Command palette.
- **embla-carousel-react**: Touch-friendly carousels.

## Database and Data Management
- **@neondatabase/serverless**: Serverless PostgreSQL.
- **drizzle-orm**: Type-safe ORM for PostgreSQL.
- **drizzle-zod**: Schema validation.
- **connect-pg-simple**: PostgreSQL session store.

## Development and Build Tools
- **@tanstack/react-query**: Data fetching and caching.
- **@hookform/resolvers**: Form validation with Zod.
- **date-fns**: Date manipulation.
- **wouter**: Minimalist React routing.
- **@replit/vite-plugin-**: Replit-specific tooling.

## Web Scraping and Data Collection
- **cheerio**: HTML parsing.
- **axios**: HTTP client.
- **node-cron**: Task scheduler.

## Styling and Design
- **tailwindcss**: Utility-first CSS framework.
- **tailwind-merge**: Tailwind class merging.
- **clsx**: Conditional className utility.
- **lucide-react**: Icon library.