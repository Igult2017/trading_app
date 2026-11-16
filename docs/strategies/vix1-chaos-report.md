# VIX.1 — Chaotic-move check: test report and recommendation (17 Nov 2026)

## What was asked
*"Whenever a momentum candle has qualified, it runs one last test which looks back to see the candles that
dominated that move. If they are not aligned like in image 2 … we wait for the second momentum candle to take a
trade."* Picture 1 (GBP/USD, 11–17 Nov 2026) = the tug-of-war market to stop trading. Picture 2 (5–10 Nov) =
the directional market to keep.

## How it was tested
Real GBP/USD hourly broker candles (7 years, 44,863 hours), with every momentum candle decided by the strategy's
own `qualifies_for_trade`. Counts only: nothing simulated, no trade scored, so this is not a backtest.

## Findings
1. **His premise holds.** In his chaotic move, after each of its 8 momentum candles, the next candle was a
   momentum candle 0 times and the one after 0 times. In the 7 years' moves that most resemble it: 4.1–4.7% and
   3.5–7.7%. So in such a market, "wait for the 2nd or 3rd" almost always means no trade.
2. **The market can be recognised from the candles before the momentum candle.** Chaotic when, over the last 12
   candles, price got under 30% of the distance its bodies travelled, AND at least a third of the big candles in
   the last 24 were half given back within 3 candles.
3. **On his 14 candles it is right 13 times.** All 6 in picture 2 read clean (they trade as before); 7 of 8 in
   picture 1 read chaotic (they wait). The miss, Wed 11 Nov 16:00, is the drop *into* the chaos after a clean
   fall — the candles before it really were clean.
4. **Over 7 years it reads 37% of momentum candles as chaotic.** Most momentum candles never become signals
   because of the other rules, so the effect on actual signals is smaller than 37%.

## Why it can be trusted
46 checks pin his 14 real candles, the 2nd/3rd exemption, and that nothing trades on it yet. Deliberately
loosening the two lines makes 7 of them fail.

## Recommendation
Watch it on the DM (every momentum announcement now says CLEAN MOVE or CHAOTIC MOVE · WAIT FOR 2ND/3RD). When the
labels match what you see on the chart, say "switch it on" and it becomes one refusal in the strategy's existing
list — a chaotic-market momentum candle is then only traded if the next or the one after is a momentum candle too.

## Still unknown
Whether waiting improves profit in money terms — that needs a backtest, which needs your approval.
