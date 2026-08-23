# BX-S/D — what it actually produces, measured

**Read this before asking "is BX working?" or "why did/didn't it signal?"** It exists so no session
starts from scratch, and so a number is never quoted again without the caveat that goes with it.

Last measured **23 August 2026**. Two commands re-create everything here.

---

## 1. How many setups it produces

**EUR/USD, one full year: 17 Jul 2025 → 17 Jul 2026, 1,554 four-hour bars.**

| month | signal 1 | signal 1 (no zone — advisory) | signal 2 |
|---|---|---|---|
| Jul 2025 *(part)* | 3 | 0 | 6 |
| Aug | 4 | 0 | 8 |
| Sep | 7 | 1 | 10 |
| Oct | 5 | 2 | 9 |
| Nov | 4 | 0 | 6 |
| Dec | 5 | 1 | 6 |
| Jan 2026 | 4 | 0 | 7 |
| Feb | 7 | 0 | 7 |
| Mar | 5 | 2 | 9 |
| Apr | 5 | 0 | 13 |
| May | 6 | 0 | 8 |
| Jun | 5 | 1 | 4 |
| Jul 2026 *(part)* | 4 | 1 | 2 |
| **TOTAL** | **64** | **8** | **95** |
| **PER MONTH** | **4.9** | **0.6** | **7.3** |

**It is steady.** Signal 1 never leaves the 3–7 range in any month; signal 2 stays between 4 and 13.
No dead months, no floods.

**A 3-month run corroborates it** — 4.2 / 0.5 / 4.8, against 4.9 / 0.6 / 7.3 over the year. Signal 1
landed almost exactly where the small sample predicted.

### What these numbers are NOT

- **They are not signals.** They stop at the qualifying setup, before the 1-minute/5-minute
  confirmation entry, on his instruction: *"Just qualifying setups. Dont go to entry."* That
  confirmation will cut the number that actually reach him and **by how much is not known**.
- **They say nothing about money.** No win rate, no R, no profit. Frequency only.
- **One look per 4-hour bar.** Production scans every 60 seconds, so inside one bar it gets ~240
  looks at a moving live price where the measurement gets one look at the bar's whole range. Those
  pull in opposite directions and the net is not known to be zero. Treat as the right order of
  magnitude, not an exact count.

### One thing that does not match his expectation

He has said signal 1 should fire **more** often than signal 2, because it asks for less. Over the
year it fires **less** — 4.9 against 7.3, and in 11 of the 13 months. On a full year this is a real
pattern, not sample noise. **Unexplained. Worth understanding.**

---

## 2. How to re-run it

```
cd signal_platform
python tools/bx_setups.py                    # one year of EUR/USD  (~8 min)
python tools/bx_setups.py --months 3         # faster spot check    (~2 min)
python tools/bx_events.py --detail           # the diagnosis        (~4 min)
```

**`bx_setups.py` is a BACKTEST — ask before running it.** The standing rule names frequency sweeps,
and approval for one run is not approval for the next.
**`bx_events.py` is not** — it scores nothing and is safe to run any time.

**The data lives in `C:\Users\FSD\trading_app_data\ctrader\`.** Ranges checked 2026-08-23:

| file | covers |
|---|---|
| `EURUSD_H4real.csv` | 24 Apr 2024 → 24 Jul 2026 |
| `EURUSD_M1.csv` (800k rows) | **22 May 2024 → 17 Jul 2026** — the full one |
| `EURUSD_M1_145d.csv` | 23 Feb 2026 → 17 Jul 2026 — **a short extract, and a trap** |

The 145-day file is named like the main one and sits beside it. A whole 3-month measurement was run
against it on the assumption it was all there was. Anything needing more than ~5 months of
15M/30M/1H must use `EURUSD_M1.csv`.

---

## 3. The diagnosis — which check refuses a real change of character

This is the tool that finds things, because its events are independent: they come from reading raw
candles, with no BX code involved. Every genuine defect found on 2026-08-23 came from it.

**EUR/USD, 3 months, as of 23 Aug 2026 — 19 events:**

| what stopped it | how many | is it a defect? |
|---|---|---|
| a zone existed but price had already **broken** it | 4 | **No — the rule working.** A zone price closed through is dead |
| price never stayed clear of the zone for 3 candles | 3 | **No — his rule working** |
| the move broke no opposite zone | 1 | **No — his rule working** |
| my own swing reading had incomplete structure | 2 | **No — the tool's limit, not BX** |
| the zone was never recorded as tapped | 1 | unexamined |
| **the reaction left no zone behind to enter on** | 5 *(3 with a real change of character)* | **open — defect `0u`** |
| genuinely no zone anywhere at that level | 1 | **open — one event, unexplained** |
| **reaches the entry gate** | **2** | — |

**Nine of the seventeen refusals are BX correctly applying his own rules.** The 19 was never a target
BX should hit — some of those turns are at levels BX had already written off.

---

## 4. THE FALSE ALARMS OF 23 AUGUST — read this before reporting a finding

Five claims were made that day, repeated, and turned out to be wrong. Every one cost him time and he
caught every one by asking. **The pattern is identical each time: a real number was produced, an
explanation was attached to it, and the explanation was repeated before being checked.**

| the claim | what checking actually showed |
|---|---|
| *"Untouched zones still sitting beyond matter"* | present on **90%** of tapped zones — as a rule it would refuse nine setups in ten. Meaningless as a filter |
| *"BX never drew a zone where price turned"* — called the biggest defect | BX **had** drawn one in **4 of 5**; price had broken them. The harness filtered broken zones out |
| *"5 changes of character left no zone behind"* | **3.** Two never produced a change of character at all |
| *"That 3 Aug signal is nearly the same bad trade"* | the dates show a clean 4-day sequence — zone held 16 Jul, new zone 20 Jul, price back 31 Jul |
| *"The reaction happened long ago"* | **4 days** |

**The rules that follow, and they are not optional:**

1. **A count is not a cause.** `bx_events.py` says *which check* refused, never *why that check was
   right or wrong*. Those are different questions and the second one needs its own look.
2. **Separate the causes before naming one.** "No zone marked" has four possible causes. Run
   `--detail`. Four out of five turned out to be the opposite of the reported story.
3. **Check the dates.** Two of the five collapsed the moment the actual timestamps were printed.
   Zones are drawn and tapped months apart; "old zone" and "old reaction" are different things.
4. **Ask whether a condition is even rare** before calling its presence a warning sign. "Untouched
   zone beyond" was true 90% of the time.
5. **Stop verifying only when the answer disagrees with you.** The habit was to stop checking once
   the numbers matched what had already been said.

---

## 5. Where the rest lives

- **`bx-sd.md`** — the settled RULES in his own words, and the fix log.
- **`bx-sd-architecture.md`** — the SHAPE: module map, zone-book model, lifecycle, and the
  **KNOWN OPEN DEFECTS** list. Read that before assuming anything is or is not fixed.

**Open as of 23 Aug 2026:** `0u` the reaction leaving no zone behind (3 cases, his rule recorded,
deferred by his choice) · `0s` the 3 Aug regression test is red and awaiting his ruling · `0t`
`bx_sd_signal1.py` is 327 lines against the 200 limit · the cost of the entry stage is unmeasured ·
**and none of the 23 Aug work is deployed.**
