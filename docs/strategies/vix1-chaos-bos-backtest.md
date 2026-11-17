# VIX.1 — Does the chaotic-move check's blocking of break-of-structure trades save money? (17 Nov 2026)

**A BACKTEST, run at his request** — *"Can you measure if it blocks Break of structure saves us money or gives
losses"*. That request was the approval, for this question only.

## What was tested and how
- GBP/USD and EUR/USD, 1 Jun 2024 → 17 Jul 2026 (the span with one-minute candles).
- The strategy's REAL code throughout: `detect_bias` (the trade decision), `m1_signals` (the 1-minute entry with
  his 0.552 stop), his 4R target, and the REAL profit ladder; every trade walked minute by minute, the stop counted
  first whenever one candle could have hit both (`trading_app_data/tools/vix1_chaos_bos_ab.py`, which reuses
  `vix1_replay_year.py`).
- The chaotic-move check was stood aside so every trade it blocks still happened, then the REAL check was asked
  which ones it would have blocked. Only trend-route (break-of-structure) trades can be blocked —
  change-of-character trades are exempt (his option A).
- **Limits:** spread is a constant (GBP/USD 1.25, EUR/USD 1.2 pips); the news, session and correlation rules are not
  applied. Results are in R (1R = the amount risked on a trade).

## Findings — at HIS target, 2R (corrected 17 Nov: *"I target 2R not 4R, i only target 4R when the trade is willing to run"*)
The first run scored a 4R target because that is what the live code puts on the order (`vix1.py:53`). Re-run on the
SAME trades at 2R, with 4R beside it:

| | orders | filled | 2R: wins / losses | **2R total** | 4R total |
|---|---|---|---|---|---|
| GBP/USD — trades the check BLOCKS | 40 | 33 | 3 / 6 | **−1.00R** | −1.00R |
| EUR/USD — trades the check BLOCKS | 36 | 27 | 4 / 9 | **−4.00R** | −2.00R |
| **both — BLOCKED** | **76** | **60** | **7 / 15** | **−5.00R** | −3.00R |
| GBP/USD — trend trades it KEEPS | 98 | 73 | 21 / 17 | +13.00R | +8.00R |
| EUR/USD — trend trades it KEEPS | 89 | 73 | 10 / 19 | −4.00R | −3.00R |
| **both — KEPT trend trades** | **187** | **146** | **31 / 36** | **+9.00R** | +5.00R |

(Fills that were neither a win nor a loss ended at breakeven — the ladder moves the stop to the entry at 0.4R.)

1. **At 2R, blocking them SAVES 5R** over the two years — the blocked trades would have lost 5R.
2. **They lose more often:** blocked 7 won / 15 lost (32%); kept trend trades 31 won / 36 lost (46%).
3. **Small but consistent:** both pairs lose on the blocked trades, at both targets.

## Recommendation
**Keep the check on break-of-structure trades.** It removes trades that lose more often than the ones it keeps, and
over these two years they would have cost 5R at his 2R target. Exempting break-of-structure trades would not have paid.

## Still unknown
- Range-band breakouts were not separated from other break-of-structure trades.
- With the news and session rules applied, some of these trades would not have been taken at all; the effect of
  that on this comparison is not measured.
- GBP/JPY and gold were not tested (no one-minute history long enough here).
