# Security — PIX options levels (23 Nov 2026)

**Scope:** `server/python/sentry_options.py`, `barchart_snapshot.py`, `barchart_greeks.py` (container side); routes
`POST /api/internal/options/snapshot`, `GET /api/internal/options/scraper/:name`, `/api/internal/barchart/levels`
(`mapped` flag); `server/lib/optionsSnapshot.ts`; tables `options_snapshots`, `options_levels`; engine
`strategies/pix_options/`, `storage/options_repo.py`; `scripts/bc/run.sh`.

**New outside surface:** two routes, both behind the admin secret (`requireAdminSecret`, as every Barchart route):
- `/options/snapshot` — strict: two sources, three markets, ≤ 6 tables, ≤ 200 rows, numeric strikes; refused whole
  otherwise; stored in one transaction with bound parameters (`optionsSnapshot.check.ts`: 8 checks incl. refusals).
- `/options/scraper/:name` — serves ONLY a fixed list of five scraper files from `server/python`; any other name → 404.
  No path is built from the caller's text except a name already on that list (no path traversal possible).
**Host runner** (`run.sh`) swaps a fetched file in only when it downloaded whole; the secret is the existing one.

**Reading Investing.com's panel:** a browser read of what the page shows (his order); the panel's private data calls
and the password embedded in its script are NOT used.

**Money:** no order is placed — signals only (to his DM). Messages escaped for Telegram's HTML (map: `html.escape`;
signal card: `telegram_formatter._h`).

**Secrets:** diff scanned — none. ZAP not re-run: the new routes are secret-only machine routes; the public surface
did not change (stated, not skipped silently).

**Findings:** none High/Critical. Note: the server's copy of `run.sh` must be replaced once (needs his permission —
my own login to the server was refused by the safety check, correctly).
