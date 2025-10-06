# Overview

The Infod Trading Partner System is a professional financial trading analysis platform designed to provide real-time market scanning, signal generation, trade history tracking, and analytics capabilities. The system focuses on Smart Money Concepts (SMC), multi-timeframe analysis, and advanced trading strategies including scalping, day trading, swing trading, and Opening Range Breakout (ORB). Built with a modern tech stack, it delivers a Bloomberg Terminal-inspired interface optimized for data-dense financial information and high-frequency decision making.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern component patterns
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **UI Framework**: Radix UI primitives with shadcn/ui component library for accessibility and consistency
- **Styling**: Tailwind CSS with custom design tokens optimized for financial trading interfaces

## Backend Architecture
- **Runtime**: Node.js with Express.js framework for REST API endpoints
- **Language**: TypeScript throughout for consistency and type safety
- **Session Management**: Connect-pg-simple for PostgreSQL-backed session storage
- **Development**: Hot module replacement with Vite integration for seamless full-stack development

## Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless hosting for scalability
- **ORM**: Drizzle ORM for type-safe database operations and migrations
- **Schema Validation**: Zod for runtime type checking and data validation
- **Trade History System**: Backend storage for trade records with comprehensive details including entry/exit prices, P&L, strategy, and timeframe data
- **Analytics Engine**: Real-time calculation of trading metrics including win rate, average P&L, risk-reward ratios from stored trade data
- **Economic Calendar System**: Web scraping-based system for economic events with automated data collection from Investing.com, 15-minute caching, and 7-day retention

## Economic Calendar Data Scraping
- **Primary Source**: Investing.com economic calendar
- **Backup Sources**: ForexFactory, FXStreet, TradingEconomics (configured but disabled)
- **Scraping Stack**: Cheerio for HTML parsing, Axios for HTTP requests
- **Rate Limiting**: 3-second delays between requests, rotating user agents
- **Caching Strategy**: 15-minute cache duration, 7-day data retention
- **Scheduling**: 
  - Upcoming events: Scraped every 15 minutes
  - Full week data: Daily scrape at midnight (00:00 UTC)
  - Cleanup: Hourly removal of old events
- **Data Standardization**: All events normalized with title, country, date/time (UTC), impact level, forecast/actual/previous values, source attribution
- **API Endpoints**:
  - `/api/calendar/today` - Today's economic events
  - `/api/calendar/week` - Week's economic events
  - `/api/economic-events` - Upcoming events (24 hours)

## Design System
- **Color Palette**: Dark-mode primary with financial trading color scheme (trading blue, profit green, loss red, alert amber)
- **Typography**: Inter font optimized for number readability with tabular figures
- **Components**: Professional card-based layout with sidebar navigation (18rem width for trading-specific requirements)
- **Responsive Design**: Mobile-first approach with breakpoints optimized for trading desk environments

## Real-time Capabilities
- **Market Data**: WebSocket connections planned for live market feeds and trading session tracking
- **Session Monitoring**: Real-time tracking of London, New York, Tokyo, and Sydney trading sessions
- **Signal Generation**: Live scanning and notification system for trading opportunities

## Trading Analysis Framework
- **Multi-timeframe Analysis**: 1D, 4H, 30M, 15M for analysis with 1M for precise entries
- **Technical Indicators**: Non-lagging tools including volume, momentum, and trend direction indicators
- **Pattern Recognition**: Support for institutional candles, Fair Value Gaps (FVG), order blocks, and liquidity sweeps
- **Risk Management**: Integrated stop-loss and take-profit calculations with risk-reward ratios
- **Economic Calendar**: Track high and medium impact economic events with pre-release expectations (forecast, previous, futures-implied) and post-release analysis (actual values, surprise factor, market impact assessment)

# External Dependencies

## UI and Component Libraries
- **@radix-ui/**: Complete suite of accessible UI primitives (accordion, dialog, dropdown, navigation, etc.)
- **class-variance-authority**: Type-safe variant API for component styling
- **cmdk**: Command palette interface for power user workflows
- **embla-carousel-react**: Touch-friendly carousel components for data visualization

## Database and Data Management
- **@neondatabase/serverless**: Serverless PostgreSQL with WebSocket support for real-time features
- **drizzle-orm**: Type-safe ORM with PostgreSQL dialect
- **drizzle-zod**: Schema validation integration
- **connect-pg-simple**: PostgreSQL session store for Express

## Development and Build Tools
- **@tanstack/react-query**: Powerful data fetching and caching solution
- **@hookform/resolvers**: Form validation with Zod integration
- **date-fns**: Lightweight date manipulation library
- **wouter**: Minimalist routing library for React
- **@replit/vite-plugin-**: Replit-specific development tooling for enhanced debugging

## Web Scraping and Data Collection
- **cheerio**: Fast, flexible HTML parsing for web scraping economic calendar data
- **axios**: Promise-based HTTP client for fetching web pages with configurable headers and timeouts
- **node-cron**: Task scheduler for automated scraping at regular intervals (every 15 minutes for upcoming events, daily for full week data)

## Styling and Design
- **tailwindcss**: Utility-first CSS framework with custom trading-focused configuration
- **tailwind-merge**: Intelligent Tailwind class merging
- **clsx**: Conditional className utility
- **lucide-react**: Modern icon library with financial and trading-specific icons

## Current Features
- **Dashboard**: Overview of trading performance and session monitoring
- **Trade History**: Comprehensive record of all trades with filtering and search capabilities
- **Analytics**: Real-time performance metrics with win rate, P&L analysis, and strategy breakdown
- **Economic Calendar**: Track high-impact economic events with filtering by region, impact level, and currency; displays pre-release expectations and post-release analysis
- **Trading Sessions**: Live monitoring of Sydney, Tokyo, London, and New York sessions with overlap detection

## In-App Notification System
- **Database Storage**: PostgreSQL table for persistent notification storage with read/unread status tracking
- **NotificationService**: Backend service for CRUD operations on notifications (create, fetch, mark as read, delete)
- **Notification Types**:
  - **Trading Sessions**: Alerts 5 minutes before London (08:00 UTC) and New York (13:00 UTC) session open
  - **Economic Events**: 30-minute advance notice for ALL impact levels (high, medium, and low)
  - **Trading Signals**: Instant alerts for new buy/sell setups with entry, stop-loss, take-profit, confidence, and analysis
- **Real-time Updates**: Unread notification count refreshes every 30 seconds
- **API Endpoints**:
  - `GET /api/notifications` - Fetch all notifications (with limit)
  - `GET /api/notifications/unread` - Fetch unread notifications only
  - `PATCH /api/notifications/:id/read` - Mark specific notification as read
  - `PATCH /api/notifications/read-all` - Mark all notifications as read
  - `DELETE /api/notifications/:id` - Delete specific notification
  - `DELETE /api/notifications/clear-all` - Clear all notifications
  - `POST /api/notifications/signal` - Create trading signal notification
- **UI Component**: Popover-based notification center in header with bell icon, unread badge, color-coded notifications by type/impact, and management controls

## Telegram Notification System
- **Bot Integration**: node-telegram-bot-api for push notifications (limited to critical alerts only)
- **Commands**: /start (subscribe), /stop (pause), /resume (reactivate), /status (check subscription)
- **Notification Types** (Telegram receives only):
  - **Trading Sessions**: 5-minute alerts before London and New York session open
  - **Economic Events**: 30-minute advance notice for HIGH and MEDIUM impact events only
- **Scheduling**: Automated checks every 5 minutes via node-cron scheduler
- **API Endpoints**:
  - `/api/notifications/status` - Check Telegram bot status
- **Frontend Integration**: Telegram setup dropdown in header shows bot status, subscription info, and test notification button
- **Note**: All notifications appear in the dashboard notification center; Telegram is an optional secondary channel for critical alerts

## Future Integrations
- **Market Data APIs**: Real-time feeds for Forex, Stocks, and Crypto markets
- **WebSocket Services**: For live trading signals and session monitoring
- **Chart Libraries**: For advanced technical analysis visualization