# OVP — BTC/USD and XAU/USD

**Status (18 Nov 2026): HIS SKELETON IS BUILT, REGISTERED AND SWITCHED ON. SIGNALS ONLY — to the public channel.**
It places NO orders: `ovp` is not in `autotrade_strategies` (`config/settings.py`), and a test fails if it ever is.
His order: *"build the strategy first please. and test before you link to autotrade. We start by sending them to the
channel."* The shape (files, flow, constants) is in [ovp-architecture.md](ovp-architecture.md).

## His rules — in his words (18 Nov 2026)
- *"4H: is the market trending, and mark the main zones; 1H: confirm the trend and the zones that align with it; 5M:
  focus on those zones; 1M: entry. Only focus on big zones not small ones. Big zones means ones with bigger FVG IFc."*
- Big: *"The gap is just generally big not some miniature gaps that can never be respected. Big gaps attract price and
  have higher probability of being respected. Also, the gaps that the price had left behind and travelled many candles
  not 1 or three candles gap. One or 2 or three candles gap are only for re-tap."*
- 4H / 1H / 5M: *"In 4 hours, we want to confirm if we are trending or not. If we are trending, we look for zones in the
  direction of the trend not against and the zones near the money. In 1HR refine those zones and mark the ones near the
  money that we expect the price to come back and tap. In 5 minutes, we look at those zones and any zones formed near
  them… the price is likely to clear them in case of a pullback and tap the zone in the higher timeframe then move."*
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

## His rules → the code
Where he gave no number, the number is MINE — each is one named constant, quoted here so he can change it.

| # | his rule | how the code reads it | where |
|---|---|---|---|
| 1 | big zones only | the move that left the gap made **≥ 4 consecutive closes** one way (`MIN_RUN`) AND the gap is **taller than the median of the last 100 gaps** on that timeframe (`GAP_LOOKBACK`); fewer than 20 earlier gaps = not judged (`MIN_PRIOR_GAPS`) | `ovp_bigzones.py` |
| 2 | 4H trend, never against it | `ovp_trend.regime` (shared swing-high/low reader). Up → demand only, down → supply only; zones from 4H AND 1H both count. The 1H does NOT vote — a 1H move against the 4H is the pullback that brings price to the zone | `ovp_trend.py`, `ovp_skeleton.zone_plan` |
| 3 | near the money | zone's near edge within **one average daily range** (14-day ATR, `ATR_LEN`, `NEAR_ATR_MULT = 1.0`) | `ovp_bigzones.py` |
| 4 | touched zones allowed | untouched OR touched; a zone a candle has **closed through** is dead (a wick through is a sweep, not a break) | `ovp_zones.break_index` |
| 5 | 5M: price taps, respects | **INTERIM** until the order-flow tools exist: the last closed 5M candle is the FIRST close back out of the zone the trade's way, the tap within the last hour (`TAP_WINDOW_M5 = 12`), nothing in the visit closed through the far edge | `ovp_skeleton.respected_5m` |
| 6 | 1M stop order | buy stop at the last closed 1M high (sell: low); stop at the zone's far edge (+ spread on a sell); **target 3R** (`TARGET_R`). Refused if the live ask (buy) / bid (sell) is already through the entry | `ovp_skeleton.entry_1m` |
| 7 | his management | **NOT BUILT** — needs its own account and its own ladder; deferred with autotrade by his 18 Nov order | — |
| 8 | ranging → 5M S/R | a 5M swing low/high (3 candles each side, `SR_PIVOT`) = respected once; price back into its band (± ¼ of the 5M average range, `SR_TOL_ATR`) and out again = the 2nd respect; stop order; needs **≥ 2R** of room to the nearest opposite level (`RANGE_MIN_R`), target = 3R or that level, whichever is nearer. In a trend, only the trend's side | `ovp_skeleton.range_plan` |

## What is NOT built yet (his list, in his order)
1. **Order flow on 5M and 1M** — footprint delta, absorption / initiation, CVD divergence vs convergence. Replaces
   rule 5's interim test. Bitcoin: the exchange's real buyer/seller data; gold: tick-volume estimates only.
2. **His management (rule 7)** and **autotrade on account 5347047** — only after he has seen the signals tested.
3. 1H volume profile (point of control as support/resistance) — *"you will build later"*, and he wants it backtested.
4. Barchart options data at the London / New York / Asia opens — he will specify the data.
5. The stop-order entry backtest he asked for — **never run without his yes**.

## Facts (checked 18 Nov)
- Broker symbol **`BTCUSD`**, id 10028, prices to 2 decimals (~64,557), matching `shared/pip.py`. Gold `XAUUSD`, 2 decimals.
- Bitcoin trades at weekends: `config/instruments.ALWAYS_OPEN = {"BTC/USD"}`, so the scanner keeps scanning it while
  the forex week is shut, and says so once in the log. Every other instrument stops at the Friday close as before.
- "BTC" has no economic calendar; OVP is news-agnostic (`NEWS_AGNOSTIC`).
- Real gold, 12–17 Nov (829 scan points, a look at what it decides, NO outcomes scored): no crash; 3 support/resistance
  plans; the zone path fired 0 times — every big supply zone near price in that falling week had already been closed
  through, and no 4H supply zone near price came from a 4-close move.

## Fix log
| date | what |
|---|---|
| 2026-11-17 | Created as an exact, independent copy of BX-S/D, switched off, pairs set to BTC/USD and XAU/USD. |
| 2026-11-18 | **THE 17 NOV ROW WAS NOT TRUE OF THE CODE — corrected.** `enabled = False` and the two pairs were set for real; `tests/ovp/test_independence.py` added. |
| 2026-11-18 | **HIS SKELETON BUILT, REPLACING THE BX COPY.** New `ovp_bigzones.py` (rules 1-4), `ovp_skeleton.py` (5, 6, 8), `ovp_trend.py` (the 4H read, moved out of the deleted `ovp_setup.py` unchanged, its unused Daily argument removed); `ovp.py` rewritten to feed them. Registered and switched on; entries to the channel (`dm_only_exempt` += `ovp`); not in autotrade. BTC/USD added to the scan list, scanned at weekends. **The copied cascade is DELETED** — 24 modules nothing reached any more (`ovp_setup`, `ovp_registry`, `ovp_signal`, `ovp_signal1`, `ovp_entry`, `ovp_watch`, `ovp_reports`, … ) and the 12 tests that only tested them, incl. the `aug03` regression whose red assertion was `docs/OPEN.md` A4 (A4 is now BX-S/D's alone). Dead functions and fields cut from `ovp_zones.py`. **Fault found by the new proof test and fixed:** a 5M candle that closed THROUGH the zone was forgotten the moment the next candle dipped in and closed back out — the visit now starts at its first touching candle. Proof: `tests/ovp/test_skeleton.py` (27 checks, hand-built candles, teeth), `test_independence.py` (14, incl. a real signal routed through the dispatcher to the channel), `test_regime.py` (4). `tests/run_all.py` now runs the OVP and BX-S/D folders — nothing ran them before. |
| 2026-11-18 | **FOUND LIVE, AFTER THE FIRST DEPLOY: OVP was never given the live bid/ask.** The platform fills `context.quote` only for a strategy that sets `requires_spread` (`strategy_runner.py`, `quote_for(...) if deps.needs_spread`); OVP did not, so "would this stop order fill at once?" read a closed 1M close up to ~2 minutes old and a sell's stop carried no spread. Fixed: `requires_spread = True`. That also switches on the platform's 0.05%-of-price spread cap, and **Bitcoin's spread on 18 Nov was $33.82 = 0.054%** — every BTC signal would have been refused. So `spread_cap = False` for OVP only (the runner now asks); VIX.1 keeps the cap. Whether Bitcoin should have a cap of its own is his call (`docs/OPEN.md` F5). `test_independence.py` 18 checks. |
