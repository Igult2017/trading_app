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

## ISSUE 4 — "THE FASTER STRUCTURE" IS READING EVIDENCE HALF A DAY OLD (found 2026-09-13, Setup 3)

**OPEN. Not fixed — reported to him, awaiting his ruling.**

**His setup:** XAU/USD **10 Sep 18:00 UTC (his 21:00)**, a **$19.87** sell candle ending a bounce in
a downtrend. He marked the bounce on his chart and labelled it *"pullback"*.

**It passed everything that should matter.** It IS a momentum candle (198.7 pips against 186.6
needed). The trend read **DOWN**, agreeing with the candle. It was refused by the 8-bar leg gate:
*"down momentum WITH the trend, but the leg does not permit it — the faster structure is trending up
against the downtrend — this is a pullback, not a continuation."*

**WHY THAT IS WRONG HERE, measured.** `fast_pattern` finds turning points with an 8-bar look-back, so
a pivot needs 8 bars on each side and **the newest 8 bars can never hold one**
([vix1_structure.py:121](../../signal_platform/strategies/vix1_structure.py#L121)). At his candle:

- the newest evidence available to the gate was **12 hours old** (10 Sep 06:00 UTC / his 09:00)
- the four swings it compared were **12, 27, 29 and 42 bars old**
- it read highs 4434.14 → 4435.09 (rising) and lows 4341.13 → 4374.95 (rising), so "up"
- **in the 8 hours it could not see, gold fell 4374 → 4333** — a $34 candle, then his $19.87 one

So it refused the candle on the strength of a bounce that the candle itself had already ended.

**HE HAS REPORTED THIS EXACT DEFECT BEFORE.** The module's own notes carry his GBP/USD case of
**26 Aug 2026 15:00**, where the four swings compared were 52, 16, 47 and 31 bars old and a 21.5-pip
fall was called "a pullback, not a continuation"
([vix1_structure.py:135-143](../../signal_platform/strategies/vix1_structure.py#L135)). The note
concedes it is *"STRUCTURAL, NOT BAD LUCK... it cannot see the turn for another n bars."*

**THE 29-AUG FIX DOES NOT COVER THIS CASE.** That fix discards swings older than the last change of
character. Gold's last change of character was at bar 1403 — **150 bars (over six days) earlier** —
so every stale swing survived the filter and nothing was discarded. The mitigation only bites right
after a trend turns; a long-running trend gets no protection at all.

**Same shape as Issue 3:** a gate judging the present with evidence that structurally cannot include
the present.

### Does the 8-bar gate earn its place? — measured 2026-09-13 on his question

*"we have CHOCH, HH and HL — can you check and lemi know if we really need this 8 bar thing or how
we make it to be natural and work with any instrument in any circumstance."*

Gate-attribution counts over ~4 months of real bars. **NOT a backtest** — no win rate, no money.

| | EUR/USD | GBP/USD | XAU/USD |
|---|---|---|---|
| momentum candles that reached the gate | 74 | 85 | 19 |
| refused by the 8-bar gate | 6 (8%) | 8 (9%) | 1 (5%) |
| …of those, refusals **nothing else** would have made | **4** | **2** | **0** |
| age of the newest swing it used | median 19h, worst 27h | median 10h, worst 69h | median 12h |
| **price had already moved >0.5x ATR the TREND's way in the bars it cannot see** | **6 (100%)** | **5 (62%)** | **1 (100%)** |
| how far price travels in those unseen bars | median 3.44x ATR | 2.36x ATR | 1.93x ATR |

**Six unique refusals in four months across three instruments — and in nearly all of them the
"pullback" it refused on was already over.**

**ITS FOUNDING CASE NO LONGER EXISTS.** The gate was built for GBP/USD 10 Aug 2026 09:00 UTC, where
*"the 2-day trend said DOWN and the 8-hour structure said UP"* and VIX.1 sold into an 85-pip rally
([vix1_structure.py:26-28](../../signal_platform/strategies/vix1_structure.py#L26)). Replayed on the
current code: **the trend there now reads UP**, so a sell is never sought, and scanning 07-12 Aug
only three bars produce a momentum candle in the trend's direction — none on 10 Aug, and the leg
gate ALLOWS all three. The trend rewrite (real-time turns 12 Aug, one-module trend 08 Sep) overtook
the scenario. The 29-Aug note claiming *"the 10 AUG CASE is untouched"* is stale.

**THE "NATURAL" TOOL HE IS ASKING FOR ALREADY EXISTS AND IS HIS OWN RULE.**
`vix1_swings.structure_turns` marks a high the moment a candle *closes below the low of the candle
that made it*. Its own docstring: *"That is the whole rule. There is no tuned number in it"* and
*"The delay is a property of the move, not a constant"*
([vix1_swings.py:1-30](../../signal_platform/strategies/vix1_swings.py#L1)). The trend already uses
it. The 8-bar gate still uses `find_swing_points`, the definition that *"cannot be evaluated in real
time"*, with a number he himself called provisional: *"keep it at 8 hours for now… We can test 5, 8,
and 12 later using the actual trading results"* ([vix1_structure.py:59](../../signal_platform/strategies/vix1_structure.py#L59)).

**THE ONE THING THAT MUST SURVIVE ANY REPLACEMENT:** half of all pullbacks are complex and print
their own lower highs and lower lows inside an intact uptrend (21 of 42 GBP/USD, 17 of 37 EUR/USD
over 12 months), so **the fast read must never be allowed to decide direction**
([vix1_structure.py:36-39](../../signal_platform/strategies/vix1_structure.py#L36)).

**The other candles in the same stretch, for completeness** (all real broker bars): his 20:00 ($11.38)
and 23:00 ($7.60) were too small; his 22:00 ($8.41) too small and the wrong shape; and **11 Sep 03:00
UTC / his 06:00 ($18.32) missed the size bar by 20 cents** — it needed $18.52.

---

# THE TWO ISSUES WE ARE INVESTIGATING

Opened 2026-09-13 on his instruction: *"So far we have 2 issues to look into: How momentum candles
are decided, Trend detection. Record that then we keep going on."*

Both came out of Setup 1 (GBP/USD, 10-11 Sep — the full working is further down). **Neither is
diagnosed yet and nothing has been changed.** Every new setup he sends gets checked against both.

## ISSUE 1 — How a momentum candle is decided

**What we know.** All nine down-candles in his marked move were rejected for being too small, before
any other rule got a say. The size rule asks the candle to be **2.5x the middle-sized candle of the
last 100 hours**. At that moment a normal GBP/USD hourly candle was 4.4 pips, so it wanted about 11
pips. His candles were 6.6 to 10.3 pips.

**Two specific things to settle.**

- **The yardstick grows during the move it is measuring.** "Normal" is taken from the last 100 hours,
  which is about four days. Four violent days make normal bigger. Before his drop the rule wanted
  9.8 pips; by the end of it, 11.6 pips — **18% harder, during the move**. So a big move raises its
  own bar and can reject the candles that made it.
- **His own two standards do not agree.** The 2.5x came from **87 of his real GBP/USD trades** whose
  momentum candles ran **2.7-6x normal (14-31 pips)** — [vix1_momentum.py:40-45](../../signal_platform/strategies/vix1_momentum.py#L40).
  The candles he marked on 10-11 Sep are **1.5-2.3x normal (6.6-10.3 pips)**. **HE MUST RULE ON WHICH
  IS HIS STANDARD.** Do not guess this, and do not change the number before he says so.

**Not introduced by the overhaul** — 2.5x has been in place since 2026-07-20. That does not clear it;
it only means the recent changes are not where this one came from.

**There is a second size test** (2.12x the middle candle of the last 2000 hours) which was asking
only 9.3-9.5 pips. Two of his candles passed it and were still killed by the 100-hour test. Over the
last 2,200 GBP/USD bars the 100-hour test is the stricter of the two **52%** of the time, and it was
the binding one on **every hour** of his window.

## ISSUE 2 — Trend detection

**What we know.** The system saw his downtrend about **five hours later than he did**. It still read
UP through 10 Sep 11:00 UTC (his 14:00), went to "no trend, changing" for three hours, and only
called it DOWN from 10 Sep 15:00 UTC (**his 18:00**). His first two marked candles fell inside that
gap, which is why their refusal says "up trend" while his chart plainly shows price falling.

**Things already noticed that belong to this issue.**

- **The "lost its shape" test.** A trend only counts while the last two highs AND the last two lows
  both step the same way. It flipped to "out of shape" repeatedly through his window even while the
  direction stayed DOWN — see the 10 Sep 11:00, 11 Sep 01:00, 11 Sep 08:00 and 11 Sep 15:00 rows in
  Setup 1. This rule **existed before the overhaul** as a separate veto refusing a trend 37.2% of the
  time, and moved on 08 Sep. **Whether the new one refuses MORE than the old one has NOT been
  measured.** That measurement is the next obvious job on this issue.
- **A turn DOWN is refused the shortcut that a turn UP gets** ([vix1_choch.py:128-131](../../signal_platform/strategies/vix1_choch.py#L128)),
  so during the three "no trend" hours nothing could be traded downward at all.
- **Known open defect, already on record:** the trend reverses about 90 times a year, median run 1.6
  days — not the 9-10 its own notes claim. See [[project-vix1-trend-churn]].

## ISSUE 3 — THE PULLBACK COULD ONLY BE PROVED BY THE CANDLE THAT ENDS IT ✅ **FIXED 2026-09-13**

**HIS RULING, and it is the rule the fix is built to:** *"In VIX, we start taking trades when the
pullback [ends] and if the first candle after the pullback is a momentum candle, we take trade there.
We mark it after closure and then take trade in the next one. VIX rule says that and that is one of
the rules you introduced without my knowledge."*

**Confirmed on both counts before anything was touched.** `trend_reproven` entered on **2026-09-04 in
an `autocommitted` commit (`e75d53c`)** — not a reviewed change.

**THE FIX.** The gate now accepts **either** proof of a pullback: a confirmed turn since the run, or
a retracement measured behind the candle (`vix1_retracement`, which deliberately steps over the
momentum candle to see exactly this). It refuses only when **neither** sees one.

**MY FIRST ATTEMPT WAS WRONG AND HIS OWN SUITE CAUGHT IT.** Using the retracement alone broke his
2026-08-25 bearish proof, where the pullback ends SIX bars before the momentum candle and the
retracement (which steps over only ONE trend-way candle) cannot see it. Both readings are kept.

**MEASURED, ~4 months of real broker bars, NOT A BACKTEST** (no win rate, no money — only how many
real momentum candles this one gate refused, before versus after):

| pair | reached this gate | refused BEFORE | refused AFTER | recovered | newly blocked |
|---|---|---|---|---|---|
| EUR/USD | 74 | 10 (14%) | 2 (3%) | 8 | **0** |
| GBP/USD | 85 | 7 (8%) | 0 (0%) | 7 | **0** |
| XAU/USD | 19 | 2 (11%) | 0 (0%) | 2 | **0** |

**Two of the eight recovered EUR/USD setups are 06 Sep 22:00 and 07 Sep 07:00** — the pair of setups
he complained about before this investigation started, refused nine times with nothing sent to
explain it. They were this defect.

**Tests:** `test_choch_bearish_proof.py` 15/15, `test_tradeable.py` 31/31 (control intact — his one
tradeable market still fires all three; all nine quiet-market refusals unchanged, which are
`market_awake`'s work not this gate's). Real bars saved at
`trading_app_data/ctrader/{EUR,GBP,XAU}USD_H1_sep12.csv`.

**Original finding, kept for the record:**

**The case: EUR/USD, 11 Sep 15:00 UTC (his 18:00), a 10.6-pip sell.** Price fell all morning,
bottomed on the 12:00 bar, bounced for three hours (+11.6, +9.2, +1.7 pips ≈ 13 pips up), then his
momentum candle sold off 10.6 pips. Textbook "it ran, it pulled back, we enter". The system agreed
the trend was DOWN and agreed the candle was a momentum candle, then refused it for *"the trend ran
but has not pulled back since"*.

**The mechanism, measured.** `trend_reproven` ([vix1_tradeable.py:90](../../signal_platform/strategies/vix1_tradeable.py#L90))
needs a **confirmed turn against the trend** after the run — in a downtrend, a confirmed HIGH. The
turning-point detector only confirms a high once price **closes back down through** the candle that
made it. **The candle that does that is his momentum candle.** And everything about the momentum
candle is judged on the window truncated AT that candle ([vix1_bias.py:240-242](../../signal_platform/strategies/vix1_bias.py#L240)),
so the confirmation its own close creates is invisible to it.

Measured outcome, bar by bar: highs-after-the-run = **0** at 15:00 → refused; **1** at 16:00 →
pullback accepted. **The pullback is recognised exactly one hour too late**, and by then the candle
is no longer the newest closed bar.

**Ruled out as the cause:** replaying with the pre-31-Aug `momentum_run` (scan back 12 bars) still
refuses at 15:00, 16:00 and 17:00 — same reason. So the "newest bar" change is not what killed it.

**NOT YET MEASURED:** how often this bites across the full history. That is the next job on this
issue, and it decides whether this is an edge case or the main event.

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
