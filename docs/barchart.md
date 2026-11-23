# Barchart options → the day's buy/sell levels (rebuilt 21 Nov 2026; first built 19 Nov as a storing scraper)

> **⚠ THE 19 NOV DESIGN BELOW IS HISTORY.** Since 21 Nov it does his job (`docs/barchart-levels-plan.md`, his guide
> verbatim + his 8 answers): ONE run 10 min after the Sydney (Tue-Fri), London and New York opens; gold (GC), euro (E6),
> pound (B6); the NEXT trading day's weekly options (Friday → Monday); near the money (10 strikes either side of the
> futures); his rules → BUY levels (calls) and SELL levels (puts), full qualifiers ✅ and 1-2-miss near misses ⚠️ with the
> reason; each strike converted to the spot level (strike × spot ÷ futures, spot = our live FIX price); ONE post to the
> channel (or his DM — admin page). **Nothing is stored**: `barchart_snapshots` is dropped, `/ingest` is gone, the
> table lives only in the container's memory. Files: `server/python/barchart_greeks.py` (the run),
> `barchart_levels.py` (his rules, the week, near the money), `barchart_message.py` (the day, the post),
> `server/scrapers/bcLimits.ts` (when), route `/api/internal/barchart/levels` + `/spot`.
> **The browser is the disguised one MyFXBook uses** (scrapling, solve_cloudflare) — his instruction 21 Nov, Barchart
> support having told him the data may be used non-commercially for his personal use. Proven live from his machine on
> 21 Nov: all three markets read, the post built. Barchart gives one browser visit only a few full pages, so each market
> gets its own visit (~3-4 min each here).
> **Switches on the admin page** (Autotrade → Options levels): "Post the options levels" (`barchart_enabled`, falls back
> to `BARCHART_ENABLED`, else OFF) and "Send the levels to my DM instead of the channel" (`barchart_to_dm`).
> **On the server: FIRST INSTALLED 23 Nov 2026 05:31 UTC, by me, with his permission** — before that it had NEVER been
> installed (no `/opt/bc`, no timer; the 21 Nov proof run was from his machine; my note that it was "installed, his word"
> was wrong and is corrected here). "Post the options levels" switched ON 23 Nov. **The run also reads Investing.com and
> stores both tables until mapped — Barchart's own post is replaced by the PIX dealer map: `docs/options-levels.md`.**
> `run.sh` fetches the newest scraper files from the app each run (verified from the server). Stop it:
> `systemctl disable --now bc.timer`. **23 Nov dry run fix:** when the MONTHLY options expire on the target day (gold's
> December monthly, Tue 24 Nov) the monthly table is read — the weekday's weekly menu skips that date (`barchart_read.py`).

His order: *"create a scraper using the approach we are using to scrape data from myfxbook but for barchart Greeks and
volatility futures. It only scrapes six time the whole day. Twice at an interval of 15 minutes at NY LN and Asia open.
Five minutes after the open of each market. After creating it just disable it first, i will tell you what to do with
it."* Page: https://www.barchart.com/futures/quotes/GC*0/volatility-greeks?futuresOptionsView=merged

## State (19 Nov history below — superseded: installed + ON since 23 Nov)
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
