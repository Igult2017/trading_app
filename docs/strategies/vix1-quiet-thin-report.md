# VIX.1 — Quiet and thin markets: test reports and recommendations

**Status, 15 Nov 2026: INTERIM.** Every test of the setups themselves (which candles VIX.1 would trade) is
complete and checked. The money result (each changed trade scored on real 1-minute data) is still
running. Recommendations below are marked **interim** until it finishes. This file is updated with the
final numbers when it does.

## How the tests were run, and why they can be trusted
- **The real strategy, not a copy.** Each version runs VIX.1's own decision function over the same
  history, with only the quiet-market rule swapped. Every other check is the real one: market state,
  pullback, candle count, liquidity void, margin, memory, stomach rule.
- **Same inputs as production:** 3,000 one-hour bars and 120 four-hour bars per decision.
- **Data:** about 7 years of the broker's own bars for GBP/USD, EUR/USD and GBP/JPY (Sep 2019 to
  Nov 2026; tested from Feb 2020).
- **Checks that had to pass before any number was used — all passed:**

| check | result |
|---|---|
| data clean (no corrupt bars, matches earlier saved files) | GBP/USD 1 differing bar of 42,894 (a bar saved while still forming); EUR/USD and GBP/JPY 0 |
| his 11 Nov GBP/USD candle | today's code trades it, as it did live; every 12 h and 18 h version refuses it |
| the speed shortcut | 27 of 27 signals identical over 2 months |
| "his rule switched off" equals today's code | identical on all three pairs (803, 768, 710 signals) |

- **Trade scoring:** the real 1-minute entry, the real stop (0.552 x body), the live breakeven ladder
  and the 4R target, walked minute by minute.
- **Two flaws were found in my own scoring and fixed** (they would have misled):
  - an older harness cut every trade off after 6 hours and scored it as zero;
  - weekends were read as "data ended" for trades still open on Friday.
- **Not reproduced:** spread on GBP/JPY (never measured; set to none, so it affects both versions
  equally).

---

## Test 1 — After a quiet market, trade candle 3 if it is a momentum candle

**His rule:** candle 1 = the momentum candle that wakes a quiet market. Candles 2 and 3 keep going the
same way with no pullback. If candle 3 closes as a momentum candle, trade it.

**Separate setups VIX.1 would trade, Feb 2020 to Nov 2026:**

| version | GBP/USD | EUR/USD | GBP/JPY |
|---|---|---|---|
| today (quiet = 24 h) | 766 | 740 | 683 |
| quiet line moved to 12 h, nothing else | 452 | 477 | 446 |
| quiet line moved to 18 h, nothing else | 654 | 635 | 597 |
| his rule added at 12 h | 466 | 483 | 458 |
| his rule REPLACING today's proof at 12 h | 438 | 448 | 421 |
| times his candle-3 route fired at 12 h | **14** | **6** | **12** |

**Findings:**
1. **His candle-3 situation is rare: 32 times in 6.7 years across the three pairs** at a 12 h line, and
   5 times at 24 h. It cannot change results much either way.
2. **The quiet LINE matters far more than the rule.** Moving it from 24 h to 12 h removes 36-41% of ALL
   setups, because today's "3 candles then a pullback" proof then applies to many more markets.
3. **Early scoring: the trades that the 12 h line throws away were making money.** First 40 real trades
   of GBP/USD's 322 removed setups: 7 wins, 3 losses, the rest closed at breakeven, **+7.0R net**. That is
   about 1 in 8 of them, so it is not final.

**Recommendation (interim):**
- **Do not lower the quiet line to 12 h** on the evidence so far. It removes about 40% of trades, and
  the first ones scored were profitable.
- **His candle-3 rule is safe to consider only as an EXTRA way in** (it adds 6-14 trades per pair in 6.7
  years and removes none).
- The final call waits for its 32 trades to be scored, which will also say whether those trades are
  worth having.

---

## Test 2 — Thin market after a pullback (his rule of 15 Nov)

**His rule:** in a trending market, count the candles since the pullback started. If 3 in 4 or more are
thin, do not trade until a move of 3 candles, and trade when the 3rd closes as a volume candle.

**Finding 1 — what "thin" means decides whether the rule works at all.** His three circled stretches
(GBP/USD 11-13 Nov, 60 candles), measured three ways:

| "thin" measured against | his circled candles | what it does on his screenshot |
|---|---|---|
| normal market size (the 100-bar normal body) | 0.5-1.6x: normal-sized | **fails**: trades 11 Nov 16:00 and 12 Nov 17:00 |
| the momentum calculation (body / what a momentum candle needs) | middle 0.34 (3 in 4 under 0.59) | refuses both |
| the trend's own momentum candles before the pullback (29.7 / 29.1 / 39.7 pips) | 0.01-0.37x | refuses both |

**Finding 2 — by the momentum calculation alone, thin looks like an ordinary hour.** The middle candle of
ALL hours 2020-2026 is 0.39 of what a momentum candle needs, nearly the same as his thin candles (0.34).
**65% of all GBP/USD candles fall under the 0.59 line.** So that version may also block trades in normal
trending markets. The 7-year run will show how many, and whether they were losers.

**Finding 3 — what makes his stretches thin is the CONTRAST with the trend's volume before them.**
Measured against the trend's own momentum candles, every one of his circled candles is under 0.37 of
them.

**Open decision for him (A or B):** a refused momentum candle inside a thin market currently restarts the
count (that let 12 Nov 20:00 through).
- **A:** only a full 3-candle move restarts it.
- **B:** any momentum candle does.

**Recommendation (interim):**
- If this rule is built, define thin **against the trend's own momentum candles (under 1/3 of their
  size)**. It matches what he sees on the chart, and it does not label most ordinary candles thin the
  way the 0.59 line does.
- **Decide A/B first.**
- Then the final call waits for the 7-year scored result: the trades it removes must turn out to be
  losers, or the rule costs money.

---

## What is still running
- **Trade scoring** of every setup that differs between versions: 394 for GBP/USD (98 done), then
  EUR/USD and GBP/JPY.
- **The thin-rule versions** on all three pairs.

Tools are outside the repo in `trading_app_data/tools/` (`vix1_quiet_ab.py`, `vix1_thin_measure.py`,
`fetch_7y.py`), with results in `trading_app_data/quiet_ab/`.
