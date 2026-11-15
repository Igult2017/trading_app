# VIX.1 — Quiet and thin markets: final test report (15 Nov 2026)

## The short answer

| idea | does it work? | over the last 6.7 years, on GBP/USD + EUR/USD + GBP/JPY |
|---|---|---|
| **Thin-market rule** (3 in 4 thin candles since the pullback → wait for a 3-candle move) | **No, not as a rule for all pairs** | Every version would have **lost money overall** (between −5R and −18R). It helped EUR/USD and hurt GBP/USD and GBP/JPY. |
| **Candle-3 rule after a quiet market** (added as an extra way in) | **Harmless, too rare to prove** | Only 4 to 19 extra trades in 6.7 years; small gain (+1R to +5R). |
| **Make "quiet" start sooner** (24 hours → 12 hours) | **No, clearly harmful** | Would have thrown away 513 trades that made **+50R**: about **−53R**. |
| Make "quiet" start at 18 hours | No real difference | +5R overall, which is within luck. |

**1R** = the amount risked on one trade (1% of the account). So −53R means losing about 53 trades' worth of
risk over 6.7 years.

**Recommendation:**
- **Do not build the thin-market rule** in its current form. It does stop the trades you circled, but over
  7 years the trades it stops were, on balance, slightly profitable, not losers.
- **Keep the quiet line at 24 hours.**
- **The candle-3 rule can be added at 24 hours if you want it.** It only adds trades and never removes
  one, and the 4 it added made +5R. But 4 trades in 6.7 years proves nothing either way.

## How the tests were done (in plain words)

- **The real VIX.1 program was used, not a copy.** For each idea it ran over 6.7 years of hourly price
  data, once as it is today and once with the idea switched on. Only the one rule being tested was
  different. Every other check VIX.1 makes stayed exactly as it is live.
- **The trades that differ were followed to the end, the way VIX.1 really trades them:** waiting for
  its entry on the 1-minute chart, the same stop, the same move to breakeven, the same 4R target. Trades
  that both versions take are identical in both, so they cancel out and only the differences decide the
  answer.
- **Checks before trusting any number — all passed:**
  - the downloaded price data is clean;
  - your 11 Nov GBP/USD candle gives the same answer it gave live;
  - the shortcut used for speed changes no answer;
  - with the idea switched off, the test gives exactly today's signals on all three pairs.
- **Three of my own mistakes were caught and fixed** before these results:
  - an older test cut every trade off after 6 hours;
  - weekends were read as "the data ended";
  - an earlier quick study used the wrong definition of a failed trade.
- **Limits:** the GBP/JPY spread was never measured, so it was left out. It affects both versions the
  same way.

## Test 2 — The thin-market rule, in detail

**Your rule:** in a trending market, from the start of the pullback, if 3 in 4 or more candles are thin,
do not trade until a 3-candle move, and trade when its 3rd candle closes as a momentum candle.

**What counts as "thin" decided whether the rule could work at all.** Your circled candles (GBP/USD
11-13 Nov) are normal-sized compared with an ordinary hour. They are only thin **compared with the big
trend candles before the pullback.** So two versions were tested:
- **trend-based:** thin = smaller than 1/3, or 1/2, of the trend's big candles;
- **momentum calculation:** thin = under 0.59 of what a momentum candle needs, the line 3 in 4 of your
  circled candles fall under.

Every version stops the two trades on your screenshot (11 Nov 16:00 and 12 Nov 17:00).

**What it would have done over 6.7 years (trades it stops, and how those trades actually ended):**

| version | trades stopped | of those: won / lost / breakeven | effect of stopping them |
|---|---|---|---|
| trend-based, 1/3, at least 4 candles | 191 | 37 / 53 / 101 | **−5R** |
| trend-based, 1/2, at least 4 candles | 351 | 66 / 88 / 197 | **−8R** |
| trend-based, 1/3, at least 8 candles | 136 | 27 / 31 / 78 | **−11R** |
| trend-based, 1/2, at least 8 candles | 266 | 45 / 62 / 159 | **−7R** |
| momentum calculation, at least 4 | 248 | 46 / 62 / 140 | **−14R** |
| momentum calculation, at least 8 | 189 | 33 / 39 / 117 | **−18R** |

**By pair, best version (trend-based 1/3, at least 4 candles):**

| pair | trades stopped | won / lost / breakeven | effect |
|---|---|---|---|
| EUR/USD | 68 | 9 / 27 / 32 | **+15R (helps)** |
| GBP/USD | 69 | 14 / 14 / 41 | −6R (hurts) |
| GBP/JPY | 54 | 14 / 12 / 28 | −14R (hurts) |

**Why it does not work overall:** after a thin stretch, the next momentum candle is not usually a loser.
More of the stopped trades lost than won, but the ones that won won bigger: a winner can reach 4R, and a
loser is capped at 1R. So stopping them all gives up more than it saves. On EUR/USD the losers clearly
outnumbered the winners (27 to 9), so there it helps.

**About using it on EUR/USD only:** it would have made +15R there. But choosing the one pair where it
happened to work, after seeing the results, is how a rule that only looks good in the past gets built. I
would not do it without testing on data the rule has not already seen.

## Test 1 — After a quiet market, trade candle 3 if it is a momentum candle

**Your rule:** candle 1 is the momentum candle that wakes a quiet market. Candles 2 and 3 keep going the
same way. If candle 3 closes as a momentum candle, trade it.

| change | trades added | trades removed | effect |
|---|---|---|---|
| add candle-3 rule, quiet = 24 h (today's line) | 4 (2 won, 2 breakeven) | 0 | **+5R** |
| add candle-3 rule, quiet = 18 h | 11 | 0 | +3R |
| add candle-3 rule, quiet = 12 h | 19 | 0 | +1R |
| move the quiet line 24 h → 18 h (nothing else) | 9 | 199 | +5R |
| move the quiet line 24 h → 12 h (nothing else) | 13 | 513 | **−53R** |

**Why moving the line to 12 hours is so harmful:** today's quiet rule then calls far more markets quiet
and makes them "run 3 candles then pull back" before trading. That blocks 513 trades, and they were
profitable.

## What happens next — his decision
- Thin-market rule: **not recommended**. A different idea is needed to catch the case on his screenshot
  without stopping good trades elsewhere.
- Candle-3 rule at 24 hours: **optional**. It does no harm in the test, but it is barely ever used.
- Quiet line: **keep 24 hours**.

Full per-pair numbers: `trading_app_data/quiet_ab/final_numbers.txt`. Tools: `trading_app_data/tools/`
(`vix1_quiet_ab.py`, `vix1_quiet_ab_report.py`, `vix1_thin_measure.py`, `fetch_7y.py`).
