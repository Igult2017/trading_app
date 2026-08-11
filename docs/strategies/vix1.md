# VIX.1 — the Volume Strategy

> ## ⚠️ READ [vix1-architecture.md](./vix1-architecture.md) FIRST
>
> That file holds the SHAPE — the module map, the pipeline, the entry/SL/TP rules, and the KNOWN OPEN
> DEFECTS (including the pending redesign that is blocked on your trade data, and the fact that the R
> ratchet is ADVICE ONLY and moves no broker stop). **This file holds the RULES** — your words and the
> playbook's — and the fix log.


Source: the "Volume Strategy" playbook (`VIX11.pdf`, 7pp, user's Desktop — not in the repo).
Pairs: **EUR/USD, GBP/USD**. Sessions: **London / NY / Asian** (all three). Phase 1 = signals only
(DM); Phase 2/3 pending.

---

## THE RULES — settled with the user, do not re-derive

Each of these was corrected at least once. If a change would contradict one, it is wrong.

### TREND CASCADE — 1HR first, 4HR only as a fallback (changed 2026-07-20)
> "We use 4HR only when trend is not clear in 1HR. If we see a momentum candle in 1HR and trend is
> also clear there, we go with it. If we have volume in 1HR and can't see the trend clearly there, we
> go to 4HR to find out if that momentum is because of a trend in 4HR or not."

The **1HR trend is PRIMARY**. The 4HR is consulted **only when the 1HR trend is unclear**. The MOMENTUM
candle is always the 1HR; the 1HR also gives us **the lines**. **We trade TRENDS ONLY — no ranging
markets** (user 2026-07-20: *"if we don't see a trend in 1HR we go to 4HR, but if we don't see it there
either we don't take the trade… a range→trend transition is only taken once the trend is CONFIRMED"*).
`detect_bias(h1, h4)` returns one of:
Momentum-led: the **freshest 1HR momentum candle leads**, then we ask on what grounds we may take it,
in this order:
- `trend`  — momentum runs WITH a clear 1HR trend
- `trend4` — 1HR trend UNCLEAR, momentum runs WITH a clear **4HR** trend (the fallback)
- `choch`  — momentum CLOSED through the 1HR structure the OTHER way (a lower high broken up / a higher
  low broken down) — a reversal. **Decoupled from `clear_trend`** (2026-07-20): a CHoCH is exactly when
  the slope reads flat, so gating it behind "clear trend" made every such reversal escape
- `choch4` — 1HR trend unclear, momentum closed through the **4HR** structure the other way
- **none of these → None (NO TRADE).** The old `range` origin (bare breakout, no confirmed direction)
  is REMOVED. Fixing CHoCH lifted combined trend+CHoCH recognition of the user's 87 real trades from
  **70% → 89%** (the residual ~11% is timezone/no-price matching noise in the log, not a detector miss).

(An earlier pass made 4HR the *only* trend source — wrong; reverted to this cascade.) H4 added to
`candle_counts` (120 bars). `broke_structure` takes an explicit close so choch can test a 1HR close vs
the relevant swings. The trend TF **never puts a clock on the entry** — it can be ready for hours while
the 1M is not. The wait is **open-ended**; a bias flip ends a setup, a timer never does.

### HOW the trend is detected — SLOPE of the leg, not the last two swings (changed 2026-07-20)
> User, shown a plain EUR/USD downtrend the code called "no trend": *"that is a fucking downtrend… it
> ranged just a little within the downtrend, which is normal behaviour of a trend."* He was right.

`clear_trend` used to compare **only the last two swing highs and last two swing lows** (HH+HL /
LH+LL). It was blind to everything before the last two pivots, so a **normal pullback** — which puts the
two freshest swings side by side, or prints a temporary higher low inside a downtrend — made it report
**"no trend"** and threw the whole trend away. Measured on the user's 87 real trend trades it saw the
trend at only **47%**. It now reads the **least-squares slope of the closes over the recent leg**
(`_TREND_LOOKBACK = 36` bars) and requires the net drift to clear the leg's own noise
(`|drift| ≥ 2.0 × avg bar range`). This sees a trend **through** a consolidation — real-trade
recognition **47% → 70%**, coverage a sane 67% of bars (not always-on). `broke_structure` (choch) still
uses swing structure — it is a level-break test, which genuinely *is* a pivot question.

### The line is for CLARITY AND ACCURACY — not invalidation
> "The 1HR line consideration in 1M is just for accuracy during entry and to ensure we dont enter at
> the wrong point."

Price crossing back over the line does **NOT** mean the idea was wrong. (I assumed "line = where
we're wrong" twice and built on it twice. It isn't.)

### ONE line — line 2 DELETED FROM THE CODE (2026-07-26)
| | Where | Job |
|---|---|---|
| **THE LINE** | 1st momentum candle's **close** (== candle 2's open) | **gates the entry** — where an entry belongs |

> **"I dont know where the second line is coming from i dont use second line."** — user, 2026-07-26

This doc previously described a "LINE 2" (the open wick's height off line 1) with a quote attributed
to the user about it adjusting the SL. **That attribution was wrong and the concept is not his.** It
was my construction, and the measurement that appeared to justify it was noise: the two lines sit a
median **2.6 pips** apart, so "his stop is 2.3p from line 2 vs 3.8p from line 1" cannot distinguish
them at all. Do not re-derive it. The code still computes `wick_line` (`draw_lines`) and uses it as
the SL anchor and the alignment tolerance band — that is **unverified scaffolding, not his method**,
and it is the next thing to reconcile with him, not to defend.

**DELETED from the code on 2026-07-26** (user: *"that line 2 is BS. It has no work. Delete it"*).
`draw_lines` is now `draw_line` and returns one float. It had THREE jobs, not the one the docstring
claimed: it decided alignment, it anchored the stop, and it killed a pullback that retraced past it.

**Why its removal is a correctness fix, not a preference.** Line 2 was line 1 offset by the momentum
candle's OPEN wick — and on a bear momentum candle the open wick IS the counter-wick, the quantity
the momentum filter forces toward zero (≤25% of range, ≤15% for an A grade). Measured over 1,518
real momentum candles the gap was a **median 2.0 pips** (52% inside 2p, 6% exactly zero), so the
stop was the wick plus a pip — a **~3 pip risk on a pair that spreads 1-2**. Worse, it scaled the
wrong way: **A-grade candles got a 2.2p stop, weaker ones 6.5p.** The better the setup, the tighter
its stop. That single fact explains the 3-9 pip stops against his 15, the shake-outs, and why
nothing survived a 1-pip spread.

The stop now comes from `vix1_roi` — the nearest 1M REGION OF INTEREST beyond the pullback, which is
his own rule in his own words and had been **imported but never called** for weeks after the line-2
anchor displaced it. `regions()` no longer seeds itself with the wick line (being the counter-wick it
won "nearest region" nearly every time, which is how it collapsed the stop even via that path).

**MEASURED (deleting line 2 + restoring the ROI stop), GBP+EUR 26 months out of sample:**
| | before | after |
|---|---|---|
| trades | 910 | 545 |
| win rate | 33.2% | **36.5%** |
| total | −3.5R | **+39.0R** |

Best out-of-sample result of the whole investigation, and it came from DELETING something. It is
still only **t = 1.33** — not significant — and at a 5.9p median stop a 1-pip spread costs ~0.17R a
trade against a +0.072R mean, so it does not survive costs. In-sample 2021 is flat (68 trades,
33.3%, +0.0R).

### Fractal vs pullback — the same shape, different roles
> "a fractal is a 1 candle pullback when the price is going a particular direction... the candle
> pullback and the price continue."
> "fractal can be between 1 candle to 4 candles so long as after that price continues. On the other
> hand the Pullback we wait for before entry is only one candle."

| | Length | What must follow | Role |
|---|---|---|---|
| **Fractal** | **1–4 candles** | price **must continue** — that is what makes it a fractal and not a reversal | marks a level; read backwards |
| **Pullback** | the **first** candle of the run | **nothing** — the stop order is the test | **the entry** |

- **NOT the Williams 5-bar fractal.** That shape barely occurs in a spike-and-return — it found no
  fractal at all in half the long-wick cases and threw real entries away (3/6 → 6/6 when fixed).
- **Fractals are 1M-ONLY.** Their whole job: confirm the opposite direction is over and price is
  aligning with the 1HR bias.
- **A fractal break is CONFIRMATION, never an entry.** The pullback is always the entry.
- A pullback may run several candles; **only the first matters** — it sits nearest the resumption.
- **The pullback candle is ANY type — doji included, no minimum size** (user 2026-07-22: "just look
  for one pullback candle of any type... so long as that pullback is not volatility candle and not
  violent candle typical of market choppiness"; re-confirmed 2026-08-07: *"make it to be pullback of
  any candle"*).

  **The ONLY disqualifier is a WHIPSAW: `range ≥ 2.5× the 1M's 14-bar avg body` AND `body < 60% of
  its own range` — both halves required.** A retrace that OPENS with one gives no entry: that is
  chop, stand aside. There is no minimum body, no body/range floor, and no body CEILING — a wide
  DECISIVE candle is conviction, and size alone never disqualifies at either end.

  **THIS RULE HAS BEEN ROUND-TRIPPED ONCE. Do not "restore" a size filter without him asking.**
  A `body ≥ 1.00× avg` / `body ≥ 60% of range` pair was added 2026-07-26 on *"I just waited for a
  PROPER pullback candle, not an insignificant candle"* and deleted 2026-08-07 when he found what it
  actually did — see the fix log. The trap is that `find_pullback` returns **None** when the first
  candle of a retrace fails, instead of falling through to a later candle in the same retrace, so a
  size filter does not skip a candle, **it skips the whole retrace**.

### The entry — always a STOP order
> "price can either align with our bias and fill us or go the opposite direction and leave without
> filling us."

Continue → it fills us along the way. Reverse → we were never in. "No trade, no risk."

### Alignment is decided by THE LINE, not swing structure
```
price OUR side of line 2?
├── YES → the 1M is with us      → wait for the pullback → stop entry
└── NO  → the 1M is against us   → the LAST fractal must break first → then the pullback → stop entry
```
Swing structure (`clear_trend`) said "not aligned" in **6 of 6** long-wick cases — a spike-and-return
inside one hour never prints the two highs and two lows it needs. `clear_trend` is now **1HR bias
only**; the 1M does not use it.

### The wick read is 1HR-ONLY
> "As for spike when observing the wick length, that is only done for 1HR candle not 1M."

### Never guess a wick — measure it live
> "we cannot guess candle wick"

Candle 2's wick is the M1 bars since the hour opened. 20s fresh, no extra fetches. **The estimate
("candle 2's opening wick ≈ candle 1's closing wick") is DEAD** — tested on ~8,500 real volume-candle
pairs: correlation **~0.2**, and real pairing beats a random shuffle by **3 points**. The medians
match (2.2p → 2.1p), which is why it looks true on a chart — both are just "a typical wick". No link
between *this* candle 1 and *this* candle 2.

### The SL is a region of interest, never a pip count
> "put our SL at a region of interest where price might pullback to in the worst case scenario…
>  any zone where the price might revisit in 1M… think of all the zones that can reverse the price or
>  act as a road block."
> "15 pips is not hardcoded… if the price is in our favor, we can even use 8 or 5 pips as SL."

**"Far from the line is an ADVANTAGE"** — the trend is confirmed. (I built a whole "GAP 1" on the
opposite assumption, because I still had *line = invalidation* in my head.)

SL = just beyond the **nearest** region on the protective side (`vix1_roi`): line 2, the last 1M
fractals, recent 1M swings, unmitigated 1M S/D zones. Both bounds are the market's, not mine:
- **floor** — structural: the SL must clear **the pullback candle's own extreme**
- **ceiling** — **one 1HR candle's range**, from "2 candles of 1HR gives 2R" → 1 candle = 1R

No region within one candle → **skip**. We never invent a stop. Measured: risk ranges 5.3–29.7p over
400 setups, 88 distinct values (a hardcoded SL gives 1).

**TP = 2R** and that is *justified, not assumed*: it IS the two-candle move the user backtested.
"Or more" is the Phase 3 trailing stop.

### Levels closed, triggers live
A **level must stay put; a trigger must be live.**
- 1HR → `closed_only()`. A forming candle's close **is the current price**, so the line would track
  price. Proven: price 1.2686/1.2678/1.2670 → line 1.2686/1.2678/1.2670.
- 1M forming bar → kept **for TRIGGERS only** (traded-past, which side of the line, stop-unfilled) —
  there, live price is the whole point. **LEVELS never read it** (fixed 2026-07-22): the pullback
  candle (its high = entry, its low = SL clearance), the fractal levels **and the fractal BREAK**
  (a break is a body CLOSE, and a forming bar's "close" is just live price — a spike that closes
  back inside must not count), and the SL regions all come from the closed slice (`wcl`). Before the
  fix the entry could snapshot a half-formed pullback candle whose edges were still moving — the
  same class of bug that shipped twice on the 1HR.

### It is a MOMENTUM candle, not a volume candle
> "VIX should use momentum candles."

Settled 2026-07-19. The playbook's "volume" means **decisive price movement**, judged on candle
shape — not participation. cTrader *does* send real tick volume on every bar and nothing reads it;
that is deliberate, not an oversight. A momentum candle answers three questions:

| | Rule | Why this number |
|---|---|---|
| **BIG** | body ≥ **2.5×** the MEDIAN body of the last 100 closed bars | CALIBRATED 2026-07-20 on **87 real GBP/USD trades**: the user's own momentum candles run **~2.7–6× median** (~14–31 pips). 2.5× captures **91%** of them; the old **4.0× captured only 60%** — it rejected 4 in 10 real setups (top-5% candles only). Selectivity lives in the trend/line/pullback gates, not here. ("bigger than the previous candle" also failed — rejected 21–23% of strong candles, admitted 24–27% below-normal, smallest 0.79 pips) |
| **BIG ENOUGH FOR THE YEAR** | body ≥ **2.12×** the MEDIAN body of the last **2,000** bars (~4 months) | Added 2026-08-10. 100 bars is only ~4 trading days and a quiet spell collapses it — on 10 Aug the requirement had sunk to **7.25 pips** and a 7.5-pip candle fired a signal. **2.12 is HIS standard**: two GBP/USD candles he named as his minimum (06-Aug 14:00/15:00, bodies **11.3p** and **12.4p**) ⇒ 11.0 / 5.20 = ×2.12; the equally-rare EUR/USD body 8.4p / 3.95 = ×2.13 — **one number for both pairs**. Asks ~11.0p GBP/USD and ~8.4p EUR/USD today; binds only 14–16% of the time; costs ~1.7 candles/month/pair |
| **CLEAN** | body ≥ **50%** of its own range | 75%→60% (2026-07-21), then **60%→50% (2026-07-25)** on 22 of his own trades: his thinnest real momentum candle was **51% body** and it hit TP; the 60% gate rejected 3 of those 22. *(This row said 60% until 2026-08-10 — the code has been 50% since 07-25.)* The shape above the floor is **graded**, not just gated (see below) |
| **UNREJECTED** | wick **against** the move ≤ **25%** | asymmetric on purpose — on a bull candle an upper wick is price being *sold back*, a lower wick is a dip being *bought*. Raised 15%→25% (user 2026-07-21): 15% demanded a near-wickless marubozu and rejected real volume candles (GBP/USD 20-Jul 18:00: 21p, 3.62×, 81% body, **19% wick** — a genuine momentum candle). 25% admits it; rate 34.6→41.3/mo |

### The GRADE — shape decides confidence, not entry (added 2026-07-21)
> "For the signals with candle with perfect wicks and 75% candle body, we grade the signal A however
> for those with wicks 25% and body 60%, we grade them starting from 74% coming to 60%."

A candle that passes the gate is **graded by shape** (`momentum_grade` in `vix1_momentum.py`) and the
grade IS the signal's confidence — shown on the card as `Momentum candle grade X (NN% confidence)`:

| Grade | Shape | Confidence |
|---|---|---|
| **A** | body ≥ 75% of range AND counter-wick ≤ 15% (the "perfect" candle) | **0.85** |
| **B/C** | anything weaker, down to the gate (body 60% / wick 25%) | **0.74 → 0.60**, sliding — the WEAKER of the two axes sets it, so a good body can't hide a bad wick. B ≥ 0.68, C below |

Measured on 799 recent GBP/USD H1 bars: 89 momentum candles → **A=46, B=14, C=29** — a real spread.
The grade never blocks a setup; the entry/trend/line gates decide THAT. To keep B/C signals alive, the
validator got a per-strategy confidence floor (`min_confidence_overrides = "vix1:0.60"` in
`config/settings.py`) — without it the global `min_confidence=0.70` would have silently eaten every
signal graded below 70% and the grading would have looked like a detection bug. BX-S/D keeps its own
independent confidence formula and the global 0.70 floor — untouched.

**MEDIAN, never mean** — on 11–21% of bars one news spike drags the mean past 1.6× the median and
then blocks every genuine candle behind it for hours.

### The run is ONE candle — the market says so, do not "fix" it
`_MIN_RUN = 1` is correct and I was wrong to call it inert. Measured on **1,433 real momentum
candles**: a second momentum candle follows only **2–5%** of the time, and **2–3 in a row happen
0–2%**. Requiring confirmation forfeits the setup.

The *move* does continue — **65%** reach 2 more bars of extension, **47%** three, **23%** five — but
it continues **through a pullback**. A clean unbroken run reaches 5 bars **0%** of the time. That is
the whole justification for the 1M pullback entry: demanding the unbroken version takes 23% → 0%.

**Never add multi-candle confirmation to the 1HR.**

### RIDE THE TREND, REFUSE THE PULLBACK (settled 2026-08-11)
> "The trend has developed — HH and HL (or LL and LH) ... then we see a momentum candle in the same
> direction, we anticipate a trend and we want to ride with it. For a trend that has developed, it is
> easy because we only need the candle to qualify."
>
> "A momentum candle in a developing HH cannot break structure — it will only break structure if the
> HH develops fully ... it is not easy for 1 candle to break structure in most cases."
>
> "So, we don't trade pullbacks, we don't trade ranging markets and we are always in trend."

| | rule |
|---|---|
| **direction** | from the 1HR trend ONLY (48-bar swings). It already refuses to call a trend until HH+HL / LL+LH, so "the trend has developed" IS the trend reading |
| **trigger** | a momentum candle in that direction. **It is never asked to break anything** — the candle is the EARLY sign the next leg is starting, not the thing that completes it |
| **refusal 1** | the FASTER structure (8-bar swings) must not be trending the OPPOSITE way. That is "the candle is in a pullback" |
| **when we may start** | his words, 2026-08-12: *"When a trend starts it has a high then a low, and if it is a real trend it will print another high after the first low. So when it starts printing the second high after the first low, we start looking for a momentum candle."* A REAL-TIME observation, made as that second high forms |
| **where the candle may come** | *"It is not a rule that the momentum candle must only come in the high after the first retracement — it can come anywhere along the trend so long as we are in trend."* No maturity gate. **A rule requiring a first retracement was built 2026-08-11 and REVERTED 2026-08-12 on this correction** — see the fix log before rebuilding it |
| **the one condition on the candle** | *"that candle must not be in a retracement, because retracements can sometimes turn into a reversal."* This is the whole of it, and it applies at every maturity |
| **maturity** | `developing` / `developed` is a LABEL, shown and never used as a gate. **It does not mean "just started":** a trend stays `developing` for a median 209 bars (8+ trading days) because the label waits for a 48-bar swing to confirm. His "second high after the first low" happens far earlier than the label moves |
| **after a CHoCH** | the trend itself turns, and the new direction is traded once it has proved itself |

**THE 10-AUG CASE, which this exists to stop.** 2-day trend DOWN; 8-hour structure UP — highs
1.34854 → 1.34790 → **1.35081**, lows 1.34396 → 1.34336 → **1.34788**, both rising. Not unclear:
actively opposite. VIX.1 sold it and price ran +85 pips the other way over the week.

**WHY "MUST NOT CONTRADICT" AND NOT "MUST CONFIRM".** The first build of this demanded the faster
structure positively confirm the trend AND that the pullback had ended. Measured, that permitted
trading only **15-18%** of the time a trend existed — against "we are always in trend" — and refused
both candles he had named as good. The weaker test still refuses 10 Aug.

**DIRECTION MUST NEVER COME FROM THE FAST READ.** Half of all pullbacks are COMPLEX (measured: 21 of
42 GBP/USD, 17 of 37 EUR/USD over 12 months) — they print their own LH+LL inside an intact uptrend
and look exactly like a downtrend at 8 bars.

**Swing width 8 is provisional**, his decision: *"keep it at 8 hours for now... We can test 5, 8, and
12 later using the actual trading results."*

**DOES THE PULLBACK REFUSAL ACTUALLY HELP? TESTED 2026-08-11, and it earns its place.** He asked for
the evidence before accepting it: *"Test it and the result determine whether you add it or not."*
Every momentum candle pointing the same way as an established trend, 2 years, both pairs, split ONLY
by what the rule decided, then the same measurement applied to both piles — where price actually went
in the signal's direction. No stop, no target, nothing borrowed from his method.

| | went the signal's way | median move |
|---|---|---|
| GBP/USD 12h — allowed (n=301) | 48% | −1.7 pips |
| GBP/USD 12h — **refused** (n=136) | **42%** | **−9.7 pips** |
| GBP/USD 24h — allowed | 43% | −5.9 |
| GBP/USD 24h — **refused** | **35%** | **−14.8** |
| EUR/USD 12h — allowed (n=357) | 50% | +0.6 |
| EUR/USD 12h — **refused** (n=142) | **44%** | **−3.4** |
| EUR/USD 24h — allowed | 50% | +0.3 |
| EUR/USD 24h — **refused** | **44%** | **−2.7** |

**4 of 4 comparisons agree**: the refused group is 6-8 points worse on direction and materially worse
on median move, on both pairs and both horizons. The rule is removing the worse quarter, not a random
quarter.

**WHAT THIS DOES NOT SHOW, and must not be read as.** These percentages are measured FROM THE
MOMENTUM CANDLE'S CLOSE. That is NOT where VIX.1 enters — the real entry is a stop order beyond a 1M
pullback, at a better price, and only if price pulls back and then resumes. So "48% went the right
way" is NOT the strategy's win rate and says nothing about its profitability. It is a test of a
FILTER, nothing more.

**MEASURED OVER 2 YEARS, both pairs** (setups, not delivered signals — the 1M entry, spacing, news
and RR checks all still apply):

| | GBP/USD | EUR/USD |
|---|---|---|
| distinct setups | **11.4/month** | **14.4/month** |
| developed / developing | 55% / 45% | 64% / 36% |
| refused: momentum against the trend | 29% | 29% |
| refused: **faster structure contradicts** | **26%** | **26%** |
| refused: no established trend | 18% | 11% |

### Three tradeable contexts, all momentum-led — TRENDS ONLY
| origin | what it is |
|---|---|
| `trend` | clear **1HR** HH+HL / LH+LL, momentum candle **with** it (PRIMARY) |
| `choch` | momentum candle **against** an established 1HR trend that **closes beyond the swing defining it** |
| `trend4` | 1HR trend UNCLEAR, but the 1HR momentum aligns with a clear **4HR** trend (the fallback) |

The old `range` origin (a bare breakout with no confirmed trend on either TF) was **removed 2026-07-20** —
we trade **trends only**. Neither TF shows a confirmed trend → **no trade**.

`choch` is a **body close**, never a wick — a wick through the level is a liquidity grab (the
platform-wide rule). Without the break it is a deep pullback and we stand aside. ~90% of
against-trend momentum candles do break structure, so this filters little; it is there for
correctness. Structure comes from `shared/swing_points` via `vix1_trend` — **never** BX's
structure module (strategy independence).

### Nothing hardcoded where the market can say it
Thresholds come off the 1M's own recent candles or the momentum candle itself. The pullback's
volatility/violent exclusion is judged against the 1M's **own average body** — what is abnormal in
Tokyo is routine in London.

---

## Fix log (newest first — `git log` has the full reasoning)

| commit | what |
|---|---|
| 2026-08-12 (b) | **THE MARKET-STATE GATE — his "not in a retracement", built and shipped INERT.** After the reverted rule, he confirmed the recall was right and said to build: *"I already approved the previous plan and the questions you asked i already reminded you and you got the answer so you can build."* **WHAT WENT IN:** `vix1_structure.market_permits(retracement, efficiency)` — one function, one refusal, a stated reason. It answers *"is the market in a state worth trading"*, which is the settled shape of his rule: **retracement + reversal/CHoCH + range, hand in hand.** The reversal third already worked (a pending CHoCH gives no direction); this adds the other two. **WHAT IT DELIBERATELY DOES NOT DO:** it never asks the momentum candle whether the retracement has finished. That is settled — *"Momentum candle is a proof of the continuation of the trend"* — and I had re-opened it once already; the test file now says so in a comment so the question is not re-introduced through a test. **THE TWO THRESHOLDS SHIP AS `None`, meaning NOT SET — not zero.** They are his, reserved deliberately: the measured distributions have no natural break, and anything picked from one year of two pairs is a fitted number (the n=12 swing width at 55% agreement and the daily timeframe at 65% both looked right on the day and were worse over four years). The measured cost of each candidate cut is recorded beside the constants so the choice is informed, not invented. **PROVEN INERT, not asserted:** a 12-month replay gives the identical setup list whether the gate runs or is forced open — GBP/USD 158 = 158. **Depth is measured against ATR, never against the trend leg** — the leg needs the far-away 48-bar pivot and would drag that delay straight back in. 37 checks in `test_structure.py` including both gates armed and disarmed, the boundary (exactly at the threshold allows; strictly below refuses), "unknown efficiency is never refused on a guess", and a teeth case proving the gate is inert while unset. Suite green, 11 files. **STILL OPEN:** the real-time *"second high after the first low"* trigger — nothing implements it yet. **NO DEPLOY.** |
| 2026-08-12 | **THE DEVELOPING-TREND RULE WAS WRONG AND IS REVERTED — his question caught it, one day after I shipped it.** He asked the logical question: *"If we were only trading mature trends before, why does trading a developing trend REDUCE the number of setups?"* The premise was mine, from sloppy wording — we had always traded both — but chasing it exposed that the rule itself was answering a question he never asked. **TWO ERRORS, and the second is the one to remember.** **(1) His stated rule was already guaranteed by construction.** *"The momentum candle comes after the first HH and HL"* cannot fail: a 48-bar swing is not confirmed until 48 bars after it prints, and the momentum candle is only sought in the last `LOOKBACK=12` bars. Measured over 12 months, the gap between the establishing swing and the momentum candle was **never negative — min 41 bars, median 209, on both pairs**. So a rule that DOES refuse things is a different rule wearing his name, and mine was: it silently required a counter candle immediately before the momentum candle, which is a candle-level test, not a structural one. **(2) `developing` does not mean "just started".** It waits for the NEXT 48-bar swing high to be CONFIRMED, a median of **209 bars — over eight trading days**. His *"when it starts printing the second high after the first low, we start looking"* is a REAL-TIME observation made as that high forms; the label is a confirmed-structure reading made a week later. Gating on the label was gating on something he had never described. He said it plainly: *"It is not a rule that the momentum candle must only come in the high after the first retracement — it can come anywhere along the trend so long as we are in trend, and that candle must not be in a retracement, because retracements can sometimes turn into a reversal."* **WHAT THE MEASUREMENTS SHOWED BEFORE IT WENT** (kept because it was mechanically clean, which is exactly why it was dangerous): GBP/USD 167 -> 120 distinct setups (28.1%), EUR/USD 185 -> 157 (15.1%); every removed setup was developing, **0 developed setups moved on either pair**. Half of every developing setup, deleted on a basis he had not chosen. **THE LESSON, and it is not "measure more":** I HAD flagged this exact ambiguity to him days earlier — whether "the retracement" meant the HH->HL leg or a separate later one — and then, when I came to build, quietly picked one reading without saying I was picking. A measurement cannot catch that; only saying out loud which interpretation is being coded can. **KEPT from the reverted work:** the trend is still read AT the momentum candle (`t_mc`), which is independently correct and improves the retracement numbers. Suite green, 11 files. **NO DEPLOY — the rule never reached production.** |
| 2026-08-11 (d) | **A NEW TREND MUST NOW SHOW ITS FIRST PULLBACK BEFORE IT IS TRADED — the first rule from the retracement work that actually DECIDES.** I had built the measurements and deliberately held this one back as "a real behaviour change", listing it as an open item. He overruled that, and was right: *"You cant hold this back. I need it build."* Sequencing was mine to suggest, not to decide. **THE RULE** (`vix1_structure.developing_needs_retracement`), in his words: *"So the first retracement and then when a momentum candle builds showing the potential continuation of the price, we trade. If not, the trend is now confirmed and we can get any momentum candle along the trend."* So a **developing** trend — one that has printed its first HH + HL (or LL + LH) and not yet continued — may only be traded off a momentum candle that came AFTER a retracement; **length never disqualifies**, one candle is enough. A **developed** trend is untouched: it has already proved itself and a momentum candle anywhere along it is tradeable. **MEASURED BEFORE BUILDING, then again through the live `detect_bias`:** GBP/USD **167 → 120** distinct setups over 12 months (**28.1% removed**) and EUR/USD **185 → 157** (**15.1%**); on the narrower slice the leg gate already allows, 24.9% / 14.0%; and **0 developed setups on either pair** — which is asserted in the tests rather than assumed, because that is the half of the rule easiest to break silently. **ONE DESIGN POINT WORTH THE EXTRA WORK:** maturity is read **at the momentum candle**, not at the latest bar. The candle can be up to `LOOKBACK=12` bars old (median 5) and a swing's confirmation can land inside that gap — measured, the two reads disagree on **0.9% of GBP/USD and 1.8% of EUR/USD** setups. Small, but "had this trend already continued when the candle formed?" is a question about the candle, the same causal argument the leg gate already uses. `detect_bias` now replays the trend on the truncated window and uses it for maturity, for the retracement's starting point, and for the card's reason; if the candle formed mid-reversal it falls back to the current read rather than refusing, which would have been a second rule nobody asked for. Applied AFTER the leg gate so its refusals are attributable to it alone. **VERIFIED END TO END on real GBP/USD bars:** a developing trend with a 1-candle retracement produces a setup whose card reads *"permitted because it came after a 1-candle retracement"*; a developing trend with none returns None. Suite green: VIX.1 11 files (7 new checks + 2 teeth in `test_structure.py`), BX-S/D 8, card suites. **NO DEPLOY.** |
| 2026-08-11 (c) | **THE 1HR NEVER COUNTED A PULLBACK — it does now, and a RANGE is finally detected. Phase A: measured, deciding nothing.** He asked a plain question — *"is the pullback system aware that a pullback can be 1 candle, 2 or more?"* On the 1HR the answer was no: nothing counted anything. A pullback was whatever sat between two swing pivots 8 bars wide. **SIX PROBLEMS, ALL MEASURED over 12 months on both pairs:** the check fires on the wrong SIZE of move (refuses at a median **58 pips / 43 bars**, allows at **19 pips / 14 bars**); it says nothing at all about a live pullback (counter candles immediately before: **0** when it allows, **1** when it refuses); it is **8 hours late by construction**, since a pivot needs 8 bars after it; it is blind to short retracements — **99% run under 8 candles**, 48% are a single candle and 26% are two; its most common answer at the moment of decision is *"cannot tell"* (**40%** read mixed, which passes); **nothing has ever detected a range** — the trend reader did not once say "no trend" in 12 months; and so chop is traded routinely — our momentum candles sit at a median efficiency of **0.25** against the market's **0.21**, with **17%/24%** of trades in the choppiest tenth. **HIS RULE:** *"A pullback can be from 1 candle or more so it should count candles... After a rally we start counting retracement candles and if a momentum candle comes after them we trade."* And, correcting me when I proposed a cap: *"length never disqualifies — the retracement, the reversal detector and the range detector work hand in hand."* He was right, and the cap was a leftover from a 10-Aug framing he had already told me to drop. **WHAT WENT IN:** `vix1_retracement.py` (the pullback, counted from the moment price turns, with depth in pips and in ATR) and `vix1_regime.py` (directional efficiency — net distance ÷ path walked, over 20 closed bars, no pivots so no delay). `vix1_state.py` carries both plus the `Bias` record; `vix1_bias` prints them on **every** log line including the refusals, because the refused setups are the comparison group. **TWO DEFECTS I INTRODUCED AND MEASUREMENT CAUGHT, both after the plan was approved.** (1) The first version measured only from the trend's all-time extreme and called that "the retracement" — median **156 candles**, a true statement about the trend and a useless answer to "how long is this pullback". Both numbers are now carried and named separately (`bars` vs `stall_bars`). (2) The count then read **0 at 100% of setups on both pairs**, because a momentum candle by definition goes the trend's way and the walk-back hit it immediately — his rule says the candle comes AFTER the retracement, so the candle itself is stepped over. Neither was findable by reading; both fell out of running it on real data. **A DEAD BRANCH FOUND BY THE TEETH CHECK:** a `max(0.0, …)` clamp on depth survived being broken on purpose with every test still green — it is unreachable by construction, so it was deleted. **PHASE A DECIDES NOTHING, AND THAT IS PROVEN, NOT ASSERTED:** a 12-month replay of `detect_bias` produces identical setups before and after. Thresholds are Phase B and are HIS to set from real signals — the efficiency distribution is perfectly smooth with no natural break, and cutting at 0.20 would call ~47% of all time "ranging" and delete ~41% of current trades. **`vix1_bias` passed 200 lines** so the record and the state assembly split into `vix1_state.py` — a real seam (deciding vs recording), not churn. **Suite green: VIX.1 11 files** (3 new), BX-S/D 8, plus the card suites. **Every new measurement broken on purpose and confirmed to fail.** **NO DEPLOY.** |
| 2026-08-11 (b) | **THE REBUILD, after he stopped me patching.** *"you are not patching, you are rebuilding... if you dont have context you will patch and give a nonfunctioning strategy."* A whole-strategy review then found TWO defects I had already introduced by editing files without reading their consumers. **(1) `vix1_watch` stopped invalidating pending setups.** It asked `detect_bias` whether the higher-timeframe view had turned against a resting order — but `detect_bias` now answers "may a NEW trade be taken", and returns None whenever one may not. So a setup whose trend had GENUINELY FLIPPED was no longer invalidated, because the flip itself suppressed the answer. It now asks `trend_state(...).direction` directly; a resting order is judged on where the trend points, never on whether a fresh entry is permitted. Pinned by a test both ways. **(2) The muted 4HR fallback was revived into the reversal window.** `t1 == 0` used to mean only "no trend ever formed" and the branch never ran (0 of 622 samples over 12 months). The two-stage turn gave it a SECOND meaning — "a reversal is proposed but unconfirmed" — which occurs on **18% of GBP/USD momentum candles and 11% of EUR/USD**, so a branch that had never executed would start trading mid-reversal. Measured: 5 firings in the last 600 GBP/USD bars. **MUTED, NOT DELETED**, on his instruction: *"Dont remove it. Just mute it so that we can turn it on when we ever need it in future."* `vix1_bias._ALLOW_H4 = False`, with the standing dead-code rule explicitly waived in the comment so a future session does not sweep it. **THE RULE ITSELF was loosened** from "the faster structure must CONFIRM and the pullback must have ended" (15-18% of trend-time — far too strict) to "the faster structure must not CONTRADICT". His correction drove it: *"a momentum candle in a developing HH cannot break structure."* **ALSO:** `choch`/`choch4` render branches deleted (removed as origins 2026-07-26, their code lived on for six weeks reading like live features); trend maturity (`developing`/`developed`) added and shown on the card; the structure reason now printed so a signal can be checked against a chart in seconds. **THREE HARNESS BUGS found and fixed before any number was believed** — a 1500-bar window where production uses 3000 (the size floor silently switched itself off, and its own warning caught it), the trend diagnosed on 3000 bars while the decision used the pinned 1500, and setups counted per SAMPLE rather than per momentum candle (which inflated 11.4/month to 32.5). **2-YEAR RUN, both pairs**, in the table above. Suite green, 8 files. **NO DEPLOY.** |
| 2026-08-11 (a) | **IT WAS SELLING THE PULLBACKS OF A RALLY — the trend now waits before reversing, and a trade needs its LEG to have proved itself.** He caught it: two sells on 10 Aug while GBP/USD rose +85 pips over the week (1.34237 -> 1.35087). Replayed: the trend read **DOWN all day**, including at 15:00 with price at its 1.35250 high. **ROOT CAUSE 1 — the trend could FREEZE.** On a turn it set `protected = max(since) if since else None`, and the turn test was guarded by `if protected is not None`. Landing on None left it **unable to ever change again**: GBP/USD spent **62% of bars frozen**, once for **873 bars (~7 weeks)**. **THE SURPRISE:** simply un-freezing it made things WORSE — EUR/USD went 10 -> 18 trend phases, median phase length halved, noise reversals doubled. The freeze had been MASKING how eager the turn rule was; a one-line fix would have shipped a worse strategy. **ROOT CAUSE 2 — half of all pullbacks are COMPLEX** (21 of 42 GBP/USD, 17 of 37 EUR/USD over 12 months): they print their own LH+LL inside an intact uptrend and look exactly like a downtrend to any fast read. That is the shape that keeps fooling it. **WHAT WENT IN — (a) THE TURN IS TWO-STAGE.** A body close through the protecting swing no longer flips the trend; it raises a **CHoCH — reversal proposed**, and the trend only turns once the new direction **confirms with a BOS**. Measured: trend phases under two days go **2 -> 0** on both pairs, median phase 334 -> 411 (GBP/USD) and 246 -> 350 (EUR/USD), and protection is never None by construction. His reasoning, and the decision: *"I want the system to be cautious about calling a reversal. A temporary break should not automatically become a new trend."* **(b) THE LEG GATE** (`vix1_structure.py`, new) — his rule above. **(c) BOS AND CHoCH ARE NAMED EVENTS** with their prices, printed on the card (*"trend turned down by CHoCH at 1.33398, confirmed by BOS at 1.32729"*) — verifying the 10-Aug signal against his chart took an hour precisely because the card asserted a direction and never said why. **A RESPONSIVE PROTECTION LEVEL WAS TRIED AND REJECTED:** moving protection to each counter-swing (the textbook "last lower high") reads the 10-Aug reversal earlier, but takes trend changes 10 -> 14 / 10 -> 16 over 12 months and **`test_trend.py` failed it on the 4-year stability property**. That test exists because two earlier candidate fixes each looked right on the day and were worse over four years — **it was right a third time**, and it turned out to be unnecessary because the leg gate refuses the signal anyway. **THE TEST METRIC CHANGED, DELIBERATELY AND ON HIS INSTRUCTION.** A turn now reads UP -> changing -> DOWN, so the old "count every state change" scored one reversal as two (GBP/USD 75 raw vs **35 completed**). The metric now counts COMPLETED reversals and **keeps the old raw count printed alongside** — he was explicit: *"I don't want the test changed simply to make the results look better; I want it changed because the definition of a reversal has genuinely changed."* **NEW TESTS PROVE REVERSALS STILL MEAN SOMETHING**, not merely that there are fewer: **0** phases under two days on both pairs, median phase catches **+177 pips (EUR/USD) / +227 (GBP/USD)** in its own direction, and only 1 of 70 phases never moved the trend's way at all. (Measured as the BEST move during a phase, NOT start-to-end — a phase ENDS because price turned against it, so start-to-end is biased negative and would fail a perfect detector. I made that mistake first and corrected it.) **ALSO FIXED:** `leg_state` de-duplicates pivots — `find_swing_points` marks every bar that is its window's extreme, so a flat top prints two pivots at an identical price and "the last two highs" read as "no higher high". Equal highs are ordinary market behaviour. **VERIFIED:** the 10-Aug sell is REFUSED at swing widths 5, 8 and 12; full suite green across 8 files including a new `test_structure.py`, every new gate tested both ways with teeth. **His two 06-Aug candles are also refused** — they were size-calibration examples, and he confirmed: *"I do not want the rule weakened to accommodate them."* **NO BACKTEST.** |
| 2026-08-10 | **THE "BIG CANDLE" TEST COULD SHRINK TO NOTHING IN A QUIET MARKET — a SECOND size test added, on a window a quiet week cannot move.** He caught the signal: GBP/USD SELL, 10-Aug 12:28 UTC, off the 09:00 candle. Replayed against real broker bars — **body 7.5 pips**. **ROOT CAUSE:** the only size test was `body ≥ 2.5 × the median body of the last 100 bars`. 100 H1 bars is ~4 trading days, and that morning had been flat, so the median had fallen to **2.9 pips** and the requirement with it — to **7.25 pips**. The bar falls to meet the quiet. There was no absolute or long-window floor anywhere. Measured over 4 years: the 100-bar requirement drops as low as **7.4p**, a 2,000-bar one never below **8.7p**. **HIS STANDARD:** he named two GBP/USD candles as the minimum he would trade — 06-Aug **14:00 (11.3p body)** and **15:00 (12.4p)** — *"the momentum candles can only have the body that size or bigger but not smaller"*, and *"use 11 pips not 11.3"*. **WHY NOT A FLAT 11 PIPS:** (a) it breaks his own settled rule *"nothing hardcoded where the market can say it"*; (b) it goes stale — GBP/USD's median H1 body **halved** between 2022 (9.6p) and 2024 (4.7p), so the same 11 pips admitted 45 candles per 100 in 2022 and 19 in 2024; (c) it is not the same test on both pairs — 11p is the 73rd percentile on GBP/USD but the 81st on EUR/USD, which moves ~30% less. **WHAT WENT IN INSTEAD:** `body ≥ 2.12 × the median body of the last 2,000 bars`, ANDed with the existing 100-bar test. **2.12 is his own number translated:** 11.0 / 5.20 = ×2.12 on GBP/USD, and the equally-rare EUR/USD body (8.4p) / 3.95 = ×2.13 — the same multiple on both pairs to within 0.01, so ONE number serves both, and it re-derives itself as volatility changes (8.7–23.5p over 4 years, no re-tuning). Asks ~11.0p GBP/USD and ~8.4p EUR/USD today. **IMPACT:** binds only 14%/16% of the time (the dead patches); momentum candles/month 55.5→53.8 GBP/USD and 56.2→54.3 EUR/USD. **WHY 2,000 BARS AND NOT 3,000:** the fetch asks for a window of `(count+10)` HOURS but H1 bars exist only while the market is open — 120 a week, not 168 — so `count=3000` spans 125 calendar days and delivers only **~2,150** bars. Asking the median for 3,000 and silently getting 2,150 would measure a window the multiplier was not calibrated on. `_LONG_MIN_BARS=1800`; below that the test SKIPS rather than rejects. **TWO TRAPS HANDLED:** (1) his own 11.3p candle computes as `11.30000000000075` and clears 11.3 by 7.5e-13 — luck; a different price pair lands microscopically below and the rule built from his candles would reject his candles, so the comparison carries a `1e-6` pip tolerance. (2) `symbol` is now a REQUIRED argument on `is_momentum_candle`/`momentum_run`/`veto_reason` and threaded through `vix1_spacing` — `pip_size("")` happens to be right for these two pairs and would be silently wrong for a yen pair. **`vix1_spacing` uses the same test deliberately: a momentum candle must mean ONE thing**, or the spacing gate counts candles the setup would not. **THE TREND WINDOW IS NOW PINNED:** `candle_counts[TF.H1]` went 1500→3000 to feed this, and `vix1_bias` slices the last 1,500 explicitly — measured, unpinned changes **18%** of GBP/USD and **11%** of EUR/USD trend verdicts; pinned it is 260/260 and 154/154 identical. **WHAT WAS DELIBERATELY NOT DONE:** tightening the wick/body shape gates, though it would cut ~25% of setups. The 25% counter-wick limit exists *because he raised it* on 07-21 (a strict 15% rejected GBP/USD 20-Jul 18:00, a 21p/81%-body candle), and the 50% body floor came from 22 of his own trades whose thinnest was 51% — 60% rejected 3 of those 22. **VERIFIED on real bars:** his two candles ACCEPTED (11.3p and 12.4p vs 10.6p required), the 10-Aug candle REFUSED (7.5p vs 10.4p). Full suite green, 7 files; new gate covered both ways plus a teeth case proven to fail when the gate is disabled. **NO BACKTEST** — the setups/month figures are candle counts and trend verdicts, not a scored simulation. |
| 2026-08-07 | **THE PULLBACK IS ANY CANDLE AGAIN — the size filter is DELETED, and this reverses a change he himself asked for.** He caught it on a live GBP/USD M1 chart (06 Aug): *"I didn't get this entry at the pullback. I got it late… the entry should be immediately at the first pullback when it starts after price has gone past 1HR candle line. **The first pullback ever**."* Then, shown the conflict below: *"make it to be pullback of any candle. Any other thing I will decide on my own."* **MECHANISM — the part that makes a size filter far more damaging than it looks:** `find_pullback` walks back to the FIRST candle of the latest retrace and, if that candle fails `is_pullback_candle`, **returns None rather than falling through to a later candle in the same retrace**. So the filter did not skip a candle, it skipped the ENTIRE retrace; the entry then waited for some later retrace that happened to open with a big candle — later in time and further from the line, which is exactly what he saw. Demonstrated on a fixture with a 4.16-pip average body: the 1.1-pip first pullback was rejected **and so was a 3.8-pip later one**, because in a trending move a retrace candle is normally SMALLER than the average bar, so `body ≥ 1.00× avg` is rarely satisfied at all. After the change the same fixture anchors on bar 15, the first pullback. **WHAT WAS REMOVED:** `_MIN_BODY_VS_AVG = 1.00` and `_MIN_BODY_FRAC = 0.60`, deleted outright rather than set to 0 — an unread constant is dead code and a disabled knob invites re-tuning. **WHAT WAS KEPT, deliberately:** the WHIPSAW test (`range ≥ 2.5× avg` AND `body < 60% of range`), because that is his own 2026-07-22 exclusion and not an invention of mine; `_MAX_BODY_VS_AVG = 0.0` (the body ceiling stays disabled — 2026-07-26 established it was inverted, using the platform's "strong" threshold as "reject as chop"); and `vix1_momentum._MIN_BODY_FRAC`, which is the same NAME on a different candle and was untouched. **THE HONEST PART:** the deleted filter was added 2026-07-26 on his *"I just waited for a PROPER pullback candle"* with real evidence — the code had been anchoring on a median 2.2-pip candle with an 0.9-pip body, and in one case took a 1.4-pip ZERO-body doji four minutes early and was stopped out of a trade he made +2.28R on. **That exposure is knowingly back.** He decided; it is recorded, not argued. The doc's rules section had ALSO been stale since 07-26 (it still described the 07-22 any-type rule as current) — corrected in this change, with the round trip written down so the next session does not restore the filter. **TESTS:** `test_line_pullback.py` asserted the OLD rule, including a `teeth` case pinning "a tiny body is refused" — the exact gate that was deleted. Those expectations were flipped and the teeth RE-AIMED at the whipsaw, called out in the file and the commit because flipping a teeth assertion is how a regression gets hidden. New fixtures assert the first retrace candle anchors when it is a doji, a tiny body, or a wicked small body, and that a whipsaw first candle still yields nothing. **One fixture was wrong and the code was right:** my "small long-wicked" case used 4-pip wicks on an 0.4-pip body against a ~0.33-pip average — range 2.5× the average settling nowhere, i.e. a genuine whipsaw. 28 checks; full VIX.1 suite green including the real-data invariants. **NO BACKTEST RUN** — frequency and win-rate sweeps need his separate approval, and this change will produce more and earlier entries by design. |
| 2026-07-29 | **THE 1HR TREND WAS LOOKING THROUGH A KEYHOLE — now read from 2-day swings over ~62 days.** The user drew a two-month EUR/USD downtrend (lower highs, lower lows, structure unbroken) and asked why the detector said UP. Not a logic bug: the state machine is correct. It was handed **120 H1 bars = five days** and called a **3-bar (7-hour) wiggle** a swing, so every swing it could see was from the previous two days — inside which price genuinely HAD made a higher high and a higher low. True, and irrelevant: it could not see a single one of the lower highs in the move. **Because VIX.1 is pro-trend only, a valid SELL that day would have been discarded as counter-trend while price fell 24 pips.** Fixed by reading swings at the scale a trader actually draws: `clear_trend` now takes the swing half-width as a parameter, `vix1_bias._H1_SWING_N = 48` (≈2 days either side), and `candle_counts[TF.H1]` 120 → **1500** (~62 days) so several such swings can form. **MEASURED over 4.18 years of real H1, both pairs: agreement across window sizes 79%→84% (EUR/USD) and 76%→80% (GBP/USD); trend changes 183→37 and 166→36.** One flip per ~6 weeks is a main trend; one per ~6 days is not. Verified on the 29 Jul decline itself: **DOWN at every hour**, where the old settings flipped to UP at 05:00 and stayed wrong for nine hours. **H4 IS DELIBERATELY UNCHANGED** — at its current settings it already scores 89%/77% and read DOWN on both pairs that day; widening its swing width made it markedly worse (56%/47%). **TWO SIMPLER FIXES WERE TESTED AND REJECTED — do not retry:** (a) swing width 12 on the existing 120-bar window — 55% agreement (worse than the 82% it replaced) and flat 24% of the time; it only looked right because it was first checked on a single day; (b) the DAILY timeframe — 65% agreement, and on 29 Jul it read flat/DOWN/UP/DOWN at 40/60/90/120 days, contradicting itself too. New `tests/vix1/test_trend.py` asserts the STABILITY property (not a single day's verdict) with teeth. |
| 2026-07-29 | **PER-TICK REASONING DE-DUPLICATED — 627 log lines → 5, with nothing lost.** VIX.1 explains itself on every scan, which is the right instinct at the wrong volume: measured over a 3h29m production window it emitted 627 lines, of which EUR/USD repeated `bias=NONE: up momentum but it is NOT with the trend (1HR=-1, 4HR=1)` **209 identical times**. The container's log buffer is a fixed budget (~6,000 lines ≈ 3.5h), so that repetition evicts everything else in it. New `vix1_log.py` routes every STATE line through `core/stage_tracker`: a changed reason prints instantly, an unchanged one restates every 900s. EVENTS (`say_always`) — a signal, a setup invalidation — are never suppressed, because each is new information even when the text repeats. **Measured on the real captured window: 627 → 5 lines, all 5 distinct reasons preserved, 0 lost.** Two implementation details that cost real measurements to find: (1) the throttle key must be **(symbol, reason)**, not the symbol — VIX.1 emits a bias line AND a 1M line per scan, so a symbol-only key makes them alternate A,B,A,B and suppresses nothing (33% reduction instead of 99%); (2) the reason "shape" strips **decimals only** — prices move every tick and would defeat de-duplication, while integers must survive because `1HR=-1` → `1HR=1` is a trend flip that must print. Each emitted line is also written to `signal_events` as `stage='evaluated'`, so state survives a restart. Also: the no-stop-region message now says WHICH of three things happened (no 1M regions at all / none beyond the pullback / all beyond one 1HR candle) instead of one wording covering all three. **No trading logic changed.** |
| 2026-07-27 | **SIGNAL SPACING ADDED — an instrument stays shut while its last signal runs.** New `vix1_spacing.py`, called from `vix1.py` after the bias and before the 1M entry work. The user's rule, his words: *"if a viable signal is detected immediate[ly] the previous one was taken and is still running, it must be after 3 momentum candles preceding the 1HR momentum candle where the first signal was taken has been achieved… However, if the first signal was a loss, the second one if meets conditions can be fired. This only applies for signals from the same instrument."* So: scope is the INSTRUMENT (both directions, buy and sell alike — *"its for both sell and buy signals"*); the gate applies ONLY while the previous signal is still `active`; it requires **3 momentum candles closed after the ANCHOR** — the 1HR momentum candle that produced the previous signal, NOT its creation time; and a CLOSED previous signal (explicitly **including a loss**) voids the wait entirely. Any momentum candle counts toward the 3, either direction (`_COUNT_BOTH_DIRECTIONS`). **DERIVED, never stored:** the count is replayed from the H1 window every call and "is one still running" is asked of the DATABASE, so no restart or second process can desynchronise it — deliberately, because the same day's duplicate-signal defect was caused by exactly that kind of in-memory state. Fails OPEN on a DB error (the one-at-a-time rule and the DB constraint still stand behind it) but never silently. **MEASURED on the real 27 Jul EUR/USD case: anchor correctly derived as the 07:00 candle; only 2 momentum candles had closed by 14:46, so the signal that was actually delivered — grade B, 21 pips into a completed move, and it failed — is now REFUSED.** |
| 2026-07-27 | **ROOT CAUSE: ORM rows did not survive the session that loaded them — it broke TWO subsystems silently.** `storage/db.py` used SQLAlchemy's default `expire_on_commit=True`, and `get_session()` commits then closes. So `signal_repo.get_active()` returned **expired, detached** instances and the FIRST attribute read raised `DetachedInstanceError`. Both callers swallowed it: `monitor/signal_monitor._check_signal` died on `row.symbol` inside an `asyncio.gather(..., return_exceptions=True)` **whose results were discarded** — production logged 158 consecutive healthy-looking polls while judging nothing, and every signal of 27 Jul sat at `triggered_at = NULL` with price long past the entries; and `signal_validator._load_active_from_db` raised on `row.strategy`, was caught by its own `except`, left `_loaded` False and the duplicate guard **permanently empty** — which is how two `vix1 EUR/USD sell` signals went active simultaneously, a state that module has always claimed to prevent. Fixed at the source (`expire_on_commit=False`, with a load-bearing comment) plus three defences: the gather results are now inspected and logged per row, `_is_duplicate` asks the DB as well as `_seen`, and a **UNIQUE PARTIAL INDEX** `trading_signals (strategy, symbol, type) WHERE status='active'` makes the invariant unbypassable by any process state. `signal_repo.save` returning `""` on `IntegrityError` is now a REACHABLE path, so the runner treats it as "not saved, do not dispatch" — previously it dispatched a card for a row that did not exist. Regression test with teeth in `tests/vix1/test_spacing.py`. |
| 2026-07-27 | **A SIGNAL COULD BE BUILT, SAVED AND NEVER DELIVERED, LEAVING NO TRACE.** On 27 Jul the 11:17 EUR/USD signal (grade A, entry 1.13899 — the best of the day) reached the database and never reached Telegram; the container restarted at 16:28 and took every log line with it, making the question permanently unanswerable. stdout cannot survive a restart. Added `signal_events` (append-only, one row per stage: `built → validated → saved → dispatched → delivered`, or `dropped` with the reason) and `platform_heartbeat` / `platform_downtime` so "was the platform even up when that candle closed?" is answerable — a missing signal has two very different explanations and nothing could tell them apart. `signal_id` is nullable on purpose: the most valuable events happen before the row exists. Also fixed the silent drops themselves — `_send_photo` returned `None` unconditionally so every caller read a total send failure as success, and the "no target chat" branch DISCARDED a saved signal at `log.debug`. Both are now loud, and a `dispatched` row with no `delivered` names the failure exactly. See `docs/signal-platform-observability.md`. |
| 2026-07-26 | **AUDIT — two dead features removed, one hardcoded number derived.** (1) The **LATE-ENTRY path is DELETED**: it flagged a pullback sitting further from the line than the momentum candle's own height, then required ≥1R of the original move to remain. **Both halves were provably unreachable.** The flag: real pullbacks sit at a median 30% and a MAX 96% of that height, so a 1.00x allowance can never fire — the same geometric vacuity this doc already warns about for the literal reading, reintroduced by picking 1.00x. The guard: with `d` = entry's distance past the line and `gap` = stop's distance behind it, `risk = d + gap` and `remaining = 2·risk − d`, so `remaining ≥ 1R` reduces to `gap ≥ 0` — guaranteed by the stop-behind-the-line invariant. Measured **0 of 1,325 signals** flagged, max `d/risk` **0.99**. `_LATE_MULT`, `_LATE_MIN_RR`, `_allowed_offset` and the card's late-TP branch all removed; the payload keys stay as constants so the DB row and card need no change. (2) **`_MIN_SL_ROOM` 5 pips → DERIVED** (1.0x the 1M's recent average range): a flat pip count that fired on **9.7%** of signals and pinned them all to the same risk whatever the market was doing. (3) The `vix1_entry` header docstring still described LINE 2 as settled fact — corrected. **Verified: 1,325 signals across GBP+EUR 26mo OOS + GBP Jan–Jul 2021 pass 10 runtime invariants** (entry past the line, stop strictly behind it, stop clears the pullback candle, risk ≤ one 1HR candle, entry is an unfilled STOP order, target on the correct side, no rounding onto the line). Mechanical scan: no unused imports, no unread constants, no uncalled functions. Results unchanged — in-sample 2021 **40.0% WR / +13.0R**, OOS 700 trades **32.6% / −9.0R**. |
| 2026-07-26 | **THE STOP MAY NEVER SIT PAST THE LINE** — a regression introduced and caught the same day. While the SL was anchored to "line 2" this held for free (line 2 always lay beyond line 1, so **178 of 178** signals kept the stop behind it). Deleting line 2 removed the guarantee and nothing replaced it: the region-of-interest stop hunts the NEAREST 1M level beyond the pullback, and the nearest is usually still short of the line — only **58 of 146** stayed behind it, median **0.8 pips on the wrong side**, i.e. the trade could be stopped out while price was still on the winning side of the level the setup is built on. Fixed as a FLOOR, not a replacement: a region already behind the line is kept (it is a level the market drew); one that is not is pushed to the line plus a derived gap (0.5x the 1M's recent average range — his setup-1 gap was 2.6p against a 4.3p average = 0.60x). Strict `>=`/`<=`: a stop resting exactly ON the line is taken out by a touch of it. **RESULT: 144 of 144 behind the line; median stop 6.5p -> 9.1p (his own median is 8.3p); setup 1 reproduces at entry 1.38231 = his exactly, SL 1.38378 vs his 1.38381.** In-sample 2021 **40.0% WR / +12.0R**, the best of the investigation. Out of sample FLAT — 703 trades, 33.0%, -3.0R. Kept for fidelity; it does not make the strategy profitable. |
| 2026-07-26 | **THE CHOP FILTER WAS REJECTING HIS REAL PULLBACKS — step 4 rewritten.** `is_pullback_candle` disqualified any candle with `body >= 1.5x avg OR range >= 2.5x avg`, commented as "the platform's own volume/violent-candle thresholds". **Wrong three times over:** (1) INVERTED — `patterns/volume_patterns` fires a VOLUME CANDLE at body >= 1.5x avg and grades its STRENGTH 0->1 from 1.5x to 3x, and `patterns/wick_patterns` documents its violent candle as *"large body AND long wick — high volatility, DIRECTIONAL CONVICTION"*. Both are conviction signals; the code used the threshold for "strong" as "reject as chop". (2) **OR where the platform uses AND** — its violent candle needs body >= 1.5x avg AND range >= 2.5x avg. (3) The range-only test **exists nowhere in the platform**; it was invented. **Cost:** his setup-1 pullback (2021-07-06 14:07 UTC, 5.9p body in a 5.9p range — 100% body, 2.6x the average, the cleanest candle of that hour) was rejected by both caps; the code waited five minutes and anchored on a weaker one. Chop is now what chop IS — a WHIPSAW, `range >= 2.5x avg` **AND** `body < 60% of range`, both halves required. Size alone never disqualifies. **RESULT: the code now selects his exact candle and his exact entry price, 1.38231.** Aggregate is noise either way — OOS 590 trades 34.7% / +19.0R (t=0.62) against 545 / 36.5% / +39.0R (t=1.33) before; in-sample 2021 34.0% / +1.0R. Shipped for correctness. |
| 2026-07-26 | **THE PULLBACK MUST SIT PAST LINE 1 — RE-ADDED** (user: "just make sure any pullback is past the 1HR line"). Enforced in `vix1_pullback.find_pullback`, whole-candle, on the edge FACING the line (the LOW on a buy, the HIGH on a sell); touching allowed. **Audited before the fix, Jan-Jun 2021: 53% of the pullbacks the code anchored on were NOT fully past the line, and the 8% of entries that landed outright BEHIND it returned 12% WR / -5.0R** — he called this himself ("I suspect the code is entering trades behind the 1HR line"). After: 0 of 160 signals behind it on every measure, entry median +3.1p -> +5.8p past the line. **EFFECT: in-sample 29.8% -> 37.3% WR and -9.0R -> +9.0R (107 trades); out-of-sample NOTHING — 910 trades over 2 pairs x 26 months, 33.2% -> 33.2% WR, -4.5R -> -3.5R.** Kept because it is his stated rule and the code was demonstrably violating it, NOT because it pays. The in-sample swing is noise at n=107. The 2026-07-25 row below says "do not re-add" — that is SUPERSEDED; it rested on my screenshot reconstruction of his pullbacks, the same source that invented "line 2" and the symmetric wick cap. |
| `3f383c0` 2026-07-26 | **"SHORT WICKS" MEANS THE COUNTER-WICK** — the symmetric 10% cap shipped hours earlier is REVERTED. His own setup 1 rejected it: a 70%-body bear he traded to +2.28R has a 7.5% counter-wick and a **22.7% with-move wick**. Both his statements hold at once because the wick he calls "very short" is the one against the move. See the setup 1 walk-through below. |
| `8811288` 2026-07-26 | **PRO-TREND ONLY** (user: "Only trade pro trend"). `choch`/`choch4` origins REMOVED from `vix1_bias` — a reversal against the prevailing trend is by definition not pro-trend, and they are redundant since the trend now flips on exactly the CHoCH event, so the next momentum candle that way qualifies as plain `trend`. Confirmed by setup 1, where his "it broke the BOS and confirmed it" reasoning IS `origin='trend'` at the production window. (The same commit shipped a both-wicks ≤10% cap and claimed the frequency gap was closed at 6.7 trades/mo — **both wrong**, see the row above and the harness-bug section.) |
| `ea5c19c` 2026-07-26 | **THE TREND IS NOW MARKET STRUCTURE THAT PERSISTS, not a 36-bar slope.** His model, which is Dow's own rule: there is a MAIN trend, inside it there can be ranging or unreadable movement, and it stands until the market shows DECISIVELY that it changed. Modern structure gives the test - a trend continues through a BOS and turns only on a CHoCH (a BODY CLOSE through the swing protecting it). ESTABLISH on HH+HL / LH+LL; HOLD through consolidation; FLIP only on that close. **The old slope was stateless and instantaneous** - recomputed from scratch every bar, no memory, structurally unable to express persistence: over 3,075 H1 bars it read FLAT on **35%** and made **29 round trips** (trend -> flat -> the SAME trend, no reversal). His 30-Jun-2021 example is the case in miniature: an obvious multi-day downtrend the 36-bar window called flat, missing its own threshold by **2.7 pips** because the window sat inside the consolidation at the bottom of the move. MEASURED on his 34 logged trades at the production 120-bar window: agreement **41% -> 74%**, reads-flat (which silently kills a setup) **35% -> 0%**, state changes **165 -> 57** (~1 every 2.2 days), and his 30-Jun example **0 -> -1**. A first attempt flipped 8 times in 8 days because it advanced the protected level to EVERY counter-swing; protection now advances only on a real BOS, so highs printed while a downtrend consolidates are noise INSIDE the trend, not the level defining it. **CONSEQUENCE (deliberate, approved):** the 1HR trend is never 'unclear' any more, so the **4HR fallback (trend4/choch4) no longer fires** - it existed to cover the old detector's blindness. 1HR stays primary. **KNOWN LIMIT:** the verdict still varies on **4%** of bars across the 118-121 bars the feed delivers; a warm-up margin (0/5/10/15/20/30) was tested and did not help, so no complexity was added for no gain. |
| 2026-07-25 | **CALIBRATED ON 22 REAL TRADES (2021 GBP/USD, real cTrader H1+M1).** Five changes. (1) **REVERTED the past-the-line pullback gate** added 3 days earlier: measured on the real setups only **9-10 of 19** pullbacks kept their extreme past line 1 (robust at every timezone offset), so it was blocking ~HALF his trades. His rule is about ORDER (price crosses the line, THEN the retrace forms), not geography - a retrace naturally pulls back through the line by a pip or two. `traded_past` + the line-2 tolerance already enforce it. **Do not re-add.** (2) **Body gate 60%->50%** - his thinnest real momentum candle is 51% body (a TP winner); 60% rejected 3 of 22. (3) **RESTORED `body > previous candle body`** - his own theory, **22/22** of his trades pass (median 2.96x, min 1.06x); measured over 41,900 H1 bars it strips **596 of 4,980 (12%)** of the scanner's output at zero cost to real setups. It is a COMPANION to the 2.5x-median test, never a replacement (alone it admits a tiny candle that merely beats a tinier neighbour). (4) **Pullback distance is now DYNAMIC** - allowance = the momentum candle's own height, replacing a hardcoded 7p that rejected 3 of 22 (their pullbacks sat 7.7p/10.1p/12.7p out). (5) **A pullback past the allowance no longer dies** - it ships flagged "past the recommended entry price" if **>=1R** of the original move remains (normal entries still need 2R), and the card reports the REAL remaining RR, never a fictional 2R. **Detector now accepts 22/22 of his momentum candles (was 16/19); total signal volume -5.8%.** |
| 2026-07-25 | **WHY THE DYNAMIC RULE IS NOT THE LITERAL INSTRUCTION - read before "fixing" it.** He asked for "the height of the 1HR candle that comes AFTER the first volume candle". That is geometrically VACUOUS: the candle after the momentum candle is the hour the pullback happens in, so the pullback's distance from the line and that candle's height are measured over THE SAME BARS - the line sits at the window's start and the pullback's extreme lies inside the window, so distance <= range ALWAYS, at any threshold. Proven numerically (0/19 flagged, and no threshold changes it); the same bound defeats every variant (distance past the line, retrace depth). The MOMENTUM CANDLE's height keeps everything intended - dynamic (it IS current 1HR volatility), no lookahead, cannot drift (closed candle) - while being a DIFFERENT candle, so the comparison is real. Real pullbacks sit a median **6%** and a max **35%** of it from the line. |
| 2026-07-22 | **the pullback must TAKE PLACE past (or ON) line 1 — BOTH paths, fractal included** (user: "even fractal break requires pullback only after price has gone past 1HR line or on 1HR line. No entry takes place in pullbacks that dont take place past the 1HR candle close line"). `traded_past` alone only proved price crossed the line at SOME point — the latest retrace could still be a pullback that formed BEFORE the break, or back on the wrong side after price collapsed through the line, and it anchored the entry. Now the pullback candle's line-side extreme must sit at/past line 1 ("on" = touching allowed). 2-yr backtest: trims ~8% of signals, win rate unchanged — a fidelity fix, not a filter |
| 2026-07-22 | **PENDING-ENTRY lifecycle** — the monitor scored every saved signal as an open position from birth, but a VIX.1 entry is a STOP ORDER: setups that reversed before filling were recorded as SL losses (and TP touches as wins) for trades that never opened. New `triggered_at` column (models.py + schema.ts + docker-migrate.sql): NULL = pending; entry touch stamps it; SL touch while pending = **CANCELLED (expired, never a loss)**. Monitor now releases dedup keys on `expire_stale` too — an expired signal used to hold `vix1:symbol:direction` until restart, silently MUTING the strategy for that pair+direction (guaranteed by any Friday-evening signal) |
| 2026-07-22 | **the pullback candle is ANY type — volatility/violent excluded** (user rule). The old filter demanded a real body and skipped dojis; now the FIRST candle of the retrace anchors whatever its shape, and only an ABNORMAL bar disqualifies (body ≥1.5× / range ≥2.5× the 1M's 14-bar avg body — the platform's volume/violent-candle thresholds). Retrace opening on such a bar = chop, no entry. 2-yr backtest: GBP 30.1→32.7% WR, EUR 31.1→29.9%, net +0.7pt — entries anchor earlier/tighter |
| 2026-07-22 | **1M LEVELS off the forming bar** — pullback candle, fractal levels+break and SL regions now read the CLOSED slice only; live bar keeps answering the trigger questions (see "Levels closed, triggers live"). (Its companion "doji may not anchor" rule was superseded the same day by the any-type rule above) |
| 2026-07-22 | **WATCH aligned with the settled rules** — `_LOCK_TTL` 3h → 24h ("a bias flip ends a setup; a timer never does" — the only clock left is the signal's own 24h DB expiry; hours 3-24 used to be publicly active but unwatched). M1 trigger scan now runs BEFORE the bias-flip check so a FILLED trade can never come back "invalidated". Invalidation now also RETRACTS: DM only if the signal was actually delivered (`_locked["key"]` + delivery_ledger), cancels the pending DB row (`signal_repo.cancel_active` — the public card must not stay live after the strategy called the setup dead) and frees the dedup key. Correlation warnings likewise count only DELIVERED signals |
| 2026-07-22 | **AI/Gemini validator REMOVED** (user: "remove AI from validation i dont use it anymore") — `validation/ai_validator.py` deleted, runner step + `gemini_api_key` gone. Also fixed: close cards (`on_signal_closed`) now follow the same DM-only routing as entry cards — they used to always hit the PUBLIC channel, leaking a DM-held strategy's outcomes to subscribers who never saw the entry |
| `089b3fe` | **momentum-candle rebuild** — size vs the 100-bar MEDIAN body (not the previous candle), body ≥75% of range, asymmetric wick cap; `vix1_momentum.py` split out. Plus the **`choch` context** (structure change), and the rename throughout. `_MIN_RUN` stays 1 — **that is the market, not a bug** |
| `a4d9cb2` | **the WATCH judged a setup on price from before it existed** (`locked_at - 3600`). 70% of 214 real setups resolved on pre-lock bars — 65 false "INVALIDATED" DMs, 44 silently dropped as "triggered" and left unwatched. Now bars that opened at/after the lock; `_WATCH_M1` 120 → 200 so the slice spans `_LOCK_TTL` |
| `a4d9cb2` | **wrong-direction bug in the RANGE branch** — no freshness guard, always tried bullish first, so it returned the STALE run when both qualified (18/26 EUR, 12/18 GBP → 0 after). `0b24492` fixed exactly this for the TREND branch and it was never applied here — **if you touch either branch, apply it to BOTH** |
| `e8d2935` | **the SL is a 1M region of interest**, not a number I made up. `15`/`20`/`5` deleted; floor structural, ceiling = one 1HR candle |
| `54eff8d` | fractal = 1–4 candles (not Williams); **the LINE decides alignment**, `clear_trend` out of the 1M. 3/6 → **6/6** |
| `34ba9ca` | volume candle + line must come from a **CLOSED** 1HR candle. Was **70 of 82** prod log lines — VIX.1 idle ~85% of the time |
| `0bc6a58` | line 1 gates the entry, line 2 only adjusts the stop; price must have **traded past** line 1 |
| `0b24492` | **wrong-direction bug**: stale structure + fresh opposing volume signalled SELL off a 10-bar-old candle. Also tie-proofed `clear_trend` |
| `c847c1c` | dynamism: doji inside a retrace, at-the-line, 0.2-pip knife-edge, 0.1-pip body, equal-low fractals — all were coding a clean chart |
| `b2ed55e` | the pullback must be **PAST** the line |
| `4cd3d5b` | audit: doji counted as a pullback; the alignment gate was permanently True |
| `84a2ea5` | the two lines (body close + wick line) |
| `8600c97` | wick **out** of the pullback; stop off the **FIRST** pullback candle |
| `6e95e73` | fractal break **confirms**, the pullback **IS** the entry (they are sequential, not alternatives) |
| `3abd3e3` | restored the fractal case; dropped the 1HR clock |
| `ef6ff8b` | root cause of the original misses: `_VOL_LOOKBACK` allowed a 12h-old candle but the 1M slice was 2h |

## Files
`vix1.py` (orchestration) · `vix1_bias.py` (1HR volume rules) · `vix1_trend.py` (structure —
**1HR only**) · `vix1_lines.py` (the two lines) · `vix1_fractal.py` (1–4 candle fractal) ·
`vix1_pullback.py` (the entry level) · `vix1_roi.py` (**regions of interest = the SL**) ·
`vix1_entry.py` (assembly) · `vix1_signal.py` · `vix1_watch.py` ·
`vix1_spacing.py` (**how long the instrument stays shut after a signal — 3 momentum candles while
the previous one runs**)

## Closed — do NOT re-raise these
- **GAP 2 (the fixed 60-minute alignment window)** — CLOSED by `54eff8d`, incidentally. `clear_trend`
  used `m1[-60:]` always, so a setup that lined up 3h ago but chopped in the last hour read "not
  aligned" forever — judging a 5-hour story through a 1-hour window. The alignment test now uses **no
  window at all**: it asks where price *is* vs the line. Where a window is still used
  (`fractal_broken`, `find_pullback`) it is `win` = **everything since the line was drawn**.
  Verified: line drawn 3h ago, aligned 2h ago, last hour pure chop -> entry still fires.
- **GAP 2b (M1 holds ~4.2h, so a 5h-old line truncates the window)** — dissolved by the same change.
  All three consumers of `win` are unaffected: the alignment test reads current price (no window);
  `fractal_broken` only needs the LAST fractal (recent); `find_pullback` needs the latest retrace
  (recent) and `traded_past` is trivially true whenever price is currently past the line.
  *(Reasoned, not tested — re-check if it ever looks suspect.)*
- **GAP 3 (the wick estimate)** — dead. Measure candle 2's wick live off the M1; never estimate.
  ~8.5k real pairs: correlation ~0.2, beats a random shuffle by 3 points.

### Routing
**ENTRIES → the public channel** (`strategy_id = "vix1"`; the `_watch` suffix is what the
dispatcher reads as "unconfirmed, DM only"). The entry IS the 1M pullback — the moment to place the
stop — so it goes out as a full signal card. It is a real saved signal, so the monitor also closes it
on TP/SL and the channel gets that. The **invalidation alert keeps `vix1_watch` and stays a DM**:
it is a correction, not a signal.

### NEVER burn a dedup key at build time
`self.fired.add(key)` right after `build_signal` burns the key the instant the signal is BUILT —
before the validator, the risk filters, the AI validator or the save. Anything that rejects it
downstream then kills that setup **forever**, silently, because the registry is DB-persisted.

The key is stamped as `signal.dedup_key` and committed by `signal_validator.register_confirmed`,
which the runner calls the instant a signal is REAL (saved, about to dispatch). Rejected → not
committed → re-fires next scan. That is what at-least-once means.
(`alert_only` signals never reach there — they are not saved, so the dispatcher commits them on a
confirmed send instead. Same rule, different definition of "real".)

### Dedup is PER STRATEGY — `strategy:symbol:direction`
It used to be `symbol:direction` across ALL strategies, so whichever tenant fired first that tick took
the pair+direction and every other strategy's signal vanished with a debug line. A strategy still
cannot duplicate itself; it can never block another. Holds for any number of strategies (tested to
20). Defined in ONE place: `signal_validator._key`. The old comment claimed the scope was also
"enforced by the DB unique constraint" — **there is no such constraint** (checked models.py,
schema.ts, docker-migrate.sql).

## Testing trap — you CANNOT backtest the 1M entry with yfinance
Every yfinance forex **1m** bar is `open == high == low == close` — 9,887/9,887 on `EURUSD=X`.
Not "sparse": no bodies at all, so `avg_body` is 0, no candle is bullish or bearish, and the entry
reports *"aligned but no pullback candle with a real body"* on every tick forever. A harness fed that
sees **zero signals across the whole history** and looks exactly like a broken strategy — the trap is
that the log line is a legitimate one, so nothing announces the data is dead. Degeneracy by interval:
`1m` 100%, `2m` 57%, `5m` 14%, `15m` 1.1%, `30m`/`1h` <1%. **Use `5m` bars as the entry stream when
replaying** (the entry logic is TF-agnostic — it only reads `vc.timeframe`) or pull real M1 from
cTrader. Production is unaffected: `data/data_source.py` is cTrader-only and raises rather than
falling back. Filter `O==H==L==C` bars out of any fixture before trusting a funnel count.
(`data/candle_fetcher.py:4` still documents a "cTrader → MT5 → yfinance" fallback that no longer exists.)

## Known gap — SPREAD IS NOT MODELLED AT ALL
`risk/spread_filter` exists and `strategy_runner:133` consults it, but only `if strategy.requires_spread`
— which both strategies leave `False` — and `build_context` is never passed a spread, so it is always
`None`. Nothing sees spreads. This matters most in the Asian session (widest spreads, and a 5.3p
structural SL is small next to a 2-3p spread). Enabling Asian did not create this; it made it matter.

## TWO BACKTEST-HARNESS BUGS — every number produced before 2026-07-26 was wrong

Found by replaying his walked-through setup 1 (GBP/USD 2021-07-06) by hand. Neither was in the
strategy; both were in the harness, so they silently corrupted every backtest conclusion.

1. **The M1 search started at minute 30.** `for k in range(30, …)` — the harness did not call
   `m1_signals` until 30 minutes of the entry hour had passed. `m1_signals` needs **2** bars and the
   live scanner evaluates every 60s, so production can fire at minute 2. On setup 1 the live path
   fires at **14:03** with entry 1.38316 / risk 7.6p; the harness first looked at 14:29 and produced
   entry 1.38072 / risk **32.0p** — a completely different trade, because `find_pullback` anchors the
   LATEST retrace. This is the mechanical source of "his fills are always earlier than the code's".
2. **A 140-bar H1 window where production requests 120** (`vix1.candle_counts[H1] = 120`). On setup 1
   `clear_trend` reads **+1 (up) at 140 bars and −1 (down) at 120** — the harness rejected as
   counter-trend a trade production would have taken pro-trend. This is the documented ~4%
   window-sensitivity, and it is enough to flip whole trades.

**Any harness that replays this strategy must use `candle_counts` verbatim and start the M1 search at
bar 2.** Corrected GBP/USD Jan–Jun 2021: 18.5 trades/mo, 29.4% WR, −10.0R; same-day agreement with
his log rose 12 → **20 of his 30 trade-days**.

## Setup 1 walk-through — GBP/USD 2021-07-06 (his first worked example)

His trade: SELL **1.38231**, SL **1.38381**, TP **1.37889** = **+2.28R**. The momentum candle is
**13:00 UTC** (14:00 on his JForex chart — reconfirms **UTC+1**), close **1.38355** = the line he
drew at 1.38353. His reasoning: *"the price was in uptrend but it started downtrending so i took the
trade because it broke the BOS and confirmed it"* — i.e. pro-trend **relative to the newly confirmed
trend**, which is exactly what `clear_trend`'s flip-on-CHoCH is supposed to express, and it does
(−1 at the production window).

What the fixed code produces: **right direction, right grounds (`trend`), SL 1.38392 vs his 1.38381 —
1.1 pips apart.** The SL anchor is not the problem. **The ENTRY is:**

| | entry | distance below the line | risk | result |
|---|---|---|---|---|
| him | 1.38231 | 12.4p | 15.0p | **+2.28R** |
| code | 1.38316 | 3.9p | 7.6p | **BE, +0.00R** |

The code fires at 14:03, when price had travelled **2 pips** past the line, and anchors on that
micro-retrace. It reaches +1R at 14:05, moves to breakeven, and the ordinary retrace to 1.38324 at
**14:08** takes it out — before the move ran on to 1.37877. He waited for a real ~17-pip impulse leg
away from the line, then sold the break of its low; his 15p stop absorbed the same retrace.

**HYPOTHESIS (n=1, do not implement until setups 2–4 confirm it):** the 1M needs a *completed impulse
leg* past the line before a retrace counts as the pullback. `_allowed_offset` bounds how far the
pullback may sit from the line (an upper bound); there is **no lower bound**, so any 2-pip wiggle at
the line qualifies. That single missing condition would explain both the over-firing (18.5/mo against
his 5.7) and the shake-outs.

Also unshipped, and still true: `_MIN_SL_ROOM` floors a structurally tighter stop at a flat 5 pips —
33 of the 111 corrected 2021 trades. Skipping those instead of flooring them scored better on the
pre-fix harness; re-measure it on the fixed harness before deciding, and only after the entry
question above is settled, because a 7.6p stop that should never have been taken is not a stop-size
problem.

## Open / not done
- **GAP 1** — CLOSED (`e8d2935`). It was never a gap: I framed it on *line = invalidation*. Far from
  the line is an ADVANTAGE. The real change underneath was replacing my invented `15`/`20`/`5` with a
  region of interest.
- **`self._locked` is RAM-only** — a redeploy forgets a pending setup, so its invalidation alert is
  lost. The signal itself is safe (DB-persisted dedup).
- Phase 2 (2% pending stop orders) / Phase 3 (BE, partial, trail).

### KNOWN OPEN DEFECTS (found 2026-07-27, deliberately NOT fixed — decided with the user)

- ~~**`clear_trend` IS WINDOW-DEPENDENT.**~~ **FIXED 2026-07-29** — see the fix-log entry at the top.
  The cause was the swing SCALE, not the algorithm: 3-bar swings over a 120-bar window resolved
  7-hour wiggles and could see nothing older than two days. Now 48-bar swings over 1,500 bars, with
  agreement across window sizes at 84%/80% and trend changes down from 183/166 to 37/36 over four
  years. Note the `ea5c19c` row's "KNOWN LIMIT: the verdict varies on 4% of bars" **understated this
  badly** — it measured jitter within a three-bar span, not sensitivity across realistic windows.
- **There is no exhaustion / "price ran too far" rule.** All 9 rejection reasons in `vix1_entry`
  concern the pullback's SHAPE and POSITION; none asks how extended the move already is. So a late
  entry at the tail of a completed move is accepted — which is exactly what the delivered 27 Jul
  signal was, 21 pips and three legs into the move. The user's decision (C1) was to ship the spacing
  rule alone first: it already refuses that specific trade, and stacking two new filters at once
  would make any change in signal frequency unattributable. Revisit once spacing has been measured.
