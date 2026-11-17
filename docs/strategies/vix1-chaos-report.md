# VIX.1 — Chaotic-move check: test report and recommendation (17 Nov 2026)

> ⚠ **SUPERSEDED the same day.** The two-test recognition below (bodies-only clean travel < 30% AND give-back) was
> replaced by ONE whole-candle test (wicks included, chaotic under 7.75%) at his word: *"test one is enough… look at
> the whole candle anatomy"*. Current rule and numbers: `vix1.md` fix log 2026-11-17 (g), `strategies/vix1_chaos.py`.
> The premise measured here (in a chaotic move the 2nd/3rd candle is rarely a momentum candle) still stands.

## 17 Nov (latest) — the two tests compared, then COMBINED at his word ("Combine and deploy")
**Tested:** the deployed whole-candle test (price got under 7.75% of its travel) against a new who-is-in-control
reader (each of the 12 candles read as buyers/sellers took control, a fight pushed back, or nobody moved it;
push-and-pull unless one side took control ≥3 times, ≥2× the other, and someone did in the last 5). Counts only,
nothing scored, so this is not a backtest.
**Trust:** reader proven on 16 hand-built candles/stories (`test_chaos.py` 0b); each half proven to act alone (teeth).
**Findings:**
| set | agree | where they differ |
|---|---|---|
| his 18 marked candles | 17 | his D42 chop EUR/USD 5 Aug 14:00 UTC — only the new reader catches it |
| 10 random trending markets (PDF on his Desktop) | 9 | #9 GBP/USD 1 Jul 2020 — only the new reader objects |
| 300 random trending momentum candles | 197 | 29 only the whole-candle test, 74 only the new reader |
Combined (either one = wait): 17/18 of his examples (only 11 Nov 16:00 missed, by both); all his keep candles
still trade; **188 of 300 (63%)** trending momentum candles held back, against 114 (38%) before.
**Recommendation (followed):** combine — the two read different things (distance got vs who was in control).
**Still unknown:** whether holding back 63% earns more money — needs a backtest, which needs his yes. The new
reader does not look at WHICH side controls compared with the momentum candle (his call, raised on the PDF).

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

## Status
**SWITCHED ON 17 Nov 2026** at his word — it now refuses chaotic-market momentum candles on both trading routes
(see the `vix1.md` fix log, 2026-11-17 (b)). The recommendation below was the plan before that.

## Recommendation (superseded by the switch-on)
Watch it on the DM (every momentum announcement now says CLEAN MOVE or CHAOTIC MOVE · WAIT FOR 2ND/3RD). When the
labels match what you see on the chart, say "switch it on" and it becomes one refusal in the strategy's existing
list — a chaotic-market momentum candle is then only traded if the next or the one after is a momentum candle too.

## Still unknown
Whether waiting improves profit in money terms — that needs a backtest, which needs your approval.
