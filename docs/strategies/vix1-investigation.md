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

## ISSUE 4 — "THE FASTER STRUCTURE" IS READING EVIDENCE HALF A DAY OLD ✅ **CLOSED 2026-09-13**

**HIS RULING — the 8-bar gate is DELETED and there is now ONE pullback logic on the 1-hour chart:**

> *"we cant have 2 pullback logics in 1 HR TF. Lets use the retracement logic that counts a pullback
> from one candle. We have CHOCH logic and we also have protected area which protects us and prevents
> us from trading complex pullbacks that occur inside a pullback as a move. So we should only use one
> matured pullback logic as the only pullback logic. The one that is blind to 1 one candle pullback
> is costing us."*

**THE MEASUREMENT THAT PROVED HIM RIGHT — one-candle pullbacks, 3,000 real bars per instrument:**

| | one-candle pullbacks | became a swing | **left no swing at all** |
|---|---|---|---|
| EUR/USD | 767 | 104 (14%) | **663 (86%)** |
| GBP/USD | 783 | 117 (15%) | **666 (85%)** |
| XAU/USD | 723 | 130 (18%) | **593 (82%)** |

A single candle had to reach back a median **1.05-1.19x ATR** before the swing detector noticed it;
the ones it missed reached 0.67-0.87x. Meanwhile `vix1_retracement` counts CANDLES — his own rule,
*"A pullback can be from 1 candle or more so it should count candles"* — and sees every one. **48% of
his retracements are a single candle**, so the coarser reader held a veto over pullbacks it could not
see.

**HIS REBUTTAL OF THE GATE'S DEFENCE IS THE LOAD-BEARING PART.** It justified itself on complex
pullbacks (a pullback printing its own lower highs and lows inside an intact uptrend). He answered
that the **change-of-character rule and the protected level** already cover that — and they do:
`vix1_trend` sets direction to 0 the moment a body closes through the protecting swing.

**WHAT WAS DELETED:** `strategies/vix1_structure.py` entirely (`leg_state`, `fast_pattern`,
`_distinct`, `LegState`, `_FAST_N`), its three enforcement points in `vix1_bias`, its dedicated test
file `test_leg_gate_obeys_choch.py`, and nine checks in `test_structure.py`. Its 2026-08-29 problem —
*"there are two pullback readings on the 1-hour chart"* — disappears with it rather than being
patched again. **VIX.1 suite: 48 files, ALL PASS.**

**⚠ THIS DID NOT FREE HIS GOLD SETUP, and I said so before making the change.** XAU/USD 10 Sep 18:00
is now refused by the **shape test** instead: *"the downtrend has lost its shape — it needs a lower
high and a lower low, but the highs are moving up and the lows up."* That is Issue 5, and it is the
next ruling he has to make.

### HIS FOLLOW-UP CATCH — and the measurement that says DO NOT ship the obvious fix

*"Meaning you havent implemented pullback logic to design swings in that shape thing you keep
mentioning. If you did, it would have detected that pullback."*

**He is right about the cause, and the test is decisive.** Rebuilding his gold window's highs and
lows from the pullback rule (one candle against the run ends a leg) instead of the swing detector:

| | last two highs | last two lows | verdict |
|---|---|---|---|
| swing detector (today) | 4412.89 → 4434.14 **rising** | 4341.13 → 4386.09 **rising** | lost its shape — **REFUSED** |
| pullback rule | 4435.09 → **4376.64** falling | 4405.62 → **4323.84** falling | in shape — **ALLOWED** |

And the pullback-built swings are FRESH — 10 Sep 14:00 and 12:00, hours before his candle, not the
previous day. It finds **32 legs** since the trend began where the swing detector finds a handful.

**BUT APPLYING IT EVERYWHERE MAKES THE GATE STRICTER, NOT LOOSER — measured, all three instruments:**

| | setups | shape refuses TODAY | would refuse | freed | **newly refused** |
|---|---|---|---|---|---|
| EUR/USD | 74 | 34 | **52** | 6 | **24** |
| GBP/USD | 85 | 39 | **63** | 11 | **35** |
| XAU/USD | 19 | 9 | **13** | 2 | **6** |

**65 newly refused against 19 freed.** His gold candle is freed; a third of everything else is lost.

**WHY, and this is the real finding:** pullback-built swings are far more numerous and therefore
zigzag. Asking *"do the last two highs AND the last two lows both step the trend's way"* of fine
swings is much harder to satisfy than of coarse ones. **So the fragile part is not only WHICH swings
— it is the "last two of each" question itself.** Coarse swings make it stale; fine swings make it
noisy. Re-sourcing alone cannot fix both.

**NOT SHIPPED. Awaiting his ruling** — the honest options are to keep the coarse swings and accept
staleness, to use pullback swings and accept a third fewer setups, or to change the shape question
so it does not rest on exactly two swings.

**The original finding, kept for the record:**

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

### Tested: can a REAL-TIME read replace the 8-bar gate? — 2026-09-13, on his instruction

*"Try that real time and then run it on the setups that were rejected by 8 bar gate... If real time
is accurate, we will use it and drop the 8 bar gate. Test rigorously."*

**Built:** `fast_pattern`'s exact question — is a faster read of structure pointing the OPPOSITE way
to the trend? — read from `vix1_swings.turning_points` instead of 8-bar pivots. **Note:
`structure_turns` ignores its `n` argument when REALTIME is on ([vix1_swings.py:119-129](../../signal_platform/strategies/vix1_swings.py#L119)),
so it is scale-free and reads the SAME turn list the trend reads.**

**ANSWER: it works, it is safe, and it is REDUNDANT — so the swap is the wrong move.**

| | EUR/USD | GBP/USD | XAU/USD |
|---|---|---|---|
| setups reaching the gate | 74 | 85 | 19 |
| refused by the 8-bar gate | 6 | 8 | 1 |
| refused by the real-time read | **11** | **16** | **3** |
| freed by the swap | 6 | 6 | **0** |
| **newly refused** by the swap | **11** | **14** | **2** |
| evidence age — 8-bar | median 14h, worst 50h | median 14h, worst 32h | median 15h, worst 24h |
| evidence age — real-time | median **1h**, worst 29h | median **2h**, worst **45h** | median **0h**, worst 19h |
| refuses on an already-dead pullback | 100% | 62% | 100% |
| …real-time | **45%** | **56%** | **33%** |

1. **It is stricter, not looser.** 12 setups freed against **27 newly refused**. Swapping it in costs
   signals rather than recovering them.
2. **It does NOT fix his gold setup.** XAU 10 Sep 18:00 is still refused, on **19-bar-old** evidence
   — older than the 8-bar read's 12. Real-time turns appear only when the market makes one, so
   *"the delay is a property of the move"* cuts both ways: a grinding market produces no turn and the
   last one goes stale.
3. **It IS safe on the founding case.** Forced to answer for a SELL at GBP/USD 10 Aug 08:00-11:00,
   the real-time read refuses every hour, on **1-4 bar-old** evidence. It catches the 85-pip trap
   faster than the 8-bar read did.
4. **THE DECIDER — it is 100% redundant.** Of its 30 refusals across the three instruments,
   **30 were already refused by `in_shape`. Zero genuinely new.** The "does a faster read of
   structure disagree with the trend" question is ALREADY answered by the trend module, in real
   time, with no tuned number. Building a second one adds nothing.

**WHAT DELETING THE 8-BAR GATE ACTUALLY DOES — tested by removing it and re-running `detect_bias`:**

| setup | with the gate | without it |
|---|---|---|
| EUR/USD 09 Jul 13:00 | no trade (leg gate) | **TRADE BUY** |
| GBP/USD 24 Aug 09:00 | no trade (leg gate) | **TRADE BUY** |
| **XAU/USD 10 Sep 18:00 (his)** | no trade (leg gate) | **still no trade** — *"the downtrend has lost its shape"* |

**SO HIS GOLD SETUP IS NOT AN 8-BAR PROBLEM. It is an `in_shape` problem.** The leg gate merely spoke
first. Gold's last two confirmed highs (4412.89 → 4434.14) and lows (4341.13 → 4386.09) were BOTH
rising while the trend read DOWN — and those turns were 19 bars old.

**THE UNDERLYING FINDING, and it is bigger than either gate:** any rule built on *"the last two highs
and the last two lows"* inherits the staleness of the last two confirmed turns. After a hard move
that has not yet printed a new turn, that evidence can be a day old — on the 8-bar read and on the
real-time read alike. **That is the thing to fix, and it now sits inside `in_shape`.**

### ISSUE 5 — THE MOVE IN PROGRESS IS INVISIBLE (found 2026-09-13, on his question about memory)

**His question:** *"Does it have a memory? If it has a memory it can persist every move and make
reference to know how the price looks like and where it has come from... we can persist real move
which draws perfect trend and giving a clear picture of both complex and simple pullbacks."*

**HE IS RIGHT, AND THE DATA HE WANTS IS ALREADY BEING BUILT.** Three facts, measured:

1. **The full map already exists, every scan.** `turning_points` returns EVERY confirmed turn in the
   window, oldest first ([vix1_swings.py:49-101](../../signal_platform/strategies/vix1_swings.py#L49)).
   Measured on real bars: **201 turns for EUR/USD, 240 for GBP/USD, 227 for XAU/USD** per 1500-bar
   window. Each carries `index` (the bar that made the extreme) and `confirmed` (the bar whose close
   proved it), so the legs between them are one subtraction away. **That is a leg book already.**
2. **Almost none of it is read.** `trend_state` replays every turn for DIRECTION. Every rule that
   asks *"is the shape still right"* reads **4 numbers** — the last two highs and the last two lows.
3. **There IS a stored memory and it decides nothing.** `vix1_trend.remember` (08 Sep) keeps only how
   long the current answer has held — `direction_bars`, `shape_bars`
   ([vix1_trend.py:368-399](../../signal_platform/strategies/vix1_trend.py#L368)).

**THE GAP, AND IT IS EXACTLY THE ONE HE NAMED — his gold setup, measured:**

| the last 6 moves on record | price | when it happened | how old | leg |
|---|---|---|---|---|
| low | 4387.72 | 08 Sep 08:00 (his 11:00) | 55 bars | |
| HIGH | 4412.61 | 08 Sep 13:00 (his 16:00) | 47 bars | +24.89 |
| low | 4341.13 | 09 Sep 00:00 (his 03:00) | 40 bars | −71.48 |
| HIGH | 4412.89 | 09 Sep 07:00 (his 10:00) | 32 bars | +71.76 |
| low | 4386.09 | 09 Sep 10:00 (his 13:00) | 30 bars | −26.80 |
| HIGH | 4434.14 | 09 Sep 13:00 (his 16:00) | 19 bars | +48.05 |

**And then, not on the list: a −$101.13 fall over 28 bars, from that last high to the candle he
marked.** It is missing because it has not ENDED — no new low has been confirmed, so no turn exists.

The shape test read highs 4412.89 → 4434.14 (rising) and lows 4341.13 → 4386.09 (rising), concluded
*"the downtrend has lost its shape"*, and refused. **Both pairs it compared predate the fall
entirely.** The largest move on the chart was the one thing it could not see.

**HOW IT WOULD INTEGRATE — no new module, no stored state:**

- The missing piece is a **current leg**: from the newest confirmed turn to the latest close —
  direction, size, bars, and where it started. Derived per scan from data already in hand, so it does
  **NOT** re-open the risk behind *"DERIVED, NEVER STORED… a stored value that went wrong once froze
  the trend for 873 bars"* ([vix1_swings.py:36-38](../../signal_platform/strategies/vix1_swings.py#L36)).
- It belongs in `vix1_trend`, which already owns the trend and already holds `highs`, `lows`,
  `protected`, `bos_index` and `direction_since`.
- `_shape` then asks the question with the present included, instead of only the past.
- `vix1_retracement` already measures depth from the trend's extreme, so part of this is built —
  what it does not do is report the running leg as a *structural* fact the shape test can read.

**NOT MEASURED YET, and it must be before anything is built:** whether including the running leg
fixes the general case or only this one, and what it would newly allow or refuse. Also the standing
constraint that must survive: half of all pullbacks are complex, so the fast read must never be
allowed to decide direction.

### Tested: would a LINE-CHART (close-based) trend read help? — 2026-09-13, on his question

*"i would prefer trend detector to use line charts because they are more clearer... Is there a way
we can make trend detector to use line charts or that is not necessary?"*

**THE DETECTOR IS CURRENTLY MIXED, and that IS an inconsistency worth knowing about.** The swing
price it records is the **wick** (`Turn(True, candles[hi_i].high, …)`,
[vix1_swings.py:91](../../signal_platform/strategies/vix1_swings.py#L91)) and the extreme is tracked
on highs/lows ([:62-64](../../signal_platform/strategies/vix1_swings.py#L62)), but the confirmation
is a **close** ([:75](../../signal_platform/strategies/vix1_swings.py#L75)) and the
change-of-character trigger is a close through a wick level
([vix1_trend.py:326](../../signal_platform/strategies/vix1_trend.py#L326)). **Levels from wicks,
triggers from closes.** And `vix1_retracement` already went the other way deliberately, citing his
own rule — *"a CHoCH needs the body of a candle… a wick poking through an extreme is not the trend
carrying on"* ([vix1_retracement.py:120-125](../../signal_platform/strategies/vix1_retracement.py#L120)).

**MEASURED: the swings really are wick-driven** — a recorded swing price sits a **median 0.5x ATR**
from that same bar's close (90th percentile 1.2x EUR/USD, 1.56x GBP/USD, 1.34x XAU/USD). So half the
structure is drawn at spike extremes rather than where price settled.

**BUT IT WOULD NOT FIX WHAT HE IS CHASING.** Re-running the shape test with swings read as closes:

| | verdict identical | wicks said OUT, closes say IN | wicks said IN, closes say OUT |
|---|---|---|---|
| EUR/USD (74) | 68 (92%) | 3 | 3 |
| GBP/USD (85) | 72 (85%) | 7 | 6 |
| XAU/USD (19) | 17 (89%) | 2 | 0 |

The flips very nearly cancel. **And his gold setup reads the SAME either way** — as closes the highs
are 4409.09 → 4415.16 (still rising) and the lows 4364.48 → 4399.46 (still rising), so the downtrend
is still "out of shape". Wick versus close is not the lever on this problem.

**⚠ I RAISED A FALSE AMBIGUITY HERE AND THE DATA CLOSED IT — recorded so nobody re-opens it.** I
suggested gold might have turned UP, because the last two highs and lows were both rising. He
answered: *"Are you blind? Is it this one which is a clear downtrend after CHOCH confirmed?"* He is
right, and the turning-point record proves it rather than his chart merely asserting it.

**THE TREND DIRECTION WAS CORRECT ALL ALONG — only the shape test was stale.** Gold's confirmed
turns, with the bar each became knowable on:

| | price | made | first knowable | lag |
|---|---|---|---|---|
| low | 4341.13 | 09 Sep 00:00 | 09 Sep 01:00 | 1 bar |
| HIGH | 4412.89 | 09 Sep 07:00 | 09 Sep 09:00 | 2 bars |
| low | 4386.09 | 09 Sep 10:00 | 09 Sep 11:00 | 1 bar |
| HIGH | 4434.14 | 09 Sep 13:00 | 09 Sep 23:00 | 9 bars |
| **— nothing at all for 34 bars —** | | | | |
| low | 4311.12 | 10 Sep 23:00 | 11 Sep 00:00 | 1 bar |

**Between that high and the next low there is ONE unbroken down-leg: $123 over 34 bars, with zero
turning points recorded.** His candle closed 10 Sep 18:00 UTC; the next turn was not knowable until
11 Sep 00:00 — **6 bars after it**. So throughout the descent the "last two highs and last two lows"
were frozen at 09 September values, both pairs predating the fall entirely. The shape test was
describing 09 Sep while price was $100 lower on 10 Sep.

**THE GENERAL LAW THIS EXPOSES, and it is the heart of Issue 5:** a clean, strong trend move prints
FEWER turning points, because it never pauses long enough to make one. So the two-swing shape test
goes **most blind exactly when the trend is strongest and clearest** — the opposite of what it should
do. A choppy market feeds it swings; a decisive one starves it.

### ⭐ THE REPLACEMENT WAS ALREADY BUILT — AND WAS DISPLAY-ONLY UNTIL 2026-09-13

His question: *"if a car follows a new path, it leaves its treads behind and when one traces that, it
can see how the car travelled… we can persist price movement only in 1HR TF and then we have a
clearer and a real time picture which includes swings, pullbacks, and whether price is ranging… Can
this solve the 8 bar candle or do we already have something better in VIX that has addressed this?"*

**WE ALREADY HAVE IT. `vix1_retracement` WAS BUILT TO REPLACE THE 8-BAR READING AND CARRIES THE
MEASURED CASE AGAINST IT IN ITS OWN DOCSTRING** ([vix1_retracement.py:7-22](../../signal_platform/strategies/vix1_retracement.py#L7)),
measured over 12 months of real H1 on both pairs:

- *"it is **8 HOURS LATE** by construction. A turn needs 8 bars after it before it can be confirmed."*
- *"it is **BLIND TO SHORT RETRACEMENTS**. **99% of retracements run under 8 candles** (48% are a
  single candle, 26% are two), so it never sees the ones he actually means."*
- *"it fires on the **WRONG SIZE of move**. It refuses at a median 58 pips / 43 bars and allows at
  19 pips / 14 bars — it is catching two-day counter-legs, not pullbacks."*

And: *"This module answers the question directly and with no delay: from the trend's best CLOSED
price, count the bars and measure the distance."*

**THEN IT WAS GIVEN NO AUTHORITY.** *"So this module DECIDES NOTHING. It reports."* Grepping every
consumer of `retracement.active` / `.bars` / `.stall_bars`: only `vix1_signal.py` (the card text) —
**display only** — until `vix1_tradeable.py:126`, which is the pullback fix made THIS MORNING. That
fix is the first time the retracement has ever decided anything.

**So the instrument proven wrong is still the one deciding, and its measured replacement prints
captions.**

**HIS LINE-CHART PREFERENCE IS ALREADY HALF-IMPLEMENTED, AND INCONSISTENTLY.** Three places read the
"extreme" differently:

| where | reads |
|---|---|
| `pullback_since` ([:126](../../signal_platform/strategies/vix1_retracement.py#L126)) | **CLOSES** — a line chart, his way |
| `measure` ([:162](../../signal_platform/strategies/vix1_retracement.py#L162)) | highs / lows — wicks |
| `turning_points` ([vix1_swings.py:91](../../signal_platform/strategies/vix1_swings.py#L91)) | wick for the level, **close** for the trigger |

Two functions in the SAME module disagree about what the trend's best price is.

**WHAT IS GENUINELY MISSING — the join.** The completed legs live in `turning_points` (201-240 per
window). The leg in progress lives in `vix1_retracement` (`bars`, `pips`, `stall_bars`). **Nothing
joins them into one path, and nothing expresses the live leg as structure.** That join is his car
tracks, and it is the only new idea here — everything else is already written.

**ALSO STALE FOR THE SAME REASON:** `vix1_regime.classify` answers *"is this ranging?"* from
`highs[-1] vs highs[-2]` and `lows[-1] vs lows[-2]`
([vix1_regime.py:103-104](../../signal_platform/strategies/vix1_regime.py#L103)) — the same two
possibly-ancient swings. His path view would answer ranging better: legs alternating with no net
progress.

### MEASURED 2026-09-13 — two ways to read the path. **Nothing shipped; he must rule.**

Two candidate readings, both **comparisons rather than thresholds**, so neither introduces a number.
**NEITHER IS A RULE HE HAS STATED** — they are options with evidence attached.

- **P1 — add the present.** Append the move in progress as a provisional swing at the extreme it has
  reached, then ask today's question unchanged.
- **P2 — has the car gone further forward than it went back?** If the move in progress runs WITH the
  trend, the trend is in shape when that move is **bigger than the most recent move against it**. If
  the move in progress runs AGAINST the trend it is a pullback, and **today's test applies unchanged**
  so pullback behaviour cannot drift.

**Every momentum candle that reaches the shape test:**

| | setups | TODAY refuses | P1 refuses | P2 refuses | P1 frees / adds | P2 frees / adds |
|---|---|---|---|---|---|---|
| EUR/USD | 74 | 34 | 39 | **30** | 11 / 16 | **17 / 13** |
| GBP/USD | 85 | 39 | 39 | **28** | 15 / 15 | **24 / 13** |
| XAU/USD | 19 | 9 | 10 | **6** | 3 / 4 | **7 / 4** |

**P1 is a wash or worse** — it frees and adds in equal measure on all three. **P2 refuses fewer on
every instrument and frees roughly twice what it adds.**

**Of the setups the 8-bar gate refused, how many the shape test ALSO blocks:**

| | 8-bar refusals | still blocked today | under P1 | under P2 |
|---|---|---|---|---|
| EUR/USD | 6 | 2 | 4 | **2** |
| GBP/USD | 8 | 4 | 5 | **2** |
| XAU/USD | 1 | 1 | 1 | **0** |

**FIXED CHECK 1 — his gold setup: P2 FREES IT.** Move in progress **$110.30 down over 28 bars**
against a last counter-move of **$48.05**. Today: refuses. P1: refuses. **P2: allows.**

**FIXED CHECK 2 — the 10-Aug trap (a SELL at 08:00-11:00): all three REFUSE, every hour.** ⚠ Note
honestly *why* P2 refuses there: the move in progress ran UP while the direction tested was DOWN, so
P2 fell back to today's test. Its safety on that case comes from the fallback, not from the new
comparison.

**WHAT IS NOT MEASURED AND MUST BE BEFORE ANYTHING SHIPS:** what the ~13 newly-refused setups per
pair actually are; the combined effect of P2 together with a decision on the 8-bar gate (this
isolates the shape test only); and whether P2 survives `test_tradeable.py`'s nine quiet-market
refusals and the control. **Not a backtest — no win rate, no money, nothing here says these trades
would have made anything.**

**The other candles in the same stretch, for completeness** (all real broker bars): his 20:00 ($11.38)
and 23:00 ($7.60) were too small; his 22:00 ($8.41) too small and the wrong shape; and **11 Sep 03:00
UTC / his 06:00 ($18.32) missed the size bar by 20 cents** — it needed $18.52.

---

## A CODE REVIEW OF THE TREND ENGINE — verified line by line, 2026-09-13

A review argued the real-time detector *"exists but is effectively disconnected from the trend
engine"*, chiefly via `clear_trend` and a silent fallback. **Its reading of the architecture is
correct. Its headline diagnosis is false for the running system.** Each claim checked:

### ✅ CORRECT

| claim | verified at |
|---|---|
| `turning_points` is genuinely real-time; no 48-bar delay in it | [vix1_swings.py:51-101](../../signal_platform/strategies/vix1_swings.py#L51) |
| `trend_state` silently falls back to the OLD look-back when `turns is None` | [vix1_trend.py:248-250](../../signal_platform/strategies/vix1_trend.py#L248) |
| real-time is therefore OPTIONAL, not mandatory — a caller can forget | same |
| two sources of truth live in one file | [vix1_trend.py:67](../../signal_platform/strategies/vix1_trend.py#L67) |
| `clear_trend` passes no turns, so it would use the old detector | [vix1_trend.py:410-415](../../signal_platform/strategies/vix1_trend.py#L410) |
| the default swing width really is `_SWING_N = 3` | [vix1_trend.py:77](../../signal_platform/strategies/vix1_trend.py#L77) |
| the two-stage change-of-character deliberately leaves direction 0 | [vix1_trend.py:326-335](../../signal_platform/strategies/vix1_trend.py#L326) |
| pivots enter at `confirmed`, not at `index` — correct, no hindsight | [vix1_trend.py:265](../../signal_platform/strategies/vix1_trend.py#L265) |

### ❌ WRONG — and this was the headline

*"clear_trend()… That alone can explain a huge portion of the behavior you are seeing."*

**`clear_trend` has ZERO production callers.** Grepping the whole platform, the only non-test hits
are a **comment** ([vix1.py:81](../../signal_platform/strategies/vix1.py#L81)) and a **docstring**
([vix1_trend.py:233](../../signal_platform/strategies/vix1_trend.py#L233)). It is **dead code**. It
cannot explain any behaviour because nothing runs it.

**And every live call to `trend_state` DOES pass real-time turns:**
`vix1_bias.py:163` ✓ · `vix1_bias.py:242` ✓ · `vix1_preclose.py:164` ✓ · `vix1_watch.py:89` ✓.
The one exception, `vix1_bias.py:165`, sits behind `_ALLOW_H4 = False` and never executes.

**INDEPENDENT PROOF the live path is real-time:** gold's measured confirm lags on 09-11 Sep were
**1, 2, 1, 9, 1, 2, 1, 1, 1, 2 bars**. The old detector would show **48 on every one**. It did not.

**So none of this explains his missed setups.** Those were measured with real-time turns genuinely in
use, and the causes found are Issues 3, 4 and 5 — not this.

### ✅ DOES THE TREND ENGINE READ THE TREND IN REAL TIME? — measured 2026-09-13, 1,200 hours per pair

His correction: *"We should be testing if that real time approach detects trend in real time not
setups. The setups identification is done by many modules not just one."* He was right; the earlier
measurement blended six modules. This walks the bars one at a time and asks only about the READING.

| | EUR/USD | GBP/USD | XAU/USD |
|---|---|---|---|
| hours spent in a trend | 77% | 90% | 80% |
| direction changes | 14 | 15 | 27 |
| **how late — bars the move had already run** | median **1**, 90th 17, worst 77 | median **3**, 90th 5, worst 22 | median **1**, 90th 6, worst 46 |
| …and how far price had gone by then | median 0.95x ATR | 1.16x ATR | 0.61x ATR |
| **whipsaw — new direction contradicted within 5 bars** | **0 of 14** | **0 of 15** | **0 of 27** |
| limbo — bars reporting NO trend between directions | median 7, 90th 31, worst 77 | median 4, 90th 22, worst 25 | median 5, 90th 22, worst 44 |

**THE DETECTOR ITSELF IS GOOD.** It calls the turn a median of **1-3 bars** after the move starts,
with **zero false flips on all three instruments**. His instinct to trust it is well founded — the
staleness we have been chasing is NOT in the turn detector.

**THE WEAK POINT IS THE LIMBO.** After a change of character the engine reports no trend for a median
of 4-7 bars and, at the 90th percentile, **22-31 bars** — with price moving a median 1x ATR inside it.
Nothing can trade there (pro-trend only, and the change-of-character shortcut is refused for turns
down). That is where to look next, not at the detector.

**AND THE TWO READERS STILL DISAGREE:** the engine says "in a trend" 77-90% of hours while the range
test says "not a trend" 31-39% of hours.

### ⚠ GENUINE LATENT DEFECTS THE REVIEW DID SURFACE — ✅ ALL THREE FIXED 2026-09-13

1. ✅ **`clear_trend` DELETED.** Dead code wired to the old detector. Its last two test uses were
   converted to the production path first.
2. ✅ **The H4 trap closed.** `vix1_bias.py` now passes `turns=structure_turns(h4, _H1_SWING_N)`.
   It still never executes while `_ALLOW_H4` is False, but the day someone re-enables the flag they
   no longer silently get a 3-bar swing read on FOUR-HOUR candles.
3. ✅ **The silent fallback is gone.** `trend_state` now sources its own turning points from
   `structure_turns` when none are passed, so `vix1_swings`' promise of *"ONE SOURCE OF TRUTH FOR
   WHERE TURNING POINTS COME FROM"* is enforced by the code rather than by convention. The
   `find_swing_points` import was removed from `vix1_trend` — importing it is what made the second
   source possible.

**PROVED THESE CHANGED NO LIVE BEHAVIOUR:** the last 300 gold trend reads are **byte-identical**
before and after (stashed the change, captured the sequence, restored, captured again). That is what
should happen, because every live caller already passed turns.

**AND THE FIX EXPOSED A TEST THAT HAD BEEN WATCHING THE WRONG DETECTOR.** `test_trend.py` reached the
trend through `clear_trend`, so its reversal-count checks were measuring the 48-bar look-back —
reporting ~10 reversals while the live engine made **105 (EUR/USD) and 107 (GBP/USD)** over 4.18
years. It was green for years against a path nothing runs. The checks now read the production path
and pin the measured reality, explicitly labelled as `OPEN.md` B1 (the known churn defect) and **not**
as a pass mark. Window agreement went from 92-93% to **100%**.

## THE SWEEP — rules that outlived the instruction that created them (2026-09-13)

His instruction after the 1M structure exit turned out to be half of a replaced rule: *"Also do the
sweep."*

### ✅ FIXED IN THIS PASS

**1. The 1M structure exit — DELETED.** *"I has no use now so delete it."* It came from his
2026-07-25 wording *"in each movement we shall lock 1R until we see structure change"*. On
2026-09-03 he replaced that with the ladder, ending *"until we get knocked out"* — the stop is the
exit and there is no structure clause. The trailing half was duly swapped; **this half was left
running and kept DM-ing him about a rule he no longer had.** He did not know it existed. Gone with
its orphans: `_SWING_N`, the `find_swing_points` import, `titles.STRUCTURE_EXIT`, and four tests.

**2. THE DM WAS IGNORING HIS "DON'T MESSAGE ME EVERY LOCKED R" RULE.** His words, 2026-09-02:
*"Locking Rs should only be announced when we move to breakeven and when we are out of the market...
We dont need to get all the messages like 1R locked in the DM."* `monitor/rungs.py` has carried that
since the day he said it — **every locking rung is marked `quiet=True`**. But the flag stopped at the
table: `vix1_manage` returned a bare number, so `vix1_alerts` had no way to ask and **announced every
rung**, sending exactly the messages he asked to stop. The rung now carries its own `quiet` flag
through to the messenger. The stop still MOVES at every rung; only the message is suppressed, and a
stop that fails to reach the broker is still shouted about. Pinned by four new checks.

**3. A DISPLAY BUG IN THE LOCK MESSAGE.** It printed the locked level with **no decimals**, so a
trail moving 2.0 → 2.1 → 2.2 → 2.4 read "+2R" every time while the real stop was elsewhere. The
dedup key already used one decimal, so each step WAS sent — only the text collapsed them.

### 🔍 FOUND, NOT TOUCHED — 21 functions with no production caller

Reported rather than deleted: some are kept deliberately, and three sit in BX-S/D, which is a
different strategy and not mine to edit in a VIX.1 pass. The four that are RULES rather than
plumbing:

| what | where | verdict |
|---|---|---|
| `move_to_breakeven` | `execution/breakeven.py:145` | **Rule intact.** A named wrapper that calls `move_stop_to(p, None, …)`; the `None` is what triggers the net-of-costs breakeven price. The live path (`position_tracker.py:262`) calls `move_stop_to` directly. **Kept deliberately** — its docstring: *"Kept as a named entry point because breakeven is the one rung whose price is computed rather than given, and because it is the one he named."* |
| `news_candles` | `news/news_candle.py:50` | **Rule intact.** A bulk helper that loops `is_news_candle` — and `is_news_candle` is LIVE at [vix1.py:285](../../signal_platform/strategies/vix1.py#L285) (*"NEVER trade the news candle itself"*), as is `in_news_window`. Only the plural convenience wrapper is unused. |
| `is_market_open` | `scheduler/session_windows.py:50` | **Rule intact.** A two-line alias: `from data.instrument_filter import is_forex_open; return is_forex_open(now)`. `is_forex_open` ([instrument_filter.py:10-23](../../signal_platform/data/instrument_filter.py#L10)) is the ONE implementation — Saturday closed, Sunday before 22:00 UTC closed, Friday from 22:00 UTC closed — and it is live. Checked for a third copy: `shared/market_clock.py` has no open/closed test, only elapsed-market-time helpers. |
| `market_not_choppy` | `vix1_tradeable.py:326` | Dead, and already known as `OPEN.md` D42 — the chop rule was never built. **This is the only one of the four that names a rule which does not exist anywhere.** |

**⚠ CORRECTION TO MY OWN FIRST REPORT.** I called `news_candles` and `is_market_open` *"completely
dead — zero mentions anywhere"*. That was true of the NAME and misleading about the RULE: both are
wrappers whose logic lives elsewhere under a different name and is running. He caught it by asking
the right question — *"are their other modules where these functions were moved"* — which is the
standing rule (*"Removed from file A is NOT the rule is gone. Check whether it MOVED."*) applied to
my own sweep. **A sweep that reports unused NAMES must say where each one's RULE lives, or it reads
as a list of missing protections.**

**The pattern behind all of them is the same one that hid the structure exit:** a rule is replaced,
the new version ships, and the old function survives because nothing errors when a caller quietly
stops calling it. `clear_trend` was this. `move_to_breakeven` is this. The structure exit was this.

### 🔍 WHAT THE REVIEW MISSED — a LIVE use of the old detector

`vix1_manage.structure_broken` calls `find_swing_points(bars, _SWING_N)` with **n=3 on 1-minute
bars** to decide whether to **exit a live trade**
([vix1_manage.py:101-109](../../signal_platform/strategies/vix1_manage.py#L101)). That is the
delayed detector touching money. On M1 the lag is 3 minutes, which may well be acceptable — **it has
not been measured** — but it is a second live reader of structure that no "one source of truth"
audit has covered.

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

1. **Drop the file in `C:\Users\FSD\Desktop\vix-setups\`** and tell me the file name.
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

---

## THE LAST TREND DUPLICATE — why it cannot be fixed by re-sourcing (2026-09-13)

His instruction: *"Fix it. Trend detector is only one no duplicate. Before anything, you need to
check what it does well so that you only remove the duplicate trend part only to enable it to
coordinate and use trend definer we have."*

**WHAT IT IS.** `vix1_regime.classify` ([vix1_regime.py:92-114](../../signal_platform/strategies/vix1_regime.py#L92))
runs the **same test** the trend-shape veto ran — last two highs, last two lows, both must step the
same way — but it **infers its own direction** instead of being told the trend's. That is the defect
measured over 4.3 years: it approved **17.1% (EUR/USD) / 15.8% (GBP/USD)** of moments while naming
the OPPOSITE direction. It still vetoes in exactly one place:
[vix1_choch.py:167-170](../../signal_platform/strategies/vix1_choch.py#L167), asking *"what kind of
market did this turn come out of?"* — his rule: *"if the break is… arising from a choppy or a ranging
market we don't trade."*

**WHAT IT DOES WELL — measured first, as he asked.** At the 449 / 162 / 64 change-of-character
moments where that veto runs:

| | EUR/USD | GBP/USD | XAU/USD |
|---|---|---|---|
| the classifier and the trend definer agree | 69% | 83% | 69% |
| classifier says TREND, definer does **not** | 10 | 0 | 0 |
| definer says TREND, classifier does **not** | **127** | **27** | **20** |

So it is almost never looser — its entire unique effect is refusing **174 turns** out of markets the
trend definer calls trending, which it labels almost all "chop".

**THE ATTEMPT, AND WHY IT WAS REVERTED THE SAME DAY.** Swapping the yes/no to the trend definer and
keeping `classify` only to NAME the refusal was built and tested. The rule then fires **2% / 0% / 0%
of the time** — effectively deleted.

**THE REASON IS STRUCTURAL, and it is the finding worth keeping: a change of character only happens
when there IS a trend to break.** So "was the market trending before the break?" is very nearly
tautological at that moment — the definer almost always says yes. The definer cannot answer this
question, not because it is worse, but because the question is not the one it asks.

**SO THE CLASSIFIER HAS BEEN STANDING IN FOR A RULE THAT WAS NEVER BUILT.** His rule names two
things — *choppy* or *ranging*. His chop definition exists in his own words and is still unbuilt
(`OPEN.md` D42): *"it can be trending but prints 1 red volume candle then prints a bullish candle,
meaning it has no specific group of candles in succession"*. `classify`'s "chop" is not that; it only
means the last two highs and lows disagreed.

**CONCLUSION: this duplicate cannot be removed by re-sourcing — it can only be removed by building
his actual chop rule and putting that in its place.** Until then, removing it deletes a protection he
asked for, and keeping it leaves the second trend reader he rejected. **Nothing was changed; the
suite is green and the decision is his.**

---

## HIS SIX TRADEABLE CHARTS — the chop boundary was measured against them, and there is no boundary

**13 Sep.** He sent six EUR/USD H1 charts of markets he WOULD trade, to pin the other side of the
line: *"Some of them you might find to be having momentum candles that dont qualify. If you do focus
on the ones that qualify. I randomly selected them. Also they are from one pair but i would do the
same in the remaining 2 pairs."*

**HOW IT WAS MEASURED, so the marks were not guessed from pixels.** Each chart's date range was read
off its own x-axis, and **every bar inside that range where VIX.1 actually finds a setup** — a trend
plus a qualifying momentum candle the trend's way — was measured. **39 setups.** Harness:
`his_tradeable_windows.py` (this session's scratchpad).

**THE TRAIT TESTED IS THE ONE HE NAMED** — *"a mixture of big bodies, small bodies"*: how often a
body is more than double, or less than half, the one before it (`vix1_tradeable.choppiness`, `size`).

    12 candles   his tradeable 4-10    his choppy 7-8      OVERLAP
    24 candles   his tradeable 9-16    his choppy 15-17    OVERLAP
    48 candles   his tradeable 24-32   his choppy 30-34    OVERLAP

**IT DOES NOT SEPARATE THEM, AND THE EARLIER RESULT THAT SAID IT DID WAS SMALL-SAMPLE LUCK.** On only
three tradeable examples it read 9-11 against 15-17 and a line at 15 looked clean. With 39, his
31 Jul and 18 Jun setups score exactly as mixed as his choppy charts. **A line at 15 would refuse
markets he trades.**

**The runs trait fails in the opposite direction.** His 03 Aug choppy chart has LONG runs (`short`=3)
while his tradeable setups run 14-15 — the reverse of *"one or 2 candles up then down"*.

**SIX MEASURED IDEAS HAVE NOW FAILED** (five direction-based, plus this one on candle character).
Counting how often the market changes its mind does not tell his choppy charts from his tradeable
ones, because by every count they sit in the same range. **The next step is not a seventh count.**

---

## HIS HEAD-COUNT TEST — and the measuring bug that wasted six attempts

**13 Sep, after six failed measures, he stated the test plainly:**

> *"Just test how the candles are mixed as bullish, bearish, small body, big body and long wicks
> because a trending market that I trade if it is a downtrend will print bearish candles most of the
> time... It is a test of counting how many men do we have then we realize this group has 7 men and 3
> women and then we say that is men's group, and if we have 2 boys, three girls, 2 men and 2 women,
> that is a mixed group so you cant say it is mens group which is the same as you cant tell the
> direction and intention of the market hence choppy."*

**HE IS DESCRIBING A HEAD COUNT. EVERY ONE OF MY SIX MEASURES COUNTED CHANGES.** `GRGRGRGRGR` and
`GGGGGRRRRR` have the SAME head count and opposite flip counts — they are unrelated questions, and
`choppiness()` (`vix1_tradeable.py:278-321`) asks only the flip one, four times over.

### TWO BUGS IN MY OWN MEASURING, both found today

**1 — THE GOOD SIDE WAS CONTAMINATED, and this is why six traits in a row "overlapped".** He marked
candles on six charts. I could not read those marks off the pixels, so I substituted *"every bar in
that chart's date range where VIX.1 finds a setup"* — all 39. **VIX.1 firing in chop IS THE BUG
BEING HUNTED**, so that sample contained the very thing it was meant to exclude. The two sides were
partly the same markets. **Never again compare his marks against what the code fires on.**

**2 — "BIG BODY" WAS DEFINED AGAINST THE SAME 12 CANDLES** (at or above their own middle body). That
forces ~half of any window to be "big" and half "small", so no single kind could ever dominate, and
the four-kind count read 25-50% in every market on earth. An artefact I built in. Fixed: "big" is
now the middle body of the last 100 hours — the steady yardstick the momentum rule already uses.

### WITH BOTH FIXED, AND HIS OWN MARKS ON BOTH SIDES

His nine GBP/USD candles (10-11 Sep), his XAU/USD 10 Sep 18:00 and his EUR/USD 03 Sep, against the
five regions he circled today plus his three 2026-09-04 choppy marks. **The last 12 candles, counted
his way:**

    XAU/USD  10 Sep 18:00     7 big bear · 2 big bull · 3 small bear        HIS "7 MEN AND 3 WOMEN"
    EUR/USD  03 Sep 13:00     7 big bull · 1 big bear · 3 small bear · 1 small bull    a group
    EUR/USD  03 Sep 08:00     6 big bull · 1 big bear · 4 small bear · 1 small bull    a group
    GBP/USD  10 Sep 18:00     6 big bear · 1 big bull · 2 small bear · 3 small bull    a group
    ---------------------------------------------------------------------------------------------
    GBP/USD  11 Sep 08:00     4 big bear · 4 big bull · 3 small bear · 1 small bull    MIXED
    GBP/USD  11 Sep 07:00     3 big bear · 4 big bull · 3 small bear · 2 small bull    MIXED
    GBP/USD  11 Sep 15:00     3 big bear · 4 big bull · 3 small bear · 2 small bull    MIXED
    GBP/USD  11 Sep 01:00     3 big bear · 3 big bull · 4 small bear · 2 small bull    MIXED
    GBP/USD  10 Sep 10:00     2 big bear · 2 big bull · 6 small bear · 2 small bull    MIXED

**HIS TEST WORKS — AND IT DISAGREES WITH SOME OF HIS OWN MARKS.** It names the group cleanly on gold,
on EUR/USD 03 Sep and on the strongest GBP/USD candle. On five of his nine GBP/USD marks it returns
his own textbook mixed group — *"2 boys, three girls, 2 men and 2 women"* — several with MORE bullish
candles than bearish behind a SELL.

**That is Setup 1**, the very window where he says all nine candles were wrongly refused. So his chop
rule and his momentum complaint point at the same market in opposite directions. **ONLY HE CAN
SETTLE THIS — do not pick a side, do not tune a number to make both pass.** The open question for
him: on GBP/USD 10-11 Sep, was the market a clean group he could read, or was it messy but taken
anyway because the change of character had already happened?

**NOTHING WAS CHANGED.** The chop rule is still unbuilt and unwired (`vix1_tradeable.market_not_choppy`).

---

## HIS CHOP IS REAL AND NOW MEASURED — but the tell that sees it coming is still missing

**13 Sep, with `Guarantee.png` — the FIRST market he has circled and called GOOD** (EUR/USD, the
11 Dec 2025 rally, immediately before the chop he circled on another chart):

> *"Other than being mixed, in those candles i have circled you cant tell there next move explicitly
> like 'if i get a momentum candle... there is a higher probability that the next candle is also a
> momentum candle because it printed one candle that closes below or at the bottom of the previous
> candle close like candles would do in a directional and a predictable trend'."*

### 1. HIS CLAIM IS CONFIRMED. His circles mark a market where momentum leads nowhere.

    after a momentum candle, did the next candle carry on the same way?
        inside his five circled regions     7 of  26   =  27%
        all EUR/USD, 4.3 years           1215 of 2529  =  48%

    at 1.5x normal — nearer the size of the candles he himself marks — did one big candle
    get followed by another the same way?
        inside his five circled regions     6 of  67   =   9%
        inside his ONE good circle          3 of  11   =  27%
        all EUR/USD, 4.3 years           1838 of 8848  =  21%

**9% against a 21% base is about 2.4 standard deviations below — roughly a 1-in-120 fluke.** His eye
is reading a real property. **THIS IS THE FIRST HARD TARGET THE CHOP WORK HAS EVER HAD**: any future
candidate rule can now be scored against "does it find the markets where momentum does not lead
anywhere", instead of against my guesses about his screenshots.

### 2. HIS SIGN DOES NOT PREDICT IT. Measured, and the answer is flat.

His sign is candles stepping past each other — each closing beyond the previous one's close, or
beyond its far edge. Over **6,798 momentum candles on both pairs**, grouped by how strong that sign
was in the preceding 12 candles:

    longest chain behind it       1 or less  2    3    4    5 or more
       next candle carried on       48%     49%  47%  46%   51%     (EUR/USD)
                                    49%     49%  47%  49%   47%     (GBP/USD)
    share closing beyond the edge   0-19%  20-29  30-39  40-49  50%+
       next candle carried on        47%    46%    48%    53%    51%  (EUR/USD)

**Flat at 46-53% whatever it says.** The stepping pattern describes what a good market looked like
AFTERWARDS; it does not see the next hour coming. Same for the head count, the body-versus-wick
share and the clean-group length — all measured, all flat or overlapping.

### 3. A SIDE FINDING THAT BEARS ON ISSUE 1 — his size standard versus the code's

His picture is that momentum candles arrive together. How often one big candle is followed by
another the same way, by size bar:

    1.2x normal  24%      2.0x  17%      3.0x  11%
    1.5x normal  21%      2.5x  14%   <- the bar VIX.1 uses today

**At the code's 2.5x, back-to-back momentum is rare (13-14%) even in healthy markets; at 1.5x —
nearer the candles he marks — it is 21%.** With VIX.1's full live test the next candle qualifies only
**4-5% of the time in every market**, good or choppy, so his literal wording cannot be a chop signal
at the current bar. **This is evidence FOR his position on Issue 1, not proof — his ruling still
stands open and the number has NOT been changed.**

### WHAT IS STILL MISSING

A **forward-looking** tell. Everything measured so far reads the last 12-48 candles and none of it
predicts the next hour. **He has now drawn exactly ONE good region** (`Guarantee.png`) against five
bad ones — the good side is still where the evidence is thin.

**NOTHING WAS CHANGED.** The chop rule remains unbuilt and unwired.

---

## THE CHOP RULE WAS BUILT TO HIS WORDS, TESTED, AND IT FAILS — `vix1_chop.py`, NOT WIRED

His instruction: *"Why dont you build that logic, then test it and then we see where we are?"*
Built in full (`signal_platform/strategies/vix1_chop.py`), from his words only:

    DOMINANCE   do most candles go the same way?        "7 men and 3 women" -> his own 70%
    CONSISTENCY are the ones that do a full size?       "a mixture of big bodies, small bodies"
    STEPPING    do they close past each other?          "closing on top of each other"
    PULLBACK    cut off the end before any of it        his explicit warning, and he was right

**HIS PULLBACK WARNING WAS THE DIFFERENCE.** *"I know you can create something that will end up
rejecting a good [move] and a pullback because pullback has mixed candles that dont close on each
other."* Setting the live pullback aside — using `vix1_retracement.pullback_since`, the strategy's
ONE pullback reader — changed every number in the calibration. It also exposed two bugs of mine:
the reader was handed the 3,000-bar window while `direction_since` indexes the 1,500-bar one (it cut
**1,474 candles** as "pullback"), and a long pullback left the count reading a market from 24-36
hours earlier. Both fixed and both documented at the code.

### THE VERDICT — it does not find the markets he circled

Across **6,798 momentum candles**, both pairs, grouped by how many signs the rule saw:

    signs         0     1     2     3    cannot say
    carried on   44%   52%   48%   46%      48%      EUR/USD
                 51%   49%   50%   47%      47%      GBP/USD

**Flat, and backwards where it moves.** Demanding 2 of 3 removes 15-16% of momentum candles; those
removed carried on **50-51%**, those kept **48%**. It refuses the slightly better moments.

On his own marks: his Guarantee rally reads 3 of 3 (right), but his **10 Dec circle also reads 3 of
3** on nine readings, and his 02 Mar circle reads 2 of 3 — the same as his own marked GBP/USD
setups. It abstains on **52%** of moments because his pullbacks routinely run longer than the window.

### ALSO TESTED AND DEAD — "price never gets anywhere"

The one candidate the contaminated sample could have hidden, re-run with clean marks on both sides
over 2 and 4 days: how far price GOT against how far it WALKED. His circled markets often make MORE
progress than his marked setups (circle 02 Mar 24, circle 10 Dec 32, against 2-15 at his GBP/USD
marks). A line keeping all his marks refuses 0-8% of his circled windows. Dead.

### WHERE THIS LEAVES IT

**His circled markets ARE measurably worse** — momentum leads nowhere there, 27% against a 48% base,
about 2.4 standard deviations. That is settled. **But nothing readable in the candles predicts it**:
six flip counts, the head count, body-versus-wick share, clean-group length, the stepping chain, his
full three-sign rule, and now progress-versus-travel. Eight ideas, all flat.

**The pattern across all eight: the badness is real but it is not in the shape of the last 12-96
candles.** VIX.1 suite 48 of 48 green. Nothing is wired; every market he circled still trades.

---

## ⚠ CORRECTION — THE YARDSTICK I SCORED NINE EXPERIMENTS AGAINST IS MOSTLY NOISE

**I overstated this and it needs correcting plainly.** I told him his circled markets were confirmed
bad — *"about 2.4 standard deviations, roughly a 1-in-120 fluke"*. That was wrong, in two ways.

**1. The 26 candles were never 26 independent observations.** They sit inside FIVE stretches of
market, a few days each. Momentum candles hours apart in the same stretch share the same conditions,
so the real sample is nearer five than twenty-six, and a calculation treating them as independent
overstates the certainty badly.

**2. Scored against a proper control, it is about 1 in 40, not 1 in 120.** Five RANDOM stretches of
EUR/USD history the same sizes as his, drawn 2,000 times, came out at 27% or lower **2.6%** of the
time. Interesting; not settled.

**3. HIS FIVE REGIONS DO NOT AGREE WITH EACH OTHER:**

    circle 02 Mar     0 of 6 carried on (  0%)   worse than 99% of all 4-day stretches
    circle 10 Dec     1 of 6            ( 17%)   worse than 97%
    circle 04 Dec b   1 of 5            ( 20%)   worse than 95%
    circle 04 Dec a   1 of 3            ( 33%)   worse than 79%
    circle 16 Dec     4 of 6            ( 67%)   BETTER than 91% of all stretches

**One of the five markets he circled has better-than-average follow-through.**

**4. AND THE NATURAL SPREAD IS ENORMOUS.** Across 1,971 four-day stretches of EUR/USD:

    5% of stretches  <= 22%     50% <= 50%     90% <= 67%

A 4-day stretch at 27% is **not rare — 9% of all stretches are that bad or worse.** So "did the next
candle carry on" over a few days is dominated by chance.

**THIS EXPLAINS ALL NINE FLAT RESULTS AT ONCE.** Every idea was scored against a target that is
mostly randomness, so every idea had to come back at 48%. The nine experiments do not prove the ideas
are wrong — they prove the yardstick cannot tell a good idea from a bad one.

**WHAT IS STILL TRUE:** he can see something in those charts, and three of his five regions really
are in the worst few percent of all stretches. **WHAT IS NOT ESTABLISHED:** that "the next candle
carries on" is what he is seeing.

**THE NEXT STEP NEEDS HIS APPROVAL AND HAS NOT BEEN TAKEN.** The honest yardstick is what actually
costs money in those markets — whether a VIX.1 trade taken there reaches its target or its stop.
**That is a backtest and his rule is absolute: never without his approval.** Nothing further will be
measured on this until he says so.

**A NOTE ON THE HARNESS:** `target_is_real.py` printed "carried on 100.0% overall" — that header line
miscounted (it summed every row instead of the ones that carried on). The distribution, the per-region
figures and the control are computed separately and are correct; the overall figure is **48%**.

---

## DOES THE CHOP DETECTOR DETECT CHOP? — audited 2026-09-14. NO.

His question, after the session drifted into the backtest: *"whether the chop logic you created is
working and the markets it detected as chop were actually choppy"*. Two halves, both measured on
EUR/USD with `vix1_chop.read` exactly as built (12 candles, live pullback set aside, "choppy" =
fewer than 2 of his 3 signs).

### HALF 1 — HIS FIVE CIRCLED CHOP MARKETS, hour by hour (201 hours in total)

    02 Mar 2026   33h   refused   0   called clean 26   could not judge  7
    16 Dec 2025   48h   refused  13   called clean  0   could not judge 35
    10 Dec 2025   46h   refused   0   called clean 12   could not judge 34
    04 Dec a      32h   refused   0   called clean 25   could not judge  7
    04 Dec b      42h   refused   8   called clean 22   could not judge 12
    TOTAL        201h   refused  21   called clean 85   could not judge 95

**It would have stopped trading in 21 of 201 hours of his chop — about 10%.** It called 85 hours
clean, and in 95 more it could not judge at all, which ALLOWS. It caught one of his five markets
(16 Dec) and missed four. His one GOOD circle (the Guarantee rally) it correctly called clean.

**WHY IT MISSES THEM — AND A SUSPICION OF MINE THAT WAS WRONG.** I suspected the pullback exemption:
chop is short legs plus pullbacks, and the rule counts the leg before the pullback. Measured inside
his circles it is NOT that — readings with a pullback set aside came out clean 80% (74/93), readings
with nothing set aside 85% (11/13). The cause is the one already on record: **twelve candles is too
short to see a band that takes days.** Inside his chop regions there are 12-hour stretches that are
genuinely one-directional, full-sized and stepping, and the rule reports them faithfully.

### HALF 2 — WHAT IT FLAGS ON ITS OWN, and whether those markets are choppy

Across 23,000 hours of EUR/USD it could judge only **45%**. Of those: 0 of 3 signs 5%, 1 of 3 22%,
2 of 3 54%, 3 of 3 19%. Six of its most confident CHOPPY calls and six CLEAN calls were drawn to
`C:\Users\FSD\Desktop\vix-chop-audit\` for him to judge — **YELLOW = the 12 candles actually counted,
BLUE = the pullback set aside first.**

**A DRAWING BUG OF MINE, FIXED BEFORE HE SAW THEM.** The first drawing shaded the LAST 12 candles,
which the rule does not count whenever a pullback is set aside — wrong on 8 of the 12 charts.
Redrawn by `chop_redraw.py` with both bands.

**My own reading of the corrected charts, offered to him as a reading, not a verdict — his eye
decides what chop is:** every CLEAN call is a genuine one-directional run. Of the CHOPPY calls,
28 Mar 2024, 15 Oct 2024, 05 Nov 2025 and 05 Mar 2026 are small, mixed, sideways candles; 07 Nov
2022 is a pause at the top of a strong rally; **23 Aug 2023 is a sharp breakdown the rule got wrong**
(half the counted candles were the drift up before the drop).

### VERDICT

**When it says choppy it is mostly looking at sideways candles — but it almost never says it where he
says it.** 10% of his chop hours refused, 47% not judgeable. It stays unwired (`vix1_chop.py`), D42
stays open, and nothing about what trades has changed.

---

## MAKING THE CHOP MODULE WORK — 2026-09-14

**Deleting `vix1_chop.py` was wrong, and he said so:** *"So if its not working you delete it instead
of making it to work???"* The deletion had been committed and pushed by the end-of-turn autocommit
(`92765b0`); the file is restored (`f824407`). **A module that fails its test is work in progress,
not dead code.**

**THE MEASURED CAUSE OF THE FAILURE:** it read 12 candles, and his choppy markets are sideways bands
lasting 1.5-4 days. So the window was lengthened and his band idea added, judged on his marks only —
201 hours inside his five circles as CHOP, and the Guarantee rally plus his 13 marked candles as GOOD.
"Full-sized" is measured against the middle candle of the last 100 hours (the window's own middle
candle forces half of every window to count as full-sized — an old mistake, not repeated).

    24 candles, no pullback set aside
      fewer than 2 of 3 signs          02 Mar 55%  16 Dec 65%  10 Dec 67%  04a 62%  04b 76%   all 66%   good 5/30
      <2 signs OR came back >= 6       02 Mar 58%  16 Dec 77%  10 Dec 83%  04a 81%  04b 88%   all 78%   good 6/30

    24 candles, live pullback set aside first (his rule)
      fewer than 2 of 3 signs          02 Mar 39%  16 Dec  0%  10 Dec  7%  04a 94%  04b 62%   all 36%   good 4/30
      <2 signs OR came back >= 6       02 Mar 39%  16 Dec  0%  10 Dec  7%  04a 94%  04b 81%   all 40%   good 4/30
      (45 of the 201 hours could not be read — the "pullback" was longer than the window)

**Compare the old module: ~10% of his chop hours, one market of five.** Longer windows were measured
too (36, 48, 72, 96 candles) and none beat 24.

**EVERY GOOD READING FLAGGED IS GBP/USD 10-11 SEP.** His Guarantee rally, the XAU/USD sell and
EUR/USD 03 Sep all pass. That GBP/USD window is the one his own head count already called a mixed
group on 5 of 9 marks, and where the trend read UP until 11:00 then "no trend".

**THE DECISION THAT IS HIS: the pullback rule halves the detector.** Inside chop the pullback reader
treats the sideways drift as one long pullback, so it is cut away or runs past the window, and 16 Dec
and 10 Dec vanish. It buys one fewer GBP/USD flag. Not decided here.

**Nothing is wired. The candidate's most confident calls are drawn for him in
`C:\Users\FSD\Desktop\vix-chop-24h\` — judged by his eye BEFORE any change to the module.**

### THE 24-CANDLE CANDIDATE AGAINST THE WHOLE MARKET, AND AGAINST MONEY — 2026-09-14

Catching 78% of his chop means nothing until it is compared with how often the same version fires on
an ORDINARY hour. Every hour of EUR/USD (26,860) and GBP/USD (42,740), 24 candles, no pullback set
aside:

    version (choppy when...)        his chop   his good   ALL EUR/USD   ALL GBP/USD
    fewer than 2 signs                 66%        17%         53%           52%
    fewer than 1 sign                  13%         3%          8%            8%
    came back >= 6                     32%         7%         13%           14%
    came back >= 8                      8%         3%          4%            4%
    <2 signs OR came back >= 6         78%        20%         58%           58%
    <2 signs AND came back >= 4        31%         3%         20%           21%
    0 signs OR came back >= 8          20%         7%         11%           11%

**The head-count versions call HALF OF ALL HOURS choppy** — 66% on his chop against 53% everywhere is
weak separation, however good 78% sounds. **His band idea alone (came back >= 6) is the most
selective**: 2.4x as likely on his chop as on an ordinary hour, 7% of his good readings.

**AND ON THE 220 FILLED TRADES OF THE APPROVED BACKTEST** (no new simulation — what each version
would have said when they fired):

    version (refuse when...)       REFUSED                                KEPT
    fewer than 2 signs             117  +16.5R  avg +0.141R  full stops 26%   103   +3.4R  avg +0.033R  33%
    <2 signs OR came back >= 6     126  +14.8R  avg +0.117R  full stops 26%    94   +5.1R  avg +0.054R  33%
    <2 signs AND came back >= 4     53   +4.7R  avg +0.089R  full stops 28%   167  +15.2R  avg +0.091R  29%
    came back >= 6                  37   +3.3R  avg +0.089R  full stops 30%   183  +16.6R  avg +0.091R  29%
    came back >= 8                  12   +6.0R  avg +0.498R  full stops 17%   208  +13.9R  avg +0.067R  30%
    0 signs OR came back >= 8       27   +5.1R  avg +0.188R  full stops 26%   193  +14.8R  avg +0.077R  30%
    fewer than 1 sign               17   +1.8R  avg +0.106R  full stops 29%   203  +18.1R  avg +0.089R  29%

(spread per trade 0.94R — a group of 40 trades has a standard error of about 0.15R)

**No version removes losing trades.** The head-count versions refuse the BETTER half — the combined
one would have thrown away +14.8R of +19.9R. **The band idea alone (came back >= 6) is neutral**: the
37 trades it refuses did exactly as well as the 183 it keeps.

**Status: nothing wired. Charts of the combined version's confident calls are in
`C:\Users\FSD\Desktop\vix-chop-24h\`. Decision is his:** which version, and whether his pullback rule
applies (it halves detection inside chop).

---

## 2026-09-14 — HIS TWO INSTRUCTIONS, BUILT

> *"Build it and then dont enable it. We will have to continue working on it. Then enable pullback to
> uptrend the same way we have a pullback after first trend run in the downtrend."*

### 1. THE CHOP DETECTOR — built, NOT switched on

`vix1_chop.py` is his band idea on its own (option A, recommended and not objected to): over the last
24 closed candles, draw a line at the highest high and one at the lowest low; choppy when price CLOSES
back across the middle of them 6 or more times. No pullback set aside (measured: it halves detection
inside chop — still his decision). Nothing calls it; `test_chop_band.py` fails the day something does.
Numbers already recorded above: 32% of his chop hours, 13-14% of ordinary hours, 7% of his good
readings, neutral on money.

### 2. A TURN UP MUST NOW PROVE ITSELF, LIKE A TURN DOWN

**Where the rule lived — every enforcement point, read before changing:** `vix1_choch.py:128-131`
(`if not bullish: return None`) was the one-sided refusal; `vix1_preclose._could_trade` copied it in
two places (the forming-bar branch for a candle turning the market up, and `st.pending == 1`).
`vix1_bias` has no second copy — a pending turn reaches only `choch_entry`.

**What changed:** `vix1_choch._EXEMPT_UP_TURNS = False` plus `exempts(bullish)`, the single place the
decision is made; `choch_entry` refuses a pending turn in either direction unless exempt;
`_could_trade` asks `exempts` in both places. **Switched off, not deleted** — after the lesson of the
same day, and so restoring it is one line.

**WHAT IT COSTS, measured on real EUR/USD and GBP/USD bars (a count of setups, not a backtest):**

    the shortcut produced, in the last 12 months:   EUR/USD 36 buys (3.0/month)   GBP/USD 32 (2.7/month)

    his 28 Jul 2026 break    OLD: BUY at 17:00 and 18:00 (his clock) via the shortcut
                             NOW: nothing until 29 Jul 16:00, a trend-route BUY that ALREADY existed
    his 03 Sep 2026 setup    OLD: BUY at 14:00, 15:00, 19:00 via the shortcut
                             NOW: nothing until 07 Sep 01:00, a trend-route BUY that ALREADY existed

**So those trades are LOST, not delayed.** Nothing new appears once the pullback turns back — the
later buys were already being signalled with the shortcut on.

**Proved, not assumed:** `test_choch_bearish_proof.py` now walks his sequence stage by stage through
the real `detect_bias` in BOTH directions (no trade while it breaks and runs, none in the pullback, a
trade once it turns back), and shows the switch restores the old upward exemption and can never open a
turn down.

---

## ISSUE 1, EXPLORED 2026-09-14 — can the 2.5x requirement be held at the pip level it had before the move?

**His question:** *"is there a way we can keep it at the previous pips as a constant? Because the one
that changes dynamically can work against us when 2.5 increases, it leaves money on the table."* His
context: last week's signals were not sent because the 100-hour median rose during the move.

**HOW IT WAS MEASURED.** The live size test was copied only after it matched `is_momentum_candle` on
**18,000 of 18,000** checks (GBP/USD, EUR/USD, XAU/USD). Every version keeps the 4-month floor, the
bigger-than-previous rule and both shape tests untouched; only the 100-hour requirement changes.
Counts of candles and signals only — no trade scored.

**THERE ARE THREE SIZE TESTS, NOT ONE** (`vix1_momentum.py:198-206`): 2.5x the median body of the last
100 hours (the one that rises during a move), 2.12x the median of the last 2,000 hours (moves slowly),
and bigger than the previous candle.

### HIS NINE GBP/USD SELLS OF 10-11 SEP (his clock)

    13:00  9.9p  refused ONLY by the rising 100-hour test (needed 11.0; 9.2 before the move) — trend still read UP
    14:00  9.8p  refused: not bigger than the previous candle
    15:00 17.6p  refused: shape (body under half its range)
    19:00  6.9p  refused: 4-month floor (9.5)
    21:00  7.5p  refused: 4-month floor
    04:00  6.6p  refused: 4-month floor (9.3)
    10:00  8.3p  refused: 4-month floor
    11:00 10.3p  refused ONLY by the rising 100-hour test (needed 11.6; 9.2 before the move) — trend AGREED
    18:00  8.6p  refused: 4-month floor

**The rising median was the sole reason for 2 of the 9. Five are below the 4-month floor**, which no
version of the 100-hour test touches — that is ISSUE 1's standard question (2.5x from his 87 trades vs
the 1.5-2.3x candles he marked), still his to rule on. During the move the 100-hour requirement rose
from 9.2 to 11.6 pips (+26%).

### THE VERSIONS

* **A FIXED PIP NUMBER.** What today's rule demanded, by quarter: GBP/USD middle 10-17 pips, 6 to 39
  within a quarter; EUR/USD middle 7-16, 5 to 34. Normal size doubles and halves across quarters, so a
  constant is too strict in quiet quarters and admits ordinary candles in busy ones.
* **CAP48 — never demand more than the lowest 100-hour requirement of the previous 48 hours.** Can only
  loosen (never refuses a candle today passes). A move cannot raise its own bar for two days; the bar
  still follows the market down and catches up after 48 hours. The 4-month floor is untouched, so the
  10 Aug 7.5-pip dead-week candle stays refused.
* **Frozen at the trend's start** — depends on the trend reading, which was ~5 hours late on 10 Sep; it
  rescued only the 13:00 candle, which had the trend against it.
* **Delayed yardstick (the 100 hours before the last 100)** — swaps rather than adds: GBP/USD +68 / -61
  candles over 12 months, EUR/USD +63 / -47.

### WHAT CAP48 WOULD HAVE DONE LAST WEEK — through the real `detect_bias`

    GBP/USD Fri 11 Sep 11:00  today: no signal (too small)      CAP48: SELL via trend
    XAU/USD Fri 11 Sep 06:00  today: no signal ($18.32 < $18.52) CAP48: SELL via trend
    GBP/USD Thu 10 Sep 13:00  today: no signal                  CAP48: no signal (trend read up)
    EUR/USD                   no candle affected

**Twelve months, candle level:** GBP/USD +67 momentum candles (5.6/month, about +11%); EUR/USD +53
(4.4/month, about +9%). Gold's file covers under a month here, so no yearly gold figure is quoted.
**Not yet measured:** how many of those become SIGNALS over a year (a count, allowed), and whether the
extra signals make money (a backtest — needs his approval). **Nothing was changed.**
