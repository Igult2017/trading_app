# RESTRUCTURE — where everything is, and where it is supposed to go

**His instruction, 2026-08-29:** *"I need you to put that plan somewhere so that when I tell you we
need to do it, you don't start from scratch and you already know where everything is and where it is
supposed to go in the codebase."*

So this file is the **destination**, agreed and measured. Nothing here has been done yet. When the
work starts, read this instead of re-deriving it — that re-deriving is exactly what keeps
reintroducing defects.

**Read `docs/MAP.md` first** for what the code IS today. This file is only about where it should GO.

---

## The measured state (2026-08-29 — do not re-measure, update if it drifts)

| area | files | lines |
|---|---|---|
| `client/src` | 263 | 49,916 |
| `server` | 157 | 41,111 |
| `signal_platform` | 207 | 28,929 |
| `python` (root) | 44 | 5,235 |
| `copy_platform` | 28 | 3,515 |
| `shared` | 1 | 878 |
| **total** | **~700** | **~129,600** |

* **111 folders exist today.** The target is **~145–150**, so roughly **36 new** — most of the
  structure already exists, which is why the number is smaller than it first looks.
* **The crowding is in four places:** 55 loose files in `client/src/components`, 50 in
  `signal_platform/strategies`, 42 in `server/services`, 17 in `client/src/pages`.
* **139 files break the 200-line limit**, 76,444 lines between them. `server/routes.ts` is **6,320
  lines holding 220 endpoints** (CLAUDE.md still records it at 4,358 — it grew 45%).
* **The safety net is thin exactly where the work is biggest:** 54 Python tests, **2 client tests,
  0 server TypeScript tests.**

---

## THE PRODUCT IS FIVE PLATFORMS, NOT ONE APP

His correction, 2026-08-29: *"Journal is also a platform."* He is right, and the routing proves it —
`/journal` is ONE route hosting **fifteen panels** with its own navigation. It is not a feature
sitting beside the others; it is the entire logged-in application.

| platform | what it is | runs as |
|---|---|---|
| **Journal** | the logged-in app — 15 panels behind `/journal` | browser |
| **Public site** | home, about, join, blog, economic calendar, legal, support | browser |
| **Admin** | `AdminPanel.tsx` (3,421 lines), 39 endpoints | browser |
| **Signals** | the strategy engine | Python, own process |
| **Copy** | the FX copier engine | Python, own process |

The tree must say this. Anyone opening the repo should see five platforms, not one bag of features.

---

## THE TARGET TREE

```
trading_app/
├── client/src/
│   ├── platforms/
│   │   ├── journal/                  THE JOURNAL PLATFORM
│   │   │   ├── shell/                sidebar, header, settings, paywall, session context
│   │   │   └── panels/
│   │   │       ├── dashboard/  sessions/  accounts/  journal/  vault/
│   │   │       ├── calendar/   drawdown/  metrics/   tf-metrics/  audit/
│   │   │       └── trader-ai/  fx-copier/ assets/    leaderboard/
│   │   ├── public/                   marketing, blog, economic-calendar, legal, support
│   │   └── admin/
│   ├── components/                   SHARED UI ONLY (ui/, blocks/)
│   ├── hooks/  lib/  types/  i18n/  styles/  app/
│
├── server/
│   ├── routes/                       routes.ts split by domain — see the table below
│   ├── services/                     market/ broker/ ai/ signals/ notifications/ analytics/ blog/
│   ├── database/                     storage, schema, migrations
│   ├── python/                       metrics/ drawdown/ calendar/ audit/ ocr/
│   ├── lib/  config/  tests/
│
├── signal_platform/                  already a platform, already well organised (24 folders)
│   └── strategies/  →  vix1/  bx_sd/  shared/
├── copy_platform/                    already a platform
├── shared/   docs/   config/
```

---

## WHERE EACH FILE GOES

### `client/src/components` — 55 loose files

| file(s) | destination |
|---|---|
| `DrawdownPanel.tsx` | `platforms/journal/panels/drawdown/` (its `drawdown/` folder moves with it) |
| `MetricsPanel.tsx` | `platforms/journal/panels/metrics/` |
| `TFMetricsPanel.tsx` | `platforms/journal/panels/tf-metrics/` |
| `StrategyAudit.tsx` | `platforms/journal/panels/audit/` |
| `TradeVault.tsx`, `TradeHistory.tsx` | `platforms/journal/panels/vault/` |
| `TradingCalendar.tsx` | `platforms/journal/panels/calendar/` |
| `JournalForm.tsx` | `platforms/journal/panels/journal/` |
| `TraderAI.tsx` | `platforms/journal/panels/trader-ai/` |
| `Leaderboard.tsx` | `platforms/journal/panels/leaderboard/` |
| `CopyManagementDashboard.tsx`, `components/copy/` | `platforms/journal/panels/fx-copier/` |
| `CreateSession.tsx`, `TradingSession.tsx` | `platforms/journal/panels/sessions/` |
| `TradingSignals.tsx`, `components/assets/` | `platforms/journal/panels/assets/` |
| `AppSidebar.tsx`, `JournalHeader.tsx`, `JournalSettingsPanel.tsx`, `JournalPaywall.tsx` | `platforms/journal/shell/` |
| `HomeHeader/HomeFooter/HomeStatsSection/PricingSection/TestimonialsSection/StartFreeButton` | `platforms/public/marketing/` |
| `BlogPostEditor.tsx` | `platforms/public/blog/` |
| `SignalPlatformStatus.tsx` | `platforms/admin/` |
| `Brand.tsx`, `Wordmark.tsx`, `ThemeToggle.tsx`, `TradingLoader.tsx`, `TickingPrice.tsx`, `SEOHead.tsx`, `Notifications.tsx`, `TradingChart.tsx`, `MarketOverview.tsx` | `components/` (genuinely shared) |
| `app-sidebar`, `chart-*`, `data-table`, `nav-*`, `search-form`, `section-cards`, `site-header`, `team-switcher`, `version-switcher` | `components/blocks/` — the pre-installed shadcn blocks CLAUDE.md says to compose from |
| existing `ui/ auth/ profile/ skeletons/` | stay under `components/` |

### `signal_platform/strategies` — 50 loose files, the easiest win

Already prefixed, so this is mechanical:

| pattern | count | destination |
|---|---|---|
| `vix1*.py` | 22 | `strategies/vix1/` |
| `bx_sd*.py` | 26 | `strategies/bx_sd/` |
| `trade_management.py` | 1 | `strategies/shared/` |
| `__init__.py` | 1 | stays — it is the registry both strategies register into |

**Care needed:** `strategies/__init__.py` registers both strategies, and there are 3 dynamic imports
across the Python code that a typechecker cannot see. Move, then run the full VIX.1 suite (25 files).

### `server/services` — 42 loose files

| group | files |
|---|---|
| `market/` | marketData, cryptoService, stocksService, fmp, finnhub, eodhd, priceAlertChecker |
| `broker/` | ctraderRealtime, autoSyncService, brokerSyncService, balanceTracker, copyPlatformProcess |
| `ai/` | geminiAnalysis, geminiScreenshotAnalyzer, ocrScreenshotAnalyzer, screenshotAnalyzer, screenshotExtract, textTradeAnalyzer, sentimentAnalysis, aiChatStore, aiQAWorker, aiEngineCalculator |
| `signals/` | signalScanner, signalMonitor, signalPlatformProcess, liquiditySweepDetection, chartGenerator |
| `notifications/` | telegramNotification, emailService, notificationService, adminNotificationService, newsAlerts, marketSessionAlerts, sessionMessages, healthWatchdog |
| `analytics/` | metricsCalculator, drawdownCalculator, tfMetricsCalculator, strategyAuditCalculator, calendarCalculator, calendarDb, homepageCalendar |
| `blog/` | (blog services as they appear) |

**Care needed:** `signalScanner.ts` looks orphaned by search but is NOT — `scrapers/scheduler.ts`
imports it and both entry points start that scheduler. It was nearly deleted once on that mistake.

### `server/routes.ts` — 6,320 lines, 220 endpoints

| new file | endpoints |
|---|---|
| `routes/admin.ts` | 39 |
| `routes/copy.ts` | 37 |
| `routes/broker.ts` | 17 (`broker-accounts` + `broker`) |
| `routes/ai.ts` | 16 (`trader-ai` + `gemini` + `ai`) |
| `routes/signals.ts` | 14 (`trading-signals`, `signals`, `pending-setups`) |
| `routes/market-data.ts` | 12 (`crypto`, `prices`, `charts`) |
| `routes/economic-calendar.ts` | 12 (`economic-events`, `interest-rates`, `calendar`) |
| `routes/blog.ts` | 9 |
| `routes/journal.ts` | 8 |
| `routes/notifications.ts` | 8 |
| `routes/sessions.ts` | 6 |
| `routes/analytics.ts` | metrics, tf-metrics, drawdown |
| `routes/public.ts` | homepage, leaderboard, track, me, auth |

**THIS ONE NEEDS HIS DECISION FIRST.** CLAUDE.md currently says: *"all API endpoints go in
`server/routes.ts` via the `registerRoutes(app)` function; there is no `routes/` subdirectory."*
Splitting it **contradicts a written rule**, so the rule gets changed deliberately or the split does
not happen. Do not just do it.

---

## THE ORDER, AND WHAT EACH COSTS

Moving files is cheap and safe. Splitting files is expensive and risky. **Never quote them as one
number.**

| # | phase | scope | effort | risk |
|---|---|---|---|---|
| 1 | `server/services` → 7 groups | 42 files | ~1 session | **low** — no UI, nothing depends on its layout |
| 2 | `signal_platform/strategies` → 3 folders | 50 files | ~1 session | low — 54 Python tests cover it |
| 3 | `server/python` → per-calculator | 44 files | ~½ session | low — `drawdown/` already proves the shape |
| 4 | `client/src` → `platforms/` | 263 files | 1–2 sessions | **high** — only 2 client tests exist |
| 5 | `routes.ts` → 13 route files | 220 endpoints | 2–3 sessions | **high**, and blocked on the rule above |
| | **total moving work** | | **~6–8 sessions** | |
| 6 | splitting the 139 oversized files | 76,444 lines | **months** | separate project — defer indefinitely |

**Start with phase 1.** It is the messiest folder, has no interface to break, and nothing outside it
depends on its internal arrangement.

---

## RULES FOR DOING IT

1. **One phase per session, committed and deployed before the next.** A half-moved tree is worse
   than an unmoved one.
2. **Move files; do not edit them in the same commit.** A move plus an edit is unreviewable — if
   something breaks you cannot tell which caused it.
3. **The typechecker finds broken imports; it does NOT find broken behaviour.** This session alone
   produced a page reporting two different values for one number, five test files that had never
   run, and a light theme failing contrast — all of which built clean. After each phase, open the
   affected screens.
4. **Python has no typechecker to catch a bad move.** Run the VIX.1 suite (25 files), the drawdown
   checks and the monthly parity test after any Python move.
5. **Update `docs/MAP.md` in the same commit**, or the map becomes a lie and the next session guesses.

---

## OPEN QUESTIONS — answer before starting the phase they block

* **`routes.ts` split contradicts CLAUDE.md** (blocks phase 5). His call.
* **Four things exist twice** — `/accounts`, `/assets`, `/analytics`, `/history` are each BOTH a
  top-level route AND a panel inside the Journal. **Not yet checked** whether they render the same
  component or two different ones. If two, that is real duplication and a place numbers can
  disagree — the journal sidebar did exactly that until 2026-08-29. Check before phase 4, or the
  move carries the duplicate along with it.
* **No test safety net on the client** (2 tests, 263 files). Worth adding a handful of render checks
  for the biggest panels before phase 4, rather than after.
