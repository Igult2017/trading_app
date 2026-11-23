# PIX options levels — Investing.com dealer map + Barchart grade (built 23 Nov 2026)

**Read this before touching the options levels, the Barchart run or the Investing.com reader.** Plan (approved):
`.claude/plans/declarative-roaming-bentley.md`. His guide: `C:\Users\FSD\Desktop\Options_Dealer_Mapping_Guide.docx`;
how he wants the map: `Desktop\Option 2 .png`.

## His order (23 Nov 2026)
*"build investing.com scraper for this page. Now you will get data from here first and conform with the strikes you got
from barchart to grade signals. Investing.com provides the spot prices of each strike … you scrape data from both
platforms and store in the database. Then you use data from investing.com to do dealer mapping as explained in this
guide. Then use barchart data to add any confluence and grade for the signals. In case there is a good strike from
barchart that we don't have on investing.com, you will calculate its spot price separately … and then send it as
signal … When a level is respected price gets there and starts reversing and that is when you send signal. The first
info send after dealer mapping are only the levels we are watching for the day and reason for watching each level.
Also include what has qualified a level and what has not qualified."*

His answers: **1B** gold + EUR/USD + GBP/USD · **2** every open, like Barchart · **4A** a 1M touch then a 1M close back,
the sweep trap as in his picture and guide · **5B** stop as PIX does, 1:3 · **6** no trend rule · **7** map → channel,
signals → PIX DM · **Q3** unanswered → my recommendation (A, below) was in the approved plan.

**This replaced two earlier rules, on his word:** Barchart data was read and thrown away (21 Nov) — now both sources are
STORED; Barchart posted its own channel message — now its findings appear inside the one dealer map.

## Where the data comes from
- **Investing.com** — the table on https://www.investing.com/currencies/xau-usd-options is the **Sentry Derivatives**
  FX-options panel the page embeds (`widget2.sentryd.com`, panel id in `server/python/sentry_options.py`). The panel
  works each strike out from price and volatility per delta, so its strikes are ALREADY levels on his chart. We open it
  in the disguised browser, click **O/N** (his guide: overnight-expiring only), choose each market, read the table as
  shown. Never its private data calls.
- **Barchart** — unchanged reading (`docs/barchart.md`); its judged strikes (✅ full / ⚠️ 1-2 misses) are converted to his
  chart (strike × spot ÷ futures) by `server/python/barchart_snapshot.py`.
- Both read in ONE container run per open (Sydney Tue–Fri, London, New York, +10 min — `server/scrapers/bcLimits.ts`),
  Investing.com first; sent to `POST /api/internal/options/snapshot` → table **`options_snapshots`**.

## The map (engine, `signal_platform/strategies/pix_options/`) — his guide in plain words
1. **ATM** = the strike closest to OUR live price → ignored (`mapping.py`).
2. **Sell zones** above it, outward: Active Dealer Resistance · Main Reclaim Pivot · Main Dealer Ceiling.
3. **Buy zones** below it, outward: Active Dealer Support · Stabilization Support · Sweep Trap Zone. **Dynamic IV Shift**:
   the 2nd buy strike with the highest IV of the three becomes the Sweep Trap; the lowest becomes Stabilization.
4. **IV vs the strikes directly above and below**: above both = HIGH, below both = LOW, between = MODERATE. IV 0 or a
   negative option price = a data error, not qualified (the GBP/USD panel showed negative put prices on 23 Nov).
5. **Qualified** — sell: put price > call price and IV not HIGH (high IV = breakout above; the guide gives sells no sweep
   rule, none invented). Buy: call price > put price; a HIGH-IV buy strike or the Sweep Trap is traded the sweep way.
   **Speed** from delta: past ±0.50 fast, else calm.
6. **Spot check**: our price must be between the strikes around the ATM, else "spot mismatch", nothing mapped.
7. **Grade** (`grade.py`, Q3 = A): a Barchart level on the SAME side within HALF the gap to the neighbouring Investing.com
   strike backs it — **A** full qualifier, **B** near miss, **C** none. A Barchart full qualifier backing nothing →
   its own "Barchart level" (B), unless next to the ATM or on the wrong side of price. No Barchart data → all C, said.
8. **Lock**: a new open's map replaces the previous one (old levels still watched → `replaced`).
Saved in **`options_levels`**; posted to the **channel**, one message per market (`message.py` — three markets of reasons
can pass Telegram's limit), top to bottom like his picture.

## The signal (PIX, `watch.py` + `signals.py`, from `strategies/pix.py`)
- **Respected**: a closed 1M candle touches the level, then a LATER 1M candle closes back (below a sell, above a buy).
  A close THROUGH = broken. **Sweep trap**: price must trade below first (closing below is part of the sweep), then a
  later 1M close back above → buy. The touching candle is never its own confirmation.
- **Once per level per session** (guide's single-touch rule) — `signalled` / `broken` in the table; restart-safe.
- **Entry** = the confirming close. **Stop** = PIX's own sizes, imported from `pix_entry.py`: beyond the visit's extreme
  by 0.5 × the 1M average range (14), + the spread on a sell; never closer than 1 × that range + the spread. **Target**
  = 3R (`pix_skeleton.TARGET_R`). A normal PIX signal → his **PIX DM** (copy-bot route), saved and monitored.
- PIX scans EUR/USD + GBP/USD for THIS only; its zone logic stays BTC/USD + XAU/USD, handed exactly its old 90 1M bars
  (PIX now fetches 600 so the levels can be watched for up to ~10 hours after the map).

## ⚠ The server's copy of the scraper
The host timer runs `/opt/bc/run.sh`, which runs `/opt/bc/*.py` — copies made at install, NOT the app's files. Since
23 Nov `run.sh` fetches the newest scraper files from the app before each run (`GET /api/internal/options/scraper/:name`,
secret-only, fixed list), but the copy of `run.sh` ON THE SERVER must be replaced ONCE for that to start. Until then the
old run keeps posting Barchart's own message exactly as before (the `/levels` route posts unless told `mapped: true`).

## Proof
`signal_platform/tests/pix/test_options.py` 32 (today's real gold table; rules broken on purpose — caught; PIX really
calls it; EUR/USD never reaches the zone logic) · `pg_options_e2e.py` 9 on a real Postgres (store → map → post once →
signal once → replaced at the next open) · `server/python/sentry_options_test.py` 6 (the panel text captured live) ·
`server/services/__tests__/optionsSnapshot.check.ts` 8 (strict input, all-or-nothing storing). No backtest.
