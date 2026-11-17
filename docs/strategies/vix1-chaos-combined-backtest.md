# VIX.1 — Would the trades the combined chaotic-move check holds back have lost money? (17 Nov 2026)

**A BACKTEST, run at his request:** *"can you backtest this and find out if they would lose money if traded:
together the two tests hold back 63% of trending momentum candles"*. That request was the approval.

## What was tested and how
- GBP/USD and EUR/USD, 1 Jun 2024 → 17 Jul 2026 (the span with one-minute candles).
- The strategy's REAL code: `detect_bias` (the trade decision) with the chaotic-move check stood aside so every
  trade it holds back still happens; then the REAL check (`vix1_chaos.refusal`, both halves, as deployed 17 Nov) is
  asked about each one and which half held it back; `m1_signals` (the 1-minute entry, his 0.552 stop); his 2R
  target (4R beside it); the REAL protection ladder (stop to entry at 0.4R, +1R locked at 1.5R).
- Each trade walked minute by minute for up to 6 hours: if one minute could have hit both stop and target, the
  stop counts; a stop touched before the entry = cancelled, not a loss; a trade still open after 6 hours is closed
  at the last minute's price (a SELL pays the spread).
- Kit: `trading_app_data/tools/vix1_chaos_bos_ab.py` split into three groups (scratch copy), walker in
  `vix1_replay_year.py`. Results in R (1R = the amount risked).

## Why it can be trusted
- **A kit fault was found and fixed before these numbers:** the first run scored a trade still open after 6 hours
  as 0R (breakeven) — the hand check caught GBP/USD 7 Jan 2026, sitting near −0.95R at the time. 22 trades ended
  that way. The first run's numbers were withdrawn. The walker now closes such a trade where price stood; proven on
  hand-built candles (still open at −0.95R, +0.06R, a SELL paying the spread, target, stop, breakeven, +1R lock), and
  putting the old 0 back fails the check.
- 10 trades checked by hand against the minute candles (5 before the fix, 5 after, including two still-open ones
  and one trade the check lets through): every result matches.

## Findings — at his 2R target
| group | filled | wins / losses | **2R total** | 4R total |
|---|---|---|---|---|
| GBP/USD — held back ONLY by the new who-is-in-control half | 26 ⚠ | 10 / 4 | **+9.90R** | +11.51R |
| GBP/USD — held back by the 7.75% half | 45 | 11 / 12 | **+5.03R** | +9.23R |
| EUR/USD — held back ONLY by the new half | 24 ⚠ | 4 / 5 | **+1.00R** | +2.00R |
| EUR/USD — held back by the 7.75% half | 41 | 9 / 13 | **−0.78R** | +0.22R |
| **both pairs — ALL HELD BACK** | **136** | **34 / 34** | **+15.15R** | +22.96R |
| GBP/USD — trend trades it LETS THROUGH | 35 | 11 / 11 | +1.42R | −0.58R |
| EUR/USD — trend trades it LETS THROUGH | 35 | 2 / 14 | −9.34R | −8.34R |
| **both pairs — LET THROUGH** | **70** | **13 / 25** | **−7.92R** | −8.92R |

⚠ = under 30 trades: no conclusion is drawn from that row alone. Fills that are neither a win nor a loss ended at
breakeven. Change-of-character trades are not touched by the check (exempt) and are not in this table.

1. **No — held back, they would NOT have lost money. They would have made +15.15R over the two years.** Holding them
   back cost that.
2. **The trades the check lets through did worse: −7.92R.** In this backtest it keeps the weaker trades, not the
   stronger ones.
3. **Most of it is GBP/USD** (+14.93R held back). On EUR/USD the held-back trades are roughly flat (+0.22R) while the
   let-through ones lose (−9.34R).
4. This reverses the earlier backtest (`vix1-chaos-bos-backtest.md`, blocked trades −5R). That one measured the OLD
   two-test check and scored still-open trades as 0R, so its numbers are not comparable.

## Recommendation
On this evidence the chaotic-move check, as deployed, is costing money: it holds back trades that earned +15R and
keeps trades that lost −7.9R. **Recommend he decides between switching it back to report-only on the DM (it still
tells him on every momentum candle) or keeping it while it is checked on more data.** It is his rule and his money,
so nothing has been changed.

## Still unknown
- The news, session and one-trade-at-a-time rules were not applied; some of these trades would not have been taken.
- The spread is a constant (GBP/USD 1.25, EUR/USD 1.2 pips) and a SELL's stop is checked on the bid, not the ask,
  which flatters SELLs slightly — in every group alike.
- GBP/JPY and gold were not tested (no one-minute history long enough here). Two years, two pairs.
