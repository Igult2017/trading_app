# PIX — 2-year backtest and divergence study (19 Nov 2026)

His request: *"run a backtest of PIX on BTCUSD, XAUUSD, EURUSD, Zones at 5mins, trend at 1HR and 4HR and then entry at
1M. Use the tools, and also run a test on how many divergences do we have a month and are they profitable as in do they
really predict price action. Data is 2 yrs."*

## The answer in one paragraph
**PIX as built does not make money over these two years.** Price rules alone: Bitcoin −0.07R a trade, EUR/USD −0.19R,
gold +0.03R (≈ break-even, before commission). With the live order-flow gate on Bitcoin (the only market with 2
years of real buy/sell data) it takes 108 trades instead of 2,150 and averages −0.19R — the gate did not help on this
sample. **Divergence does not predict direction**: after a divergence price went +1R the trade's way 43.7% of the
time, after a convergence 44.9%. Divergence trades lose LEAST (−0.05R vs −0.10R and −0.14R) but still lose. The
replay also found a real defect in PIX, fixed: buys were being dropped whenever the 1M candle closed within one spread
of its high.

## What was tested, and how (definitions written before the run)
- **The strategy's own functions** (`pix_skeleton.zone_plan` / `range_plan`, `pix_flow.verdict`, `pix_flow.cvd_state`),
  his parameters, called at every 5M close with only candles CLOSED by then. Trend = 4H, else 1H; zones = 5M (best
  inside 1H/4H), 1H, 4H; respect on 5M; 1M stop-order entry; stop beyond the zone; 3R. Support/resistance path too.
- **Trades** (`trading_app_data/tools/pix_sim.py`): candles are bid; a buy fills on the ask (bid + spread), a sell on
  the bid; inside one candle the costly order is assumed (stop before target; a fill candle never takes profit; fill
  and stop in one candle = −1R); stop before the fill = cancelled; one active signal per pair and direction (the
  platform's rule). Spreads: BTC $33.82 (measured 18 Nov), gold $0.30 (measured $0.11 — cautious), EUR/USD 1 pip
  (spread + commission). **Commission is not included** otherwise. Results in R.
- **Exits:** plain (−1R / +3R) and HIS ladder (breakeven at 1R, +1R at 2R, +2R at 2.5R, out at 3R). Order validity
  15 min / 1 h / 4 h / 24 h (live = 24 h).
- **"Use the tools" — what 2 years of history can replay:** volume profile on all three (candle volume); candle
  buy/sell (absorption, initiation volume, CVD) on **Bitcoin only** (Binance's real taker volumes) — no history of who
  bought/sold exists for gold or EUR/USD, so they ran **price rules + volume profile only, NOT the live gate**; the
  per-price footprint (absorption from stacked imbalances) on **none** — it needs every individual trade (~200 GB for
  Bitcoin).

## Why it can be trusted
- Data checked first: BTC 17 Nov 2024 → 18 Nov 2026 (1,052,640 1M candles), gold 17 Nov 2024 → 17 Nov 2026 (706,450;
  two 3-day gaps = Easter), EUR/USD 22 May 2024 → 17 Jul 2026 (800,000 — ends 4 months ago); no duplicates, no
  impossible candles, no jumps over 10%.
- The trade replay proved on hand-built candles first — 20 checks, each rule broken on purpose once and caught
  (`pix_sim_test.py`); the zone-search speed-up proved identical to the old code (8,928 of 8,928 answers on real gold).
- Five random trades printed candle by candle and checked against the rules by hand (gold sell 31 Dec 2025, gold sell
  13 Mar 2026, gold buy 11 Nov 2026, Bitcoin buy 3 Oct 2026, Bitcoin sell 17 Nov 2025) — all correct.

## Results — plain exit, order valid 24 h (live)
| pair (mode) | months | trades | per month | win % | total R | avg R | worst drawdown |
|---|---|---|---|---|---|---|---|
| BTC — **with order flow (live gate, no footprint)** | 23.3 | 108 | 4.6 | 20.4 | −20.0 | −0.185 | 31.0R |
| BTC — price rules only | 23.3 | 2,150 | 92.2 | 23.3 | −157.0 | −0.073 | 189.0R |
| gold — price rules only | 23.0 | 1,764 | 76.8 | 26.0 | +49.0 | +0.028 | 68.5R |
| EUR/USD — price rules only | 24.9 | 1,655 | 66.5 | 20.5 | −312.1 | −0.189 | 312.1R |

Break-even at a 3R target is a 25% win rate; every row wins 20-26%. On Bitcoin (measured in the divergence study
below), price reached +1R after the fill in ~43-45% of trades — far more often than the +3R the target needs.

**His ladder** (same pairs, 24 h): BTC with order flow −0.104R a trade (115 trades — better than plain, still
negative); BTC price −0.097R; gold −0.020R; EUR/USD −0.190R. The breakeven rung turns ~22% of trades into 0R, which
frees the slot sooner (more trades), but the wins it gives up cost more than the losses it saves everywhere except
Bitcoin-with-order-flow.

**How long the order stays valid** changes little: half the orders fill on the next 1M candle, 90% within 5-13
minutes, and only 0.5-1.9% fill after an hour. 15 minutes vs 24 h: BTC with order flow −0.102R vs −0.185R (98 vs 108
trades); the others move by only 0.006-0.011R.

### By zone timeframe and path (plain, 24 h; avg R, trades)
| pair | 5M zones | 1H zones | 4H zones | support/resistance |
|---|---|---|---|---|
| BTC with order flow | −0.243 (74) | **+0.273 (22 ⚠ <30)** | −0.667 (12 ⚠) | −1.0 (1 ⚠) |
| BTC price only | −0.084 (1,752) | +0.027 (300) | −0.184 (98) | −0.132 (144) |
| gold price only | +0.024 (1,442) | −0.012 (247) | **+0.227 (75)** | +0.095 (169) |
| EUR/USD price only | −0.198 (1,286) | −0.212 (259) | −0.018 (110) | −0.195 (103) |
⚠ = under 30 trades: no conclusion is drawn from it.

## The divergence study (Bitcoin only — the only market with real buy/sell history)
Every respected 5M tap PIX saw (price rules passed), classed by PIX's own 5M CVD reading, each played out on its own:
| CVD reading | taps | filled | win % | avg R | price went +1R | +2R |
|---|---|---|---|---|---|---|
| divergence | 3,520 | 3,084 | 23.8 | −0.05 | 43.7% | 30.5% |
| convergence | 10,979 | 9,659 | 22.6 | −0.10 | 44.9% | 30.0% |
| neutral | 8,879 | 7,798 | 21.5 | −0.14 | 42.9% | 28.7% |

Divergences per month: 105-188 taps (average ~147) — counted per tap, so one zone touched several times counts
several times. **Does it predict price action? No** — a divergence is followed by price going the trade's way no more
often than a convergence (43.7% vs 44.9% to +1R). It is associated with slightly smaller losses, not with wins.

## What this does NOT show
- The live gate for gold and EUR/USD (no buy/sell history exists) and the footprint anywhere — their rows are price
  rules + volume profile only.
- Commission (gold and EUR/USD CFDs charge it; it would lower every row).
- EUR/USD's last 4 months (the data ends 17 Jul 2026). Bitcoin prices are Binance's, not the broker's CFD.
- Whether a 5M zone sat inside a 1H/4H zone (the plans do not record which of the three groups a zone came from).

## Recommendation
1. **Do not trade PIX as it stands** — no pair is clearly profitable after costs over two years.
2. The two groups worth a closer look are **1H zones on Bitcoin** and **4H zones on gold** (positive, but small or
   thin samples). Narrowing PIX to them is HIS decision, not something to switch on from this table.
3. **Divergence alone is not an edge** — keep it as one input, not a reason to enter.
4. On the order's validity, 15 minutes loses nothing and avoids stale fills (his number to set — OPEN F8).

Kit: `trading_app_data/tools/pix_bt.py` (decisions), `pix_sim.py` + `pix_sim_test.py` (trades, 20 checks),
`pix_bt_sim.py` (tables); raw results `trading_app_data/tools/results.json`.
