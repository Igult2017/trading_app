# VIX.1 — Liquidity voids and news: final test report (15 Nov 2026)

> **UPDATED THE SAME DAY: read "Part 2 — his rule" at the end first.** It tests the rule he actually
> asked for, and a control (no void rule at all) that changes the recommendation below.

## The short answer

| version | what counts as a void | 5.2 years, GBP/USD + EUR/USD + GBP/JPY |
|---|---|---|
| **Today** | fast candles more than 5× normal, leaving a band at least one normal hour tall | (the baseline) |
| **B — out of a quiet market** | the same, **and** no momentum candle in the 24 h before it | **+27R** better than today |
| **BN — quiet market and news** | B, **and** a high-impact release in that hour or the hour before | **+25R** better than today |

**1R** = the amount risked on one trade (1% of the account).

**Recommendation:**
- **Adopt B:** count a void only when it comes out of a quiet market. It made +27R more than today's
  rule. That is about twice the amount luck alone usually moves the total, and on 2 of 3 pairs it
  helped (EUR/USD +12R, GBP/JPY +20R). It also stops your 10 Nov volume candles from counting as
  voids, which is what you said was wrong.
- **Do not add the news condition.** It changes almost nothing (0 to 3 trades per pair) and does
  slightly worse (+25R). The quiet-market condition already picks the same voids.
- **This is a change to the strategy, so it is your decision, under its own plan.** Nothing has been
  changed yet.

**Two cautions:**
1. **On GBP/USD it was worse (−5R).** The gain comes from EUR/USD and GBP/JPY.
2. **GBP/JPY was scored with no spread** (the gap between buy and sell price), because it has never
   been measured, so its +20R is a little flattering. I have not measured how much. As a rough guide:
   if the spread cost a tenth of the risk on each of its ~42 filled extra trades, that is about −4R.

## What the test found

### 1. A "quiet" or "news" void does not fill any differently

All three pairs, 1,213 voids under today's rule. "Filled" = price went all the way back through the
band within 240 trading hours.

| kind of void | count | half-filled | fully filled | middle time to fill | middle size |
|---|---|---|---|---|---|
| all (today's rule) | 1,213 | 87% | 81% | 22 h | 18.2 pips |
| out of a quiet market (B) | 98 | 90% | 84% | 26 h | 19.5 pips |
| not out of a quiet market | 1,115 | 87% | 81% | 22 h | 18.2 pips |
| with news | 391 | 85% | 78% | 24 h | 26.1 pips |
| without news | 822 | 88% | 82% | 22 h | 15.7 pips |
| quiet market and news (BN) | 41 | 88% | 80% | 26 h | 32.8 pips |

**In plain words:**
- Price goes back into almost every big fast move, about 4 times in 5, whatever kind it is.
- So "quiet" and "news" do not find voids that fill more. What B changes is **how many moves are
  treated as voids at all.** Today 1,213 count; under B only 98 (8%) do.

### 2. Today's rule blocks trades that, on balance, made money

The real VIX.1 was run three times, changing only the void check. Every trade that differs was
followed on 1-minute prices with VIX.1's own entry, stop, move to breakeven and 4R target.

| pair | trades B adds | how they ended (won / lost / breakeven / never filled) | trades B removes | how they ended | **B vs today** |
|---|---|---|---|---|---|
| GBP/USD | 67 | 6 / 12 / 27 / 22 → −6R | 15 | 1 / 2 / 3 / 9 → −1R | **−5R** |
| EUR/USD | 80 | 12 / 14 / 23 / 31 → +4R | 24 | 1 / 9 / 5 / 8 → −8R | **+12R** |
| GBP/JPY | 70 | 15 / 11 / 16 / 28 → +19R | 19 | 1 / 2 / 9 / 7 → −1R | **+20R** |
| **all** | **217** | | **58** | | **+27R** |

**Why B gains:**
- **It lets through trades that today's rule blocks.** Those trades lost a little more often than
  they won, but the winners reached 4R while a loss is capped at 1R.
- **It removes some trades, and those were mostly losers** (12 lost, 3 won).

**Why B removes trades at all.** The void rule is read in a second place: your range check stands
aside while a void is filling. Your words: *"this idea does not apply when liquidity void is
filling"* (`vix1_chop.py:129-132`).
- Today, many ordinary moves count as voids, so the range check stays silent on them and the trade
  goes ahead.
- Under B those moves are not voids, so the range check speaks and refuses.
- The test includes this automatically, because the range check calls the same void check that was
  swapped.

**Is +27R luck?**
- Luck alone typically moves a total like this by about ±14R; +27R is twice that.
- Redrawing these same 275 trades at random 20,000 times, the total came out at zero or below in only
  **2%** of draws.
- The gain leans on 7 trades that reached the full 4R target.

## The news data, and how its problems were fixed

- **Source:** the free ForexFactory calendar copy on Hugging Face (your choice). It had two faults:
  1. **From 2023, summer times are exactly 1 hour early.** For example, the US rate decision of
     12 Jun 2024 is listed at 17:00 UTC, but it came out at 18:00. Up to 2022 every time checked is
     right. Fixed by adding 1 hour to those rows.
  2. **About half the important releases have no time at all**: 47% in 2021-2025. They include the US
     jobs report, US inflation and the Bank of England rate. They were filled in, in this order of trust:
     - the time of their partner release that day (ForexFactory prints a time once for a group that
       comes out together);
     - otherwise the published fixed time: US data 08:30 New York, the US rate decision 14:00 New York,
       the Bank of England 12:00 London, the European rate decision 13:45, then 14:15 Frankfurt from
       21 Jul 2022;
     - otherwise the time the same release had on its other dates that year.
- **Checks:**
  - the filled-in times agree with the times the file does record for those releases **944 of 944**;
  - 20 releases whose real time I know were checked one by one. All are right, including the March
    2020 emergency rate cuts.
  - 180 of 2,549 releases (mostly speeches, which have no fixed time) were left out.

## Why the numbers can be trusted

- **The real VIX.1 code was used**, with only the void check swapped (`find_void`, the one call at
  `vix1_void.py:177`).
- **With the swap switched off, the result equals today's trades exactly, on all three pairs.**
- **Your 10 Nov GBP/USD volume candles (16:00-18:00 your clock)** are voids under today's rule. They
  are not voids under B.
- **The 1-minute scoring is the harness already proven in the quiet/thin test** (real entry, real
  breakeven ladder, weekends handled).
- **All 275 differing trades were scored; none is missing.**
- **Same data as before:** the same checked 7-year price data.
- **Limits:**
  - the test window is 1 Feb 2020 to 7 Apr 2025, because the news data ends there;
  - GBP/JPY has no spread (see above).

## A fault found along the way

- **The GBP/JPY void size is printed 10 times too small** in VIX.1's refusal message.
  - `vix1_void.py:153` uses 0.1 as a pip for any price over 100, but a GBP/JPY pip is 0.01.
  - The size only reaches the message (`vix1_void.py:286-295`), never a decision.
- Logged as `docs/OPEN.md` B35, to be fixed with the next change to this file.

## Files
- Tools in `trading_app_data/tools/`: `news_table.py` (clean news table) and `vix1_void_news_ab.py`
  (the test).
- Results in `trading_app_data/void_news/`: `voids_*.json`, `signals_*.json`, `scores_*.json` and
  `summarise.py`.


## Part 2 — his rule, and a control (added 15 Nov 2026, later the same day)

**Why there is a Part 2.** He pointed out that the quiet-market version above drifted from what he
asked. In his words:
- *"News release leads to less trading activities which causes a liquidity void"*;
- *"some candles are obviously liquidity voids because they are too long to be normal"*.

His size line: *"twice the size of a momentum candle that we would pick at that time, meaning anything
less than twice the momentum candle is a normal momentum candle."*

**His rule as tested.** A candle is a void when either:
- **(a)** its body is at least **2× the average of the last 5 real momentum candles** before it; or
- **(b)** it is more than 5× a normal candle **and** a high-impact release falls in it or the hour
  before.

Everything else about a void (the band, the wait for the fill, then 2 momentum candles) is unchanged.
VIX.1's existing news rules also stay: no trading the news candle itself (`vix1.py:339`), and no entries
from 15 minutes before to 30 minutes after a release (`vix1.py:342`). He chose to keep the 30.

**It reads his charts correctly:**

| candle | his rule | today's rule |
|---|---|---|
| 14 Oct 2026 15:00 (his image 1), 62 pips, 4.4× the recent momentum candles | **void** | void |
| 10 Nov 2026 16:00 / 17:00 / 18:00 (his image 2), 1.3× / 0.8× / 1.8× | **normal, traded** | void (wrong) |

**The money result.** Same test as above: real VIX.1, 1 Feb 2020 to 7 Apr 2025, each differing trade
followed on 1-minute prices.

| version | vs today | GBP/USD | EUR/USD | GBP/JPY | chance it is luck* |
|---|---|---|---|---|---|
| **no void rule at all** (control) | **+25R** | −5R | +11R | +19R | 3% |
| void only after a quiet market | +27R | −5R | +12R | +20R | 2% |
| **his rule, with news (a + b)** | **+18R** | −5R | +4R | +19R | 4% |
| his rule, size only (a) | +14R | −5R | +1R | +18R | 12% |

\*How often the total came out at zero or worse when the same trades were redrawn at random 10,000 times.

**What the control shows: the void WAIT itself is what costs money, not the definition.**
- Switching the void rule off entirely does about as well as the best version (+25R vs +27R).
- So every version gains simply by blocking fewer trades. The trades taken while price is still
  filling a void have, over 5 years, made more than they lost.
- **This agrees with Part 1:** voids do fill about 4 times in 5, but a trade taken before the fill
  is often already at breakeven, or has hit 4R, before the fill arrives.

**Research (15 Nov 2026), which supports his point 1:**
- The UK regulator's study of GBP/USD order books found that fast traders pull their orders before
  scheduled news (FCA Occasional Paper 63).
- A study of the main interbank currency platform found that liquidity dries up at the release and
  recovers within minutes (Yamada & Ito, NBER w27036).
- **So the dangerous window is minutes, not hours.** That is exactly what VIX.1's existing
  15-minutes-before / 30-minutes-after rule covers.
- No published source gives a size rule or a fill rate for voids. Published fill-rate claims are
  unsourced, so our measured 81% is the best evidence we have.

**Recommendation (replaces the one in Part 1):**
- **Use his rule, with news (a + b): +18R vs today.** It is the only version that matches both his
  charts and keeps a wait on the truly violent news candle.
- The test cannot fully price that candle: on a real 14 Oct-style move, orders fill late and spreads
  are wide, and the 1-minute test does not see that.
- The extra +7R that "no void rule" shows over his rule is inside what luck can produce, so it is not
  a reason to drop the protection.
- **Keep the news window as it is** (15 minutes before, 30 after). The research says that is where
  the market is really empty.
- **The same cautions apply:** GBP/USD is −5R in every version, because the same GBP/USD trades are
  involved; and GBP/JPY is scored with no spread.

## BUILT (15 Nov 2026)

- **His rule with news is now live code** (`vix1_void._big_enough`). The news is passed to every place
  the void rule is asked.
- **Proof the build equals the test:** the built `detect_bias`, given the repaired 2020-2025 calendar,
  produces exactly the tested trades.

  | pair | trades | identical to the test |
  |---|---|---|
  | GBP/USD | 633 | yes |
  | EUR/USD | 617 | yes |
  | GBP/JPY | 627 | yes |

- **A one-week calendar made 3 trades differ** in holiday weeks. There, the calendar started after
  the void candle, so the built code took the stricter "news unknown" side. That is the intended
  behaviour.
- **Also built: news can no longer be silently missed.**
  - A failed news feed used to read as "no news" and let trades through.
  - Now VIX.1 refuses new entries while the calendar is unknown: none for 6 hours, or one that ends
    before now.
- **Tests:** `tests/vix1/test_void_his_rule.py` and `test_news_unknown_refuses.py`. The whole VIX.1
  suite passes.
