# Overview

The Infod Trading Partner System is a professional financial analysis platform designed for real-time market scanning, signal generation, trade history tracking, and advanced analytics. It specializes in Smart Money Concepts (SMC), multi-timeframe analysis, and various trading strategies including scalping, day trading, swing trading, and Opening Range Breakout (ORB). The system provides a Bloomberg Terminal-inspired interface, optimized for displaying dense financial information and supporting high-frequency trading decisions. Its primary purpose is to empower traders with sophisticated tools for identifying and acting on market opportunities.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend
- **Framework**: React 18 with TypeScript, using Vite for building.
- **UI/UX**: Radix UI with shadcn/ui components, styled with Tailwind CSS, featuring a dark-mode palette inspired by financial trading colors (blue, green, red, amber) and Inter font for readability. Card-based layouts with an 18rem sidebar and mobile-first responsive design.
- **State Management**: TanStack React Query for data fetching and caching.
- **Routing**: Wouter for client-side navigation.

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
- **Critical Validation Rules**: Enforces no counter-trend trading unless CHoCH is confirmed, avoids unclear markets, and ensures trend alignment for signals.

## PNG Chart Generation
- **Functionality**: Generates professional, dark-themed trading charts with supply/demand zones, entry/SL/TP markers, and confidence percentages for Telegram. Utilizes `mplfinance` and `matplotlib` in Python.

## Real-Time Signal Management
- **Scanning**: Scans 62 instruments every minute using the modular strategy engine.
- **Lifecycle**: Signals move through stages (Forming, Monitoring, Ready, Active, Expired, Archived). Active signals have a 4-hour expiry.
- **Watchlist & Monitoring**: Tracks pending signals and monitors active signals for SL/TP hits, automatically archiving outcomes.

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
- **Investing.com**: Web scraped economic calendar data.