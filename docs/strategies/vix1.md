# VIX.1 — the Volume Strategy

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
- **The pullback candle is ANY type — doji included** (user 2026-07-22: "just look for one pullback
  candle of any type... so long as that pullback is not volatility candle and not violent candle
  typical of market choppiness"). This SUPERSEDED the old "a doji is not a pullback / real-body"
  filter. The only disqualifiers are ABNORMAL bars: a **volatility candle** (body ≥ 1.5× the 1M's
  own 14-bar avg body) or a **violent candle** (range ≥ 2.5× it) — the platform's own pattern
  thresholds. A retrace that OPENS with one gives no entry: that is chop, stand aside.

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
| **CLEAN** | body ≥ **60%** of its own range | Lowered 75%→60% (user 2026-07-21): 75% demanded a near-wickless marubozu; real volume candles run thinner. 60% is the GATE floor — the shape is now **graded**, not just gated (see below) |
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
`vix1_entry.py` (assembly) · `vix1_signal.py` · `vix1_watch.py`

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
