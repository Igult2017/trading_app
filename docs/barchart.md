# Barchart futures-options Greeks & volatility scraper — SWITCHED OFF (built 19 Nov 2026)

His order: *"create a scraper using the approach we are using to scrape data from myfxbook but for barchart Greeks and
volatility futures. It only scrapes six time the whole day. Twice at an interval of 15 minutes at NY LN and Asia open.
Five minutes after the open of each market. After creating it just disable it first, i will tell you what to do with
it."* Page: https://www.barchart.com/futures/quotes/GC*0/volatility-greeks?futuresOptionsView=merged

## State: OFF, twice over
1. The app refuses every fetch until **`BARCHART_ENABLED=true`** (default off — `server/scrapers/bcLimits.ts`).
2. The host timer (`scripts/bc/bc.timer`) is **not installed** on the server.
Nothing reads the stored data yet — that is his next instruction.

## When it runs (his six moments)
| slot | when (local) | winter UTC | summer UTC |
|---|---|---|---|
| asia-1 / asia-2 | Tokyo 09:05 / 09:20 | 00:05 / 00:20 | 00:05 / 00:20 |
| ln-1 / ln-2 | London 08:05 / 08:20 | 08:05 / 08:20 | 07:05 / 07:20 |
| ny-1 / ny-2 | New York 08:05 / 08:20 | 13:05 / 13:20 | 12:05 / 12:20 |

The opens are the platform's own (`signal_platform/scheduler/session_windows.py`). A slot may start up to 10 minutes
after its minute, once; none on Saturday or Sunday; after a BLOCKED answer, nothing more that day.

## How (copies the MyFXBook scraper)
- Host timer every 5 min → `run.sh` asks `GET /api/internal/barchart/due` → `POST /claim` (re-checked) → a browser
  container REMOVED on exit (1 GB, 1 CPU, killed at 300 s) runs `server/python/barchart_greeks.py` → `POST /ingest`.
- Every attempt is a row in `scrape_runs` (`source = 'barchart'`, `kind` = slot); data in **`barchart_snapshots`**
  (contract, slot, time, futures last price, one row per strike and side: strike, last, IV %, delta, gamma, theta,
  vega, IV skew, trade time).
- **The data is the page's own request** (`/proxies/core-api/v1/quotes/get?...list=futures.options...`), caught while
  the page loads. 19 Nov: 895 calls + 895 puts for Gold Dec '26.

## ⚠ The one difference from MyFXBook — no challenge solver
Barchart's terms forbid robots, even for personal use. So it opens the page as a **plain browser, once**; a challenge
or refusal is reported **BLOCKED** and the day is skipped — it never tries to get past it. A plain visit from here
returned the full table on 19 Nov; **from the server it has not been tried** (it is off). If the server is blocked,
the clean route is Barchart's paid data service. Not checked yet: that the scraper image's Playwright Chromium starts
(it is the image MyFXBook uses; the first run will say).

## Proof
`npx tsx server/scrapers/bcLimits.test.ts` — 16 checks (switch off, six slots, daylight saving in London and New York,
once per slot, blocked day, weekend). `cd server/python && python barchart_parse_test.py` — 12 checks on a verbatim
slice of the 19 Nov response (`fixtures/barchart_gc_sample.json`).
