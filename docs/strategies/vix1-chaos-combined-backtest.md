# VIX.1 — Would the trades the combined chaotic-move check holds back have lost money? (17 Nov 2026)

**A BACKTEST, run at his request:** *"can you backtest this and find out if they would lose money if traded"*.
Then his challenge: *"The ones it let through, did they lose flat or broke even. And the ones that were blocked but
won, are you sure they won because i doubt. I told you to focus on the reliability and accuracy of your test kit."*

> ⚠ **The first version of this report (+15.15R held back / −7.92R let through) is WITHDRAWN.** Its kit did not
> trade the way the live system does — see "What the old kit got wrong". Everything below is from the rebuilt kit.

## What the old kit got wrong (each checked against the live code)
1. It stopped watching a trade after 6 hours — the live system has no time limit.
2. A SELL's stop and target were judged on the bid; a SELL really closes by buying at the ask (bid + spread). This
   made SELL wins too easy and SELL stops too late.
3. A BUY filled one spread late (the broker fills a BUY stop on the ask).
4. The target was a fixed 2R; live it moves to 4R when a new momentum candle closes the trade's way.
5. A waiting order lived 6 hours; live it lives 24 hours and is withdrawn if the 1-hour trend flips.
6. It looked for the entry from the momentum candle's close even when the trade decision came on a LATER candle —
   it could see the future.
7. Breakeven was the entry price; live it is the entry plus the round-trip commission ($3 a side per lot, read off
   his real fill), and the commission was never charged. The trailing stop above 2.2R was missing.

## The rebuilt kit — `trading_app_data/tools/vix1_live_replay.py`
Every decision is the live code; the kit only supplies the clock and the prices: `detect_bias` at each 1-hour
close on closed candles; the entry through `m1_signals` only after the decision exists; the waiting order through
`vix1_watch.check_invalidation`; the stop ladder through `position_tracker._lines` + `breakeven.why_not` (the live
stop-moving code); the 4R move through `tp_extend.momentum_after_fill`. Inside one minute the stop is taken first;
nothing is credited from the minute the order filled. Results are after commission, in R (1R = the amount risked).

## Why it can be trusted
- **Proven on hand-built candles first** (`test_vix1_live_replay.py`, 20 checks, all pass): a SELL touching its
  target on the bid but not the ask is NOT a win; a SELL stopped only through the spread IS a loss; a BUY fills on the
  ask; the fill minute credits nothing; fill and stop in one minute = loss; breakeven nets 0R after costs; +1R lock;
  trend-flip withdrawal on closed candles only; 24-hour expiry; stop touched before entry = cancelled; the 4R move;
  no look-ahead. Each piece has a TEETH check — broken on purpose, its case changes.
- **Data checked first:** GBP/USD and EUR/USD 1-minute candles 22 May 2024 → 17 Jul 2026, 800,000 each: no
  duplicates, none out of order, no >10% jumps, no broken candles; the only gaps are the Christmas / New Year closes.
- **5 random trades checked by hand** against the minute candles (including EUR/USD trades it let through): all match.
- **EVERY held-back trade that made money (30) re-checked by separate code** from the raw candles — the starting stop
  never touched on the price that fires it, the exit price really reached, the fill real: **30 of 30 OK.** Each is
  charted in `VIX1 held-back winners - every one checked.pdf` (his Desktop).

## Findings — 1 Jun 2024 → 17 Jul 2026, GBP/USD + EUR/USD
| group | filled | full loss | breakeven | +1R lock | trailed | 2R | **total** |
|---|---|---|---|---|---|---|---|
| **LET THROUGH** (traded today) | 73 | **30** | **35** | 4 | 1 | 3 | **−19.55R** |
| held back by the 7.75% half | 91 | 27 | 46 | 8 | 6 | 4 | +1.10R |
| held back ONLY by the new half | 51 | 11 | 28 | 8 | 0 | 4 | +3.96R |
| **ALL HELD BACK** | **142** | **38** | **74** | **16** | **6** | **8** | **+5.06R** |
| change of character (exempt, not judged) | 70 | 29 | 30 | 4 | 3 | 4 | −12.40R |

By pair: GBP/USD let through −1.77R, held back +12.66R; EUR/USD let through −17.78R (17 full losses, 20 breakevens,
**no win at all**), held back −7.61R. Per pair the new-half groups are under 30 trades (26, 25) — not judged alone.
No trade reached 4R (33 were moved to it). 60 orders were withdrawn before filling.

1. **The trades it lets through mostly LOSE, not break even:** 30 full losses, 35 breakevens, 8 small wins — −19.55R.
2. **The held-back winners are real** — all 30 checked. But they sit among 38 full losses; the held-back trades as a
   whole come to **+5.06R**, not the +15R first reported.
3. So the check does not save money here: what it holds back made +5.06R; what it keeps lost −19.55R.
4. Inconsistent between pairs: on GBP/USD what it holds back did better (+12.66R vs −1.77R); on EUR/USD both lose.

## Recommendation
On this evidence the chaotic-move check does not pick the losers: the trades it lets through are the worse group.
**Recommend switching it to report-only on the DM** (it keeps telling him on every momentum candle) — his decision.
The larger finding is that VIX.1 lost on both pairs over these two years in this replay whatever the check does
(all trades −26.89R; with the check as live −31.95R); that, not the check, is where the money goes.

## Still unknown
- The news rules, sessions, the 7pm cut-off and one-trade-at-a-time across pairs are not applied.
- The spread is a constant (GBP/USD 1.25, EUR/USD 1.2 pips), not the spread at the time.
- GBP/JPY and gold not tested (no long one-minute history here).
