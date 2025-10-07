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
- **Market Data**: Planned WebSocket connections for live feeds.
- **Session Monitoring**: Real-time tracking of major trading sessions (London, New York, Tokyo, Sydney).
- **Signal Generation**: Live scanning and notification system for trading opportunities.

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

## Real-Time Signal Generation
- **Scanning Frequency**: Every 1 minute for 62 instruments (28 forex, 20 US stocks, 4 commodities, 4 crypto).
- **Multi-Timeframe Analysis**: Higher TFs (1D, 4H) for bias/trend/zones; Lower TFs (1H, 15M) for entry confirmation.
- **Pending Setups System**: Multi-stage validation (Forming <75% confidence, Monitoring, Ready >=70% confidence).
- **Signal Thresholds**: Immediate (>=75%), Pending (50-74%), Ready (>=70%).

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