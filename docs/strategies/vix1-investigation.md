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

---

## Decisions taken

*(Nothing changes in the code until he rules on it. Every ruling goes here, in his own words.)*

| Date | His words | What was changed |
|---|---|---|
