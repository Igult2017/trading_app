# Separate test — momentum move → slight pullback → momentum candle resumes it (18 Nov 2026) — INTERIM

**Not VIX.1.** His words: *"Wait for a move, a momentum move to run and at any slight pullback of an opposite candle,
we enter when the move resumes"*; pullback = *"Any opposite candle in a momentum move"*, *"between 1 to 3 candles"*;
trigger = *"A close of a momentum candle … already defined in VIX"*. INTERIM: GBP/JPY is added when its 2-year
1-minute download completes.

## Rules (fixed before the run)
- Pullback = 1-3 candles in a row not closing the move's way (VIX.1's count, `since_pullback`); 4+ = no trade.
- The run of the move's-way candles just before it holds a momentum candle that way (his 2.5x rule).
- The candle right after the pullback is a momentum candle that way: `qualifies_for_trade` + his 17 Nov strict rule.
- 1-minute stop order (`m1_signals`, 0.552 stop) in the hour after; his hours; one trade at a time; waiting order
  cancelled if its stop side is touched first or after 24h; breakeven at 0.4R; target 2R; commission; BUY fills and
  SELL exits on the ask. Kit: `trading_app_data/tools/momentum_pullback.py` (+ `volume_after_quiet.trade`).

## Why it can be trusted
15 hand-built proof cases (`test_momentum_pullback.py`) incl. pullback 1/2/3 taken and 4 refused, no momentum in the
move → none, strict rule refuses an allowance-only candle, no look-ahead — each with teeth. Data: GBP/USD + EUR/USD
1-minute 22 May 2024 → 17 Nov 2026, joined files identical on the overlap, no duplicates/gaps/corrupt bars. 5 random
setups checked candle by candle; all 7 wins re-checked by separate code: 7 of 7 real.

## Findings — GBP/USD + EUR/USD, 18 Nov 2024 → 17 Nov 2026
| version | trades | a month | full loss | breakeven | 2R | total |
|---|---|---|---|---|---|---|
| **his rule** | 69 | 2.9 | 24 | 38 | 7 | **−11.17R** |
| + CVD agrees | 54 | 2.2 | 21 | 26 | 7 | −7.99R |
| pullback with no opposite momentum candle | 61 | 2.5 | 21 | 33 | 7 | −8.11R |
| pullback of exactly 1 / 2 ⚠ / 3 ⚠ | 39 / 20 / 14 | | 16 / 5 / 4 | 20 / 13 / 8 | 3 / 2 / 2 | −10.68 / −1.36 / −0.14R |
⚠ under 30 trades. 119 of 206 setups found no 1-minute entry within the hour.

It loses, and the pattern is the one seen in VIX.1 and in the volume-after-quiet test: **38 trades reach 0.4R, come
back to breakeven and earn nothing, against 7 that reach 2R.** Longer pullbacks (2-3) do better than 1, on samples too
small to rely on.

## Recommendation
Not profitable as specified. The common factor across all three tests is the breakeven at 0.4R against a 2R target —
test it next (same trades, breakeven at 0.4R / later / none), which needs his approval as a backtest.

## Still unknown
GBP/JPY (download running). Constant spread; no news rules; CVD is an estimate from tick volume.

## Breakeven test (his approval, 18 Nov: *"Try those 2. No breakeven and 1R"*) — all three strategies
Same trades, same fills; only the stop management changes; target fixed 2R; one at a time re-applied. Proven on
hand-built paths (7 cases); every no-breakeven pullback trade (76) re-checked independently: 76 agree.

| strategy (2 years, GBP/USD + EUR/USD) | breakeven 0.4R | breakeven 1R | no breakeven |
|---|---|---|---|
| VIX.1 as live (live ladder: 0.4R + lock at 1.5R) | −15.65R (70) | −17.34R (70) | −18.75R (67) |
| Volume after quiet, 1st candle | −15.39R (80) | −21.58R (77) | −21.00R (75) |
| Volume after quiet, 2nd candle | −2.54R (37) | **−2.19R** (37) | −5.46R (37) |
| Momentum → pullback → resumes | **−11.17R** (69) | −16.99R (69) | −17.60R (69) |

**The breakeven at 0.4R is NOT the cause — removing it or moving it to 1R makes things worse.** Without breakeven the
pullback strategy wins 18 of 69 (26%); at a 2R target it needs 34% (plus costs) to break even. The trades that came
back to breakeven mostly went on to the full stop. The problem is the entries: not enough of them reach 2R.
