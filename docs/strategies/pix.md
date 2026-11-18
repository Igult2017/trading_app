# PIX — BTC/USD and XAU/USD (named OVP until 18 Nov 2026)

**Status (18 Nov 2026): HIS SKELETON, BUILT, REGISTERED AND SWITCHED ON. SIGNALS ONLY — to the public channel.**
It places NO orders: `pix` is not in `autotrade_strategies` (`config/settings.py`), and a test fails if it ever is.
His order: *"build the strategy first please. and test before you link to autotrade. We start by sending them to the
channel."* The shape (files, flow, constants) is in [pix-architecture.md](pix-architecture.md).

**PIX SHARES NO STRATEGY LOGIC** — his rule, 18 Nov: *"I dont want that confusion of strategies sharing codes such that
when one strategy is down the other is down too. I just said copy the code which is different from saying let them
share a code."* Every decision PIX makes runs on its own files (`pix_*.py`), including its own copies of the trend
reader, the swing-point finder and the "has this candle finished" check. What it still has in common with the other
strategies is PLUMBING only: the scanner that runs every strategy, the broker candle feed, the Telegram sender, the
database, price decimals and the signal format. They all run in one program, so if the scanner or the broker
connection stops, every strategy stops; running PIX as its own program would be a separate job.
`tests/pix/test_independence.py` fails if a PIX file imports any other strategy's file or any shared logic module.

## His rules — in his words (18 Nov 2026)
- *"4H: is the market trending, and mark the main zones; 1H: confirm the trend and the zones that align with it; 5M:
  focus on those zones; 1M: entry. Only focus on big zones not small ones. Big zones means ones with bigger FVG IFc."*
- **The real zones (his correction of my first reading):** *"We are only trading zones where price originated from and
  tapped another zone before coming back. That is the real zone. a zone that made price to travel to another zone.
  These are always the bigger zones. So in other words we are not trading zones without FVG candles."*
- 4H / 1H / 5M: *"In 4 hours, we want to confirm if we are trending or not. If we are trending, we look for zones in the
  direction of the trend not against and the zones near the money. In 1HR refine those zones and mark the ones near the
  money that we expect the price to come back and tap. In 5 minutes, we look at those zones and any zones formed near
  them… the price is likely to clear them in case of a pullback and tap the zone in the higher timeframe then move."*
- **The layers (18 Nov, his correction):** *"4HR is for trend, however, if we mark zone there that aligns with lower timeframe the better. But mostly we mark zones in 1HR and look for them in 5min … We can also look for zones in 5m so long as they dont go against the trend … 4H is mainly for trend and we can also use 1H for trend because trend starts in lower TF. We only dont go against trend. our main interest when marking zones is 5mins and if we get a zone there that is in 1HR zone or 4HR zone and near the money, the better."*
- 1H: *"Read the same way as 4H but we are interested in any zone that is in 4H and 1H too. The whole point is not to go
  against 4H trend."*
- Near: *"Only zones that align near the money. It is day trading strategy; it can't wait for 3 days for a zone to be
  tapped."*
- Touched zones: *"We are looking for zones that have been respected and the once that have not been respected."*
- Ranging: *"in case in 1HR we notice a ranging market… we go to 5min and start looking for support and resistance… wait
  for it being respected once then when it respects it again, we take trade but we use stop order… If it happens in a
  trend, we only take trade in the direction that the trend supports. In one minute, we use stop order."* — and only
  *"when they can give use 2R and above."*
- Target: *"Let's target 3R but we breakeven at 1R at 2R we take 1R and at 2.5R we take 2 and at 3R we get out."*
- Spread: no cap (his answer "A", 18 Nov).

## His rules → the code
Where he gave no number or detail, the reading is MINE — each is one named constant or one sentence he can correct.

| # | his rule | how the code reads it | where |
|---|---|---|---|
| 1 | the REAL zones | every zone is the candle before a 3-candle gap (never one without a gap). It counts only if, after it formed, price travelled to and **tapped ANOTHER zone** — my reading: an **opposite** zone (supply above a demand origin, demand below a supply origin) on the **same timeframe**, that already existed and was still standing when the touching candle closed (a zone the move closed straight through does not count) | `pix_bigzones.travelled_to` |
| 2 | trend: 4H, then 1H; never against it | **`pix_trend.direction`: the 4H's trend if it has one; if the 4H is sideways, the 1H's (a trend starts on the lower timeframe); both sideways → ranging.** Each is read by PIX's own `pix_trend.regime`: swing highs/lows (3 candles each side) over the last 50 closed 4H candles; UP when higher highs + higher lows lead lower highs + lower lows by **at least 2** (`MIN_LEAD`), DOWN the mirror, else ranging; an EQUAL high/low counts for neither. Up → demand only, down → supply only. A 1H move against a trending 4H is the pullback that brings price to the zone, not a new trend | `pix_trend.py` |
| 2b | which zones, in what order | **1. 5M zones INSIDE a 1H or 4H zone of the same side (the best); 2. the 1H / 4H zones themselves; 3. 5M zones on their own** — nearest first within each, all on the trend's side, near the money, real, not closed through. "Inside" = the ranges overlap (my reading). The tap must come AFTER price travelled away (a 5M zone's own formation candles never count as price coming back). Stop = beyond the zone actually traded (a 5M zone's own edge) | `pix_bigzones.candidates`, `pix_skeleton.zone_plan` |
| 3 | near the money | zone's near edge within **one average daily range** (14-day ATR, `ATR_LEN`, `NEAR_ATR_MULT = 1.0`) | `pix_bigzones.py` |
| 4 | touched zones allowed | untouched OR touched; a zone a candle has **closed through** is dead (a wick through is a sweep, not a break) | `pix_zones.break_index` |
| 5 | 5M: price taps, respects | the last closed 5M candle is the FIRST close back out of the zone the trade's way, the tap within the last hour (`TAP_WINDOW_M5 = 12`), nothing in the visit closed through the far edge — **AND the order flow says GO on 5M and on 1M** (rule 5b) | `pix_skeleton.respected_5m` |
| 5b | ORDER FLOW at the tap (5M and 1M) | per candle, buying vs selling (Bitcoin: Binance's own taker volumes; gold: an ESTIMATE counting up / down price ticks on our live stream). **Absorption** = a visit candle with ≥ 25% one-sided delta on the trade's side (`ABSORB_MIN`) that still closed against the trade → refuse. **Initiation** = the candle leaving the zone has ≥ 10% delta on the trade's side (`INIT_MIN`), else refuse. **CVD** over the 12 candles before the tap + the visit (`APPROACH`), split in halves: price made a new extreme into the zone and CVD did not → divergence (go); CVD did too → convergence (refuse); no new extreme → neutral (go). Missing figures → UNKNOWN → refuse. Both 5M AND 1M must say GO | `pix_flow.verdict`, `pix_btcflow`, `pix_goldflow`, `pix.make_check` |
| 6 | 1M stop order | buy stop at the last closed 1M high (sell: low); stop at the zone's far edge (+ spread on a sell); **target 3R** (`TARGET_R`). Refused if the live ask (buy) / bid (sell) is already through the entry | `pix_skeleton.entry_1m` |
| 7 | his management | **NOT BUILT** — needs its own account and its own ladder; deferred with autotrade by his 18 Nov order | — |
| 8 | ranging → 5M S/R | a 5M swing low/high (3 candles each side, `SR_PIVOT`) = respected once; price back into its band (± ¼ of the 5M average range, `SR_TOL_ATR`) and out again = the 2nd respect; stop order; needs **≥ 2R** of room to the nearest opposite level (`RANGE_MIN_R`), target = 3R or that level, whichever is nearer. In a trend, only the trend's side | `pix_skeleton.range_plan` |

## What is NOT built yet (his list, in his order)
1. ~~Order flow on 5M and 1M~~ **BUILT 18 Nov** (rule 5b). Not built: the per-PRICE footprint (bid × ask at each price
   inside a candle) — his decisions read the candle's delta, which Binance gives exactly; per-price needs thousands of
   trade records a candle. Can be added to the card if he wants to see it.
2. **His management (rule 7)** and **autotrade on account 5347047** — only after he has seen the signals tested.
3. 1H volume profile (point of control as support/resistance) — *"you will build later"*, and he wants it backtested.
4. Barchart options data at the London / New York / Asia opens — he will specify the data.
5. The stop-order entry backtest he asked for — **never run without his yes**.

## Facts (checked 18 Nov)
- Broker symbol **`BTCUSD`**, id 10028, prices to 2 decimals, matching `shared/pip.py`. Gold `XAUUSD`, 2 decimals.
- Spreads on 18 Nov: BTC **$33.82** (bid 62,691.74 / ask 62,725.56), gold **$0.11**. No cap (his answer).
- Bitcoin trades at weekends: `config/instruments.ALWAYS_OPEN = {"BTC/USD"}`, so the scanner keeps scanning it while
  the forex week is shut, and says so once in the log. Every other instrument stops at the Friday close as before.
- "BTC" has no economic calendar; PIX is news-agnostic (`NEWS_AGNOSTIC`).
- Real gold, 12–17 Nov, through the real strategy class (829 scan points; a COUNT of what it decides, NO outcomes
  scored), with his real-zone rule: **12 signals** — 10 zone, 2 support/resistance. **9 of the 10 zone signals are the
  same supply zone re-tapped** (stop 3949.20, entry ~3,881: a ~$68 stop — the zone is ~$79 tall). Live, the platform
  holds back a repeat while the first is still open (one active signal per strategy + pair + direction,
  `validation/signal_validator.py`), so it fires again only after the first closes or its 24 hours run out.

## The order-flow tools — audit (18 Nov 2026, read line by line)
| tool | verdict | why |
|---|---|---|
| Tworasos/tape-and-book (MIT) | idea TAKEN, code REWRITTEN | right data for Bitcoin (Binance's taker-buy volume = real aggressive buying). Its flaws, fixed in ours: absorption compared each candle with the median of the WHOLE window incl. later candles (look-ahead); volumes cast to whole numbers (0.003 BTC → 0); the still-forming candle not dropped; "absorption" = big volume / small range, not his definition; needed numpy; one endpoint only |
| justyaboyking/orderflow (MIT) | rejected | live websocket screen — no history to judge the approach, empty after every restart, no absorption, a smaller BTC venue |
| NautilusTrader (LGPL) | rejected | a whole trading engine (would replace our platform); no footprint / absorption / CVD-divergence to lift |
| gold | our own estimate | no free exchange volume exists for spot gold (CME futures data is paid); cTrader's tick history shares the scarce ~5/s request budget, so ticks are counted LIVE from the stream we already run |

Checked on real data 18 Nov: Binance BTC 5M candles open on the same UTC grid as the broker's BTCUSD (18:05 / 18:10 /
18:15, 18:20 forming on both); the 18:15 candle fell on the broker and Binance shows sellers ahead (−96 BTC).

## Fix log
| date | what |
|---|---|
| 2026-11-17 | Created (as OVP) as an exact, independent copy of BX-S/D, switched off, pairs set to BTC/USD and XAU/USD. |
| 2026-11-18 | **THE 17 NOV ROW WAS NOT TRUE OF THE CODE — corrected.** `enabled = False` and the two pairs were set for real; the independence test added. |
| 2026-11-18 | **HIS SKELETON BUILT, REPLACING THE BX COPY.** New big-zone, skeleton and trend modules; strategy rewritten to feed them. Registered and switched on; entries to the channel; not in autotrade. BTC/USD added to the scan list, scanned at weekends. **The copied cascade is DELETED** — 24 modules nothing reached any more (`ovp_setup`, `ovp_registry`, `ovp_signal`, `ovp_signal1`, `ovp_entry`, `ovp_watch`, `ovp_reports`, … ) and the 12 tests that only tested them. **Fault found by the proof test and fixed:** a 5M candle that closed THROUGH the zone was forgotten the moment the next candle dipped in and closed back out — the visit now starts at its first touching candle. `tests/run_all.py` now runs the strategy test folders — nothing ran them before. |
| 2026-11-18 | **FOUND LIVE: no live bid/ask.** Set `requires_spread = True`; `spread_cap = False` for this strategy only (BTC's $33.82 spread = 0.054% would have refused every BTC signal under the platform's 0.05% cap); VIX.1 keeps the cap. |
| 2026-11-18 | **RENAMED OVP → PIX** (his order). Files `pix*.py`, id `pix`, tests `tests/pix/`, these docs. No OVP signal was ever sent, so no stored row carries the old id. **SHARES NO LOGIC** (his rule): own copies `pix_trend.py` (trend), `pix_swings.py` (swing points), `pix_candles.py` (finished-candle check); the independence test now fails on any shared-logic or other-strategy import (teeth: both kinds caught). **TREND FIX** (his "fix it for every strategy", made in the shared reader too): equal highs/lows count for neither side, a trend needs a lead of 2 — a flat range now reads RANGING at 12 of 12 window ends (was 4 down / 4 ranging / 4 up); PIX's copy and the shared reader give identical answers on 2,171 GBP/USD and 541 gold 4H readings. **HIS REAL-ZONE RULE** replaces my two tests (4 straight closes; gap above the median), deleted. Proof: `test_skeleton.py` 29 checks (travelled → kept; stopped short → refused; a zone formed after price got there, a zone closed through before, and a zone the move ran straight through all refused; teeth), `test_regime.py` 7, `test_independence.py` 19. |
| 2026-11-18 | **ORDER FLOW BUILT (his rule 5b)** — `pix_flow.py` (absorption / initiation / CVD divergence vs convergence, closed candles only, UNKNOWN refuses), `pix_btcflow.py` (Binance futures, spot mirror as fallback, decimals kept, forming candle dropped, 5s limit, never raises), `pix_goldflow.py` (tick-rule estimate from the live stream; part-counted minutes excluded; needs ~1h after a restart), fed through the new plumbing list `data/tick_listeners.py` that `monitor/entry_watcher.py` hands to the stream (each listener inside the stream's own try). Both 5M and 1M must say GO; the reasons and the source go on the card. Proof: `tests/pix/test_flow.py` 28 checks (incl. teeth for absorption and initiation, the look-ahead guard, the fallback, the gold coverage rules), `test_skeleton.py` 31 (no check → no plan; a refusal is reported), `test_independence.py` 21. |
| 2026-11-18 | **HIS LAYERS** — trend from the 4H, or the 1H when the 4H is sideways (`pix_trend.direction`), never against it; zones from the 5M first, best when inside a 1H/4H zone, then 1H/4H, then lone 5M (`pix_bigzones.candidates`, moved there to keep `pix_skeleton.py` under 200 lines); the tap must come after price travelled away; stop at the traded zone's own edge. Real gold 12-17 Nov through the real class with order flow treated as yes (a COUNT, nothing scored, order flow cannot be replayed offline): 85 price-only plans (was 12), stops mostly $5-12 (was ~$68); live, order flow and the one-open-signal limit cut that. 0.23 s a scan. Proof: `test_skeleton.py` 40 checks (trend cases, the order, the travelled-before-tap guard with teeth, the stop). |
