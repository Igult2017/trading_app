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

## The server's copy of the scraper
The host timer runs `/opt/bc/run.sh`, which runs `/opt/bc/*.py`. **Installed 23 Nov 2026 05:31 UTC** (with his permission —
it had never been installed). Before each run `run.sh` fetches the newest scraper files from the app
(`GET /api/internal/options/scraper/:name`, secret-only, fixed list) — verified from the server: the fetched copies match
the installed ones byte for byte. So a deploy reaches the scraper; only `run.sh`, `bc.timer` and `bc.service` themselves
need copying by hand if they ever change. Stop it: `systemctl disable --now bc.timer`.

## The dry run that proved it before install (23 Nov 2026, his order)
`BC_DRY=<file>` runs the real scraper against the live pages and writes what it WOULD send — nothing saved or posted. Run
twice from this machine: Investing.com O/N (expiring 24 Nov) for all three markets; Barchart Tuesday 24 Nov for all three
— after fixing gold, whose 24 Nov expiry is the December MONTHLY (the first run had fallen back to the 1 Dec weekly).
Barchart's judging re-checked independently on all 120 near-the-money strikes: 0 disagreements. Maps checked by hand.
GBP/USD: the panel's put prices are NEGATIVE in every unit (USD pips, GBP pips, GBP %) — the panel's own fault — so GBP's
map is "data error, not mapped" while that lasts (his decision asked).

## Re-audit, 23 Nov 2026 (his follow-up) — what changed
His words: *"reaudit the two scrapers and ensure they cannot cause the platform to crash and also they do their work by
minimizing the chances of getting blocked. Also the data scraped … is only for dealer mapping and calculations and after
that they will be automatically be gotten rid of … reread the guide again and verify … ensure that signals are sent when
price gets to the mapped levels. When price doesnt respect the levels you also need to notify me."*
- **Scraped data deleted after use:** a run's raw tables are DELETED the moment it is mapped (`options_repo.delete_run`);
  a run stuck unmapped is deleted after 24 h; finished levels after 7 days (`purge`, each minute). `mapped_at` dropped.
- **His DM notices:** 📍 price REACHED a level (once — the level becomes `touched`, still watched); the signal when it is
  RESPECTED (the card also names the opposite active dealer zone — the guide's target — beside the 3R target); ❌ NOT
  RESPECTED when a 1M candle closes through it (a sweep trap trading below is not "not respected" — that is the sweep).
- **Crash-proof:** the map job guards the whole minute; a run failing to map 3 times is dropped and his DM told; a
  Barchart visit that fails outright no longer loses the Investing.com tables already read; container cap 1200 s.
- **Fewer chances of a block:** random 2-5 s pauses between clicks on the panel, 10-25 s between Barchart's markets;
  still one visit per open, no retry after a refusal.
- **Guide re-read line by line — the map follows it.** Two places where HIS answers replaced the guide, kept: mapping at
  the Sydney open too (the guide says not in the Asian session; he chose "like Barchart"), and a 1M close back instead
  of "sell/buy on the first touch" (his 4A).

## His second follow-up, 23 Nov 2026 — tries, waits, popups, the card
*"Whatever doesnt qualify we dont map, we only map what has qualified … each scraper should try atleast 3 times at an
interval of 5 minutes. After that if it still fails we use data provided by the scraper that dint fail … dont time a
scraper out so fast … we should have something to click those ads when they pop up. In the signal card, make sure you
mention all the options metrics a signal has failed."*
- **Rules never relaxed:** what does not qualify is never mapped, for any market (GBP/USD included).
- **3 tries, 5 min apart, per scraper** (`barchart_greeks.main`, TRIES/GAP_S); a retry re-reads only the markets still
  missing; refusals are retried too (replaces the 21 Nov "skip the day"). `barchart_retry_test.py` (one try only → 4 fail).
- **The other source maps:** Investing.com missing after 3 tries → that market from Barchart's FULL qualifiers only
  (`grade.barchart_only`); nothing fully qualifies → not mapped. Barchart missing → the Investing.com map, all grade C.
- **Patient waits:** page load 180 s, menus 90 s (+1 reload), panel 90 s, clicks 30 s, browser visit 300 s; whole run
  5400 s, systemd 5500 s.
- **Ads and popups** (`server/python/popups.py`): a watcher inside every page, every second, plus a sweep before each
  read — clicks close/accept/dismiss/× INSIDE popup boxes only, removes ad frames, sticky ad bars and full-screen layers,
  re-allows scrolling; never touches a box holding the table or menus. `popups_test.py` in a real browser (an ad that
  appears 2 s later is removed too; the data and its own "x" button untouched).
- **The signal card:** Telegram shows ONLY a signal's checklist (`notifications/telegram_cards.py`) — the options card
  had none, so it showed no reasons. Now its checklist: the level + grade, how it was respected, Investing.com's passed
  rules, what Barchart's strike passed and **❌ every metric it failed** (value + what it should be), or ❌ no Barchart
  strike; the stop rule; 3R; the opposite active dealer zone. Proven on the REAL card formatter (`test_options.py`).

## Proof
`signal_platform/tests/pix/test_options.py` 38 (today's real gold table; rules broken on purpose — caught; PIX really
calls it; EUR/USD never reaches the zone logic; the notices) · `pg_options_e2e.py` 17 on a real Postgres (store → map →
raw rows deleted → post once → reached notice once → signal once with the opposite zone → not-respected notice once →
replaced at the next open → a failing run dropped after 3 tries → housekeeping; deletion removed on purpose → 4 fail) · `server/python/sentry_options_test.py` 6 (the panel text captured live) ·
`server/services/__tests__/optionsSnapshot.check.ts` 8 (strict input, all-or-nothing storing). No backtest.
