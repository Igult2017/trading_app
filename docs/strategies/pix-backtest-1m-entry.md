# PIX — 2-year win rate with the 1M entry (19 Nov 2026)

His request: *"I need winrate of PIX 2 years data, BTC, Gold and EURUSD. Entry is 1M so dont forget. We trade respected
zones only. The zones that are tapped and respected."*

## The answer
| pair | trades (filled) | win rate | avg per trade | total | months in profit |
|---|---|---|---|---|---|
| **Bitcoin** | 2,487 | **18.2%** | −0.28R | −690.6R | 2 of 24 |
| **Gold** | 3,491 | **22.8%** | −0.09R | −318.1R | 6 of 24 |
| **EUR/USD** | 3,987 | **16.6%** | −0.34R | −1,358.0R | 1 of 26 |

Every trade targets 3R, so **the break-even win rate is 25%. All three markets are below it, so none makes money.**
Gold comes closest (22.8%). On his ladder (breakeven at 1R, +1R at 2R, +2R at 2.5R, out at 3R) the picture is the same:
- Bitcoin: 18.7% wins, −0.26R a trade.
- Gold: 22.9%, −0.10R.
- EUR/USD: 16.4%, −0.34R.

## What was tested (definitions written before the run)
- **PIX exactly as it now runs live.** Its own functions (`pix_skeleton.zone_plan`, then `range_plan`; `pix.make_check`
  for Bitcoin) are asked at the close of EVERY 1M candle, using only candles closed by that moment. Nothing is
  re-implemented.
- **A respected zone (his rule):**
  - a 1M candle touches the zone, and no 1M or 5M candle closes through it;
  - at least 2 1M candles then close our way;
  - the first opposite candle is the pullback;
  - a stop order goes at its high + the spread (buy) or its low (sell);
  - the stop sits behind the pullback (0.5 × the 1M average range); the target is 3R.
  - No reaction = no trade.
- **Trades:**
  - candles are bid prices, and a buy fills on the ask;
  - inside one candle the costly order is assumed (stop before target; the fill candle never takes profit);
  - if the stop is touched before the fill, the order is cancelled, not a loss;
  - one active signal per pair and direction (the platform's rule).
- **Win rate** = trades that hit 3R ÷ trades that filled.
- **Costs:** Bitcoin $33.82 spread, gold $0.30, EUR/USD 1 pip (spread + commission). No other commission.
- **Order flow:** Bitcoin has real buy/sell history (Binance), so its absorption refusal and agree/disagree line were
  replayed. Gold and EUR/USD have no buy/sell history, so their rows are the price rules only. (Live, they use our
  tick estimate.)
- **Data:**
  - Bitcoin 17 Nov 2024 → 18 Nov 2026;
  - gold 17 Nov 2024 → 17 Nov 2026;
  - EUR/USD 22 May 2024 → 17 Jul 2026 (its file ends 4 months ago).
  - No duplicates, no corrupt candles, no jumps over 10%. Gold has two 3-day Easter gaps.

## Why the numbers can be trusted
- **The kit was proven first.** `trading_app_data/tools/pix_bt_test.py` runs 15 checks on hand-built candles:
  - the plan appears exactly at the minute the pullback candle closes, and once;
  - its entry and stop equal the strategy's own function;
  - with no reaction, there is no plan.
  - It fails when broken on purpose: letting a not-yet-closed candle in, and removing the one-signal-per-pullback rule.
  - The trade replay (`pix_sim.py`) has its own 20 checks.
- **30 random trades (10 per pair) were re-derived from the raw candles** with a separate, plain reading of his rule
  that uses no PIX code (`pix_bt_handcheck.py`). It found the last touch, the candles our way, none against, the
  opposite candle and the entry price. **All 30 match.** One gold win was also followed candle by candle to its fill.

## Findings in plain words
1. **About half of all signals never fill.** Price comes back through the stop before it breaks the pullback, so the
   order is cancelled at no cost:

   | pair | signals | cancelled at no cost |
   |---|---|---|
   | Bitcoin | 5,121 | 2,327 |
   | Gold | 7,150 | 2,849 |
   | EUR/USD | 8,338 | 3,339 |

   This is the stop order protecting him, as he said it would. It also means PIX sends 220-335 signals a month for
   about 107-160 trades.
2. **The stop behind the pullback is very tight, and the spread eats it.**
   - Bitcoin's median stop is $108, only **3.2× its spread**; EUR/USD's is 3.0 pips, **3.0× its cost**. Gold's is
     $2.69, **9.0× its spread**.
   - The pair with the roomiest stop relative to its cost (gold) is the one closest to break-even.
   - **This is an observation, not a proven cause.** Testing a wider stop is his decision.
3. **Price does go our way, but rarely far enough.** After the fill:

   | pair | reached +1R | reached +3R (wins) |
   |---|---|---|
   | Bitcoin | 36.6% | 18.2% |
   | Gold | 44.3% | 22.8% |
   | EUR/USD | 31.9% | 16.6% |
4. **Bigger zones mostly do slightly better, but not on gold's 4H** (plain exit, 24 h; trades, win %):

   | pair | 5M zones | 1H zones | 4H zones |
   |---|---|---|---|
   | Bitcoin | 1,972, 17.5% | 386, 20.5% | 129, 22.5% |
   | Gold | 2,601, 22.8% | 617, 24.1% | 273, 20.1% |
   | EUR/USD | 2,835, 16.3% | 846, 16.9% | 306, 18.3% |

   None of them is above 25%.
5. **Bitcoin's order flow agreed on only 223 of 2,487 trades (9%).** Those won 17.5%, against 18.3% when it disagreed,
   so agreement did not pick better trades on this history.
6. **How long the order stays valid doesn't matter.** Half the orders fill in the same minute and 90% within 3 minutes.
   15 minutes and 24 hours give the same result to within 0.001R, so this answers OPEN F8(b).
7. **Buys and sells behave alike** (Bitcoin 17.9% / 18.5%; EUR/USD 16.6% / 16.5%). Gold's sells did a little better
   (24.2% against 21.9%).

## Found while checking (not changed — his call)
- **Over a weekend the "last hour" window reaches back to Friday.** The 1M window counts 60 *candles*, not 60 minutes,
  so in the first hour after the Sunday open a Friday touch can count as the start of the visit. A hand-checked gold
  trade (9 Feb 2025) had its first touch on Friday 21:04. Live PIX does the same.

## Recommendation
1. **Do not trade PIX as it stands.** No pair reaches the 25% a 3R target needs, on any exit or any order life.
2. **The stop is the first thing to look at**, because its size relative to the spread lines up with the results. One
   option is the zone's far edge, which was his option (a) for the stop this morning. Testing that is his decision.
   Changing it quietly would be inventing a rule.
3. Taking only the bigger zones helps a little on Bitcoin and EUR/USD (not on gold's 4H), and every group is still
   below break-even.

## What this does NOT show
- The live order-flow check for gold and EUR/USD (no history exists), and the footprint anywhere.
- Commission on gold. EUR/USD's last 4 months. Bitcoin prices are Binance's, not the broker's CFD.

Kit:
- `trading_app_data/tools/pix_bt.py` (decisions, proven by `pix_bt_test.py`);
- `pix_sim.py` (trades, `pix_sim_test.py`);
- `pix_bt_sim.py` (tables), `pix_bt_handcheck.py` (30 trades re-derived).
- Results: `trading_app_data/tools/entry1m/results.json`.
