# VIX.1 — the running investigation record

**Started 2026-09-13, at his instruction:** *"lets go step by step. First i will start by asking you
questions on rules i didnt understand. Then i will provide you with one setup each time and then you
tell me what rejected it. In everything we do now, please keep a very clear record so that you dont
get mixed up."*

**THE MISSION:** find where the problem is. His position, which is the starting assumption and is
not to be argued with: *"it is clear you introduced some rules in the last overhaul you did."*

**THE RULE OF THIS DOCUMENT:** one setup at a time, one question at a time. Every answer names the
file and line that did the rejecting. Nothing is fixed until he says so.

---

## How he sends a screenshot

Two ways, both verified working on 2026-09-13:

1. **Drop the file in `C:\Users\FSD\trading_app_data\vix-setups\`** and tell me the file name.
   That folder exists and is outside the git repo, so nothing ever deletes it. This is the reliable
   way — I read the file straight off disk and see the picture.
2. **Paste it into the chat** (Ctrl+V) or drag it in. This also works.

**What I need with each one**, because a picture alone cannot tell me which bar in the data it is:

- the **pair** (EUR/USD, GBP/USD, XAU/USD)
- the **date**, and the **time on the candle** he means
- **his chart's clock** — his charts have been UTC+3 before. If the times on the screenshot are
  UTC+3, say so once and I will convert; the broker data and every table I produce are UTC.

---

## What is already established — evidence, not opinion

Measured 2026-09-13 on real cTrader bars (the same feed production runs on — not yfinance), replayed
through the actual production functions, not a copy of them.

| Finding | Evidence |
|---|---|
| The recorded data can be trusted | 103 bars where production recorded a verdict and it could be re-run: **103 agree, 0 disagree** |
| The size test (2.5x the 100-bar median) did **not** reject his big candles | **13 of 13** candles that look big on the chart **passed** the momentum test |
| The 08-Sep "newest bar" change did not cost signals **in that window** | Old rule replayed on the same bars finds the **same 2** tradeable candles |
| Almost everything was stopped by direction/structure, not size | 9 of 13 refused by a trend or structure rule, 2 by the pullback rule, 2 traded |

Scope note: that window is **10-11 Sep only**. It does not prove anything about other dates, and it
is not a defence of any rule — it only says which gate did the rejecting.

---

## The suspect list — what actually changed in the last overhaul

Straight from git, on the strategy files. These are the rules that could have started refusing
things they did not refuse before. **Not one of these is confirmed as the problem yet.**

| Date | Commit | What it introduced or moved | Where it is enforced |
|---|---|---|---|
| 08 Sep | `736f3be` | The trend must be **in shape** — last two highs and last two lows must both step the trend's way. ⚠ **CORRECTED 2026-09-13: this rule is NOT new.** It existed before as a separate veto (`vix1_regime.market_permits`) which refused a trend the trend-module accepted **37.2%** of the time. What changed is that it moved in and now uses the trend's OWN direction instead of working out its own. **Whether the new one refuses MORE or LESS than the old one has NOT been measured** — that is the open question | `vix1_trend.py:155-185`, enforced at `vix1_bias.py:296` and `:380` |
| 08 Sep | `e96c8c7` | The heads-up now says "it qualified but we stood aside"; the quiet-market test's window changed | `vix1_preclose.py`, `vix1_tradeable.py` |
| 08 Sep | `69789b0` | The log now separates "none qualified" from "one qualified but was not the newest bar" | `vix1_momentum.py:312-326` |
| 08 Sep | `5812f34` | Reverted a half-finished trend cleanup | — |
| 31 Aug | `07eab5b` | **The momentum candle must be the bar that just closed.** Before this it scanned back up to 12 bars | `vix1_momentum.py:273-275` |
| 29 Aug | `5fecbc2` | The 8-bar pullback gate obeys a change of character | `vix1_structure.py` |
| 29 Aug | `1c4a05a` | The candle that turns the market **up** may now speak | `vix1_choch.py` |
| 25 Aug | `27e8eff` | **A turn DOWN must prove itself; a turn UP keeps its shortcut.** A turn down is refused the exemption and must run, pull back, then turn back down | `vix1_choch.py:128-131` |

### The gates a setup can die at, in the order they run

This is the checklist I work through for every setup he sends.

1. **Is it a momentum candle?** — body at least 2.5x the 100-bar median, AND at least 2.12x the
   2000-bar median, AND bigger than the candle before it, AND body at least 60% of its own range,
   AND the wick against the move no more than 25%. (`vix1_momentum.py:182-206`)
2. **Is it the bar that just closed?** — added 31 Aug. (`vix1_momentum.py:273`)
3. **Is there a trend, and which way?** (`vix1_bias.py:161-163`)
4. **If the trend is mid-turn** — the change-of-character route, which refuses a turn DOWN.
   (`vix1_choch.py:128`)
5. **Does the candle point the same way as the trend?** — VIX.1 is pro-trend only.
   (`vix1_bias.py:159`)
6. **Is the trend in shape?** — higher high + higher low, or lower high + lower low. Added 08 Sep.
   (`vix1_trend.py:155`)
7. **Has the trend pulled back yet?** (`vix1_retracement.py`)
8. **Does the faster 8-bar structure agree?** (`vix1_structure.py`)
9. Then the 1-minute entry, the reward-to-risk floor, and delivery.

---

## Log — his questions about rules

*(Nothing yet. Each question gets: his words, the answer, and the file:line it came from.)*

| # | His question | Answer | Where the rule lives |
|---|---|---|---|

---

## Log — the setups he sends

*(One row per setup. `Verdict` is which numbered gate above killed it.)*

| # | Screenshot | Pair | Candle (UTC) | Body vs needed | Gate that rejected it | Is that rule HIS, or introduced? |
|---|---|---|---|---|---|---|
| 1 | GBP/USD H1, 3 marks on the 10-11 Sep down move, chart UTC+3 | GBP/USD | see table below | see below | **Gate 1, the 100-bar size test — all nine** | The 2.5x multiplier is HIS, calibrated 2026-07-20 against 87 of his real GBP/USD trades. **Not introduced in the overhaul.** |

### Setup 1 — GBP/USD, 10-11 Sep, his three marked momentum candles

His words: *"It is a downtrend and the candles that i have marked are momentum candles that occured
after a pullback which confirmed trend direction. So we were to take trades in all those candles."*

Rather than guess three candles from pixels, **every** down-candle of 5+ pips in the move was run
through the real gates. **All nine died at the same gate — number 1, the size test.**

| UTC | His chart | Body | 100-bar test | 2000-bar test | Trend then | Died on |
|---|---|---|---|---|---|---|
| 10 Sep 10:00 | 13:00 | 9.9p | needs 11.0 ❌ | needs 9.5 ✅ | **UP** | 100-bar size |
| 10 Sep 11:00 | 14:00 | 9.8p | needs 11.0 ❌ | needs 9.5 ✅ | **UP** | 100-bar size + not bigger than previous |
| 10 Sep 12:00 | 15:00 | 17.6p | needs 11.0 ✅ | needs 9.5 ✅ | mid-turn | shape — body 44.8% of range, lower wick 50.9% |
| 10 Sep 16:00 | 19:00 | 6.9p | needs 11.0 ❌ | needs 9.5 ❌ | DOWN | 100-bar size |
| 10 Sep 18:00 | 21:00 | 7.5p | needs 11.0 ❌ | needs 9.5 ❌ | DOWN | 100-bar size |
| 11 Sep 01:00 | 04:00 | 6.6p | needs 10.5 ❌ | needs 9.3 ❌ | DOWN | 100-bar size |
| 11 Sep 07:00 | 10:00 | 8.3p | needs 11.4 ❌ | needs 9.3 ❌ | DOWN | 100-bar size |
| 11 Sep 08:00 | 11:00 | 10.3p | needs 11.6 ❌ | needs 9.3 ✅ | DOWN | 100-bar size |
| 11 Sep 15:00 | 18:00 | 8.6p | needs 11.6 ❌ | needs 9.3 ❌ | DOWN | 100-bar size |

**TWO SEPARATE FINDINGS CAME OUT OF THIS.**

**(a) The size bar rose during the move, by 18%.** The 100-bar test asks 2.5x the median body of the
last 100 bars — about four days. A violent four days raises that median, so the test demands more
right when the market is moving:

| | 100-bar median body | demands |
|---|---|---|
| before the move, 09 Sep 12:00 | 3.90p | 9.8p |
| at his 1st mark, 10 Sep 10:00 | 4.40p | 11.0p |
| after the move, 11 Sep 15:00 | 4.65p | 11.6p |

Over the last 2,200 GBP/USD bars the 100-bar test is the stricter of the two **52%** of the time, and
it was the binding one on **every single hour** of his window. The second test — the one built from
his own candles — was asking only 9.3-9.5p, and **two of his candles passed it** (9.9p and 10.3p).

**(b) The system called the downtrend ~5 hours later than he did.** It read UP through 10 Sep 11:00
UTC, mid-turn 12:00-14:00, and only DOWN from **15:00 UTC (his 18:00)**. His first two marked candles
fall inside that lag, which is why their refusal says "up trend".

**THE OPEN QUESTION FOR HIM** — a conflict in the evidence, not a defect I can settle:
the 2.5x multiplier was calibrated 2026-07-20 against **87 of his real GBP/USD trades**, whose
momentum candles ran **2.7-6x the median (14-31 pips, median ~22)**
([vix1_momentum.py:40-45](../../signal_platform/strategies/vix1_momentum.py#L40)). The candles he
marked here are **1.5-2.3x the median (6.6-10.3 pips)**. Both cannot be his standard. **He has to say
which.**

---

## Decisions taken

*(Nothing changes in the code until he rules on it. Every ruling goes here, in his own words.)*

| Date | His words | What was changed |
|---|---|---|
