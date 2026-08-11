# VIX.1 — architecture map (2026-07-27)

**Read this before changing anything in VIX.1.** `vix1.md` holds the settled RULES (his words, the
playbook's words) and the fix log; this holds the SHAPE.

**VIX.1 is self-contained.** It uses only platform RESOURCES — candles, news, pip size, dedup, the
monitor — and no trading logic from anywhere else. Build it, judge it and fix it on its own terms and
on the playbook; never by analogy to anything else.

---

## The model, in one paragraph

**1HR says which way; 1M says when.** A confirmed trend carried by momentum sets the bias off the
FIRST momentum candle of a run. A LINE is drawn from that candle's body close. On the 1M, price must
be past the line, then the first pullback candle past it becomes the entry — a **stop order** just
beyond it, so a reversal never fills. SL is the nearest 1M region of interest; TP is 2R.

```
 H4 (closed) ── clear trend ─┐
                             ├─► detect_bias ──► 1st momentum candle ──► draw_line (body close)
 H1 (closed) ── momentum ────┘                                                │
                                                                              ▼
 M1 (forming bar KEPT) ──► past the line? ──► find_pullback (CLOSED bars) ──► entry_trigger
                                                                              │
                                        stop order beyond the pullback · SL from ROI · TP 2R
                                                                              ▼
                                            vix1_signal (card) ──► LOCK ──► vix1_watch
                                                                              │
                                            monitor ──► vix1_alerts ──► R ratchet (ADVICE ONLY)
```

## The invariant that governs everything

**A LEVEL comes from a CLOSED candle; a TRIGGER or current price stays LIVE.**

- `vix1.py:86-87` — H1 and H4 go through `closed_only`. A line that moves every scan is not a line.
- `vix1_entry.py:87` — `wcl = win[:-1] …` — the pullback candle, fractal levels and SL regions are
  read from **closed** bars; `win` (live) answers only *trigger* questions: has price traded past the
  line, which side is it on, is the stop still unfilled.

VIX.1 has shipped a bug from reading the forming bar as a level, and **a backtest can never catch it**
— every historical bar is closed, so the error is invisible to replay and only appears live.

---

## Module map — 20 files, ~2,400 lines

| file | owns |
|---|---|
| `vix1.py` | orchestrator: watch → bias → news gates → **spacing** → 1M signals → grade → build |
| `vix1_spacing.py` | **how long the instrument stays shut after a signal** (added 2026-07-27) |
| `vix1_bias.py` | `detect_bias(h1, h4, symbol) -> Bias \| None` — momentum on H1, trend on H1 (H4 only as a fallback) |
| `vix1_state.py` | **`Bias` (what the 1HR decided) + `market_state` (the state it decided it in)** — added 2026-08-11 |
| `vix1_retracement.py` | **the retracement, counted in real time** — `bars` (the pullback this candle came after) and `stall_bars` (how long since the trend made progress). Added 2026-08-11, decides nothing yet |
| `vix1_regime.py` | **directional efficiency — the range detector VIX.1 never had.** Added 2026-08-11, decides nothing yet |
| `vix1_momentum.py` | momentum-candle detection + `momentum_grade` (A/B/C → confidence) |
| `vix1_building.py` | the "setup building" card — a setup seen before its entry exists |
| `vix1_log.py` | per-symbol log throttling, so a silent scan does not spam |
| `vix1_trend.py` | `trend_state` / `clear_trend` — the trend as structure, plus the BOS and CHoCH that move it |
| `vix1_structure.py` | `fast_pattern` / `leg_state` — the ONE refusal: is the faster structure trending the opposite way (a pullback)? Never decides direction |
| `vix1_lines.py` | `draw_line` — ONE line, the momentum candle's body close |
| `vix1_pullback.py` | `find_pullback` — the counter candle, and the past-the-line gate |
| `vix1_fractal.py` | fractal levels/breaks for the wrong-side case |
| `vix1_entry.py` | `m1_signals` — alignment, entry, SL, TP (largest file, 228 lines) |
| `vix1_roi.py` | `regions` / `sl_from_regions` — SL from structure, **never a pip count** |
| `vix1_signal.py` | the card |
| `vix1_watch.py` | invalidation of a LOCKED pending setup |
| `vix1_manage.py` | the R ratchet state machine |
| `monitor/vix1_alerts.py` | emits the ratchet advice (wired at `signal_monitor.py:94`) |

## Entry, stop, target

| | rule |
|---|---|
| **Bias** | 1st momentum candle of a run (`_MIN_RUN = 1` — deliberate; measured on 1,433 real momentum candles) |
| **Line** | that candle's **body close**. ONE line — line 2 was deleted |
| **Alignment** | our side of the line → the pullback IS the entry. Wrong side → the counter-move's last fractal must break first |
| **Entry** | a **STOP order** just beyond the first pullback candle *past the line* — a reversal never fills |
| **SL** | nearest 1M region of interest beyond the pullback (`vix1_roi`) — **never a pip count** |
| **TP** | **2R** — the two-1HR-candle move |
| **Management** | R ratchet: 2R → lock 1R, 3R → lock 2R … **ADVICE ONLY** (see below) |
| **Spacing** | while a signal on this INSTRUMENT is still running, the next needs **3 momentum candles closed after the previous signal's anchor candle**. A closed previous signal — *including a loss* — voids the wait |

### Signal spacing (`vix1_spacing.py`) — added 2026-07-27

The user's rule verbatim: *"if a viable signal is detected immediate[ly] the previous one was taken
and is still running, it must be after 3 momentum candles preceding the 1HR momentum candle where the
first signal was taken has been achieved… However, if the first signal was a loss, the second one if
meets conditions can be fired. This only applies for signals from the same instrument."*

| aspect | rule |
|---|---|
| **scope** | the INSTRUMENT — EUR/USD never gates GBP/USD, and it covers buy and sell alike |
| **when** | only while a previous signal on that instrument is `active` (a resting stop order counts) |
| **anchor** | the 1HR **momentum candle** that produced the previous signal — NOT its creation time |
| **gate** | `_MIN_CANDLES = 3` momentum candles must have CLOSED after the anchor |
| **counting** | any momentum candle, either direction (`_COUNT_BOTH_DIRECTIONS = True`) |
| **release** | a CLOSED previous signal voids the wait entirely, **loss included** |
| **failure** | fails OPEN on a DB error (other guards stand), but always logs why |

**The invariant: DERIVED, NEVER STORED.** The anchor is re-derived from the H1 window (the freshest
momentum candle that had closed when the previous signal was created) and "is one still running" is
asked of the DATABASE. Nothing lives in RAM — deliberately, because the duplicate-signal defect found
the same day was caused by exactly that kind of process-local state.

**This stacks with one-signal-at-a-time; neither replaces the other.** That rule is per
instrument+direction and is enforced in the database; this one is per instrument.

### Momentum-candle gates (`vix1_momentum.py`)
`_MIN_BODY_MULT 2.5` × the 100-bar median body · **`_LONG_BODY_MULT 2.12` × the 2,000-bar median
body** · `_MIN_BODY_FRAC 0.50` of its own range · `_MIN_VS_PREV 1.0` (bigger than the previous body) ·
`_MAX_CWICK_FRAC 0.25` counter-wick.
A-grade: `_A_BODY_FRAC 0.75` + `_A_CWICK_FRAC 0.15` → `_A_CONF 0.85`.

**These were calibrated 2026-07-20/21 against his real candles. Do not re-tune them without his data.**

### The SECOND size test — the long window (added 2026-08-10)

**Two size tests, ANDed.** The 100-bar one is only ~4 trading days and a quiet spell collapses it:
GBP/USD 10-Aug 09:00 UTC, median body 2.9p, so `2.5×` asked for just **7.25 pips** and a 7.5-pip
nothing candle fired a signal. The second test asks `2.12 ×` the median body of the last **2,000
bars** as well, a window a quiet week cannot move.

| | |
|---|---|
| **where 2.12 came from** | HIS standard, not a chosen number. Two GBP/USD candles he named as the minimum he would trade (06-Aug 14:00 and 15:00 UTC, bodies **11.3p** and **12.4p**): 11.0 / 5.20 = **×2.12**; the equally-rare EUR/USD body (8.4p) / 3.95 = **×2.13**. One number serves both pairs |
| **today it asks** | ~**11.0p** GBP/USD · ~**8.4p** EUR/USD |
| **how often it BINDS** | 14% GBP/USD · 16% EUR/USD — the dead patches only; ~85% of the time the 100-bar test is already stricter and nothing changes |
| **cost** | ~1.7 momentum candles per month per pair (55.5→53.8 GBP/USD, 56.2→54.3 EUR/USD) |
| **why 2,000 and not 3,000** | the fetch asks for a WINDOW of `(count+10)` HOURS, but H1 bars exist only while the market is open — 120 a week, not 168. `count=3000` spans 125 calendar days and delivers **~2,150** real bars. 2,000 is what can be relied on |
| **short history** | under `_LONG_MIN_BARS` (1,800) the test SKIPS rather than rejects — a strategy going silent on a short window is a worse bug |
| **float tolerance** | `_LONG_EPS 1e-6` pips. His own 11.3p candle computes as `11.30000000000075`; without tolerance a candle genuinely on the line could be refused by the rule built from it |
| **satisfies** | his settled rule *"nothing hardcoded where the market can say it"* — a flat 11-pip floor would have broken it, and would also have gone stale (GBP/USD's median body halved between 2022 and 2024) |

**`symbol` is a REQUIRED argument** on `is_momentum_candle` / `momentum_run` / `veto_reason` and is
threaded through `vix1_spacing` too. Not defaulted: `pip_size("")` returns the right value for these
two pairs and would be **silently wrong** for a yen pair. A caller that forgets must fail loudly.
`vix1_spacing` uses the same test on purpose — **a momentum candle must mean ONE thing**, or the
spacing gate would count candles the setup would not.

### The turn is TWO-STAGE, and the leg must prove itself (added 2026-08-11)

A body close through the protecting swing no longer flips the trend. It raises a **CHoCH — reversal
proposed**; the trend turns only once the new direction **confirms with a BOS**. Until then it reads
`0` ("changing") and nothing may be traded.

| | measured over 12 months |
|---|---|
| phases under two days (noise) | **2 -> 0** on both pairs |
| median phase length | GBP/USD 334 -> 411 bars · EUR/USD 246 -> 350 |
| the old FREEZE (`protected = None`, trend could never turn) | GBP/USD 62% of bars, once 873 bars — **gone by construction** |
| does a reversal mean anything? | median phase catches **+177 pips** (EUR/USD) / **+227** (GBP/USD) its own way; **1 of 70** phases never moved that way |

**A responsive protection level was tried and REJECTED** — moving protection to each counter-swing
reads a reversal earlier but takes trend changes 10 -> 14 / 10 -> 16, and `test_trend.py` failed it on
the 4-year stability property. Do not retry it without new evidence.

**`test_trend.py` counts COMPLETED reversals** (UP<->DOWN, ignoring the "changing" step) and prints
the OLD raw count beside it. The definition changed because a turn now has three states, not to
flatter the numbers — the user insisted both be kept visible.

**`vix1_structure` may only say NO.** Direction comes solely from `vix1_trend`; this module refuses
only when the faster (8-bar) structure is trending the OPPOSITE way — "the candle is in a pullback".
An unclear or mixed faster reading does NOT block a trade. Requiring positive confirmation was tried
and rejected: it permitted trading only 15-18% of the time a trend existed.

**The 4HR fallback is MUTED, not deleted** (`vix1_bias._ALLOW_H4 = False`) — kept on his explicit
instruction, with the dead-code rule waived in the comment. It was already dead (0 of 622 samples),
and the two-stage turn would have revived it into the reversal window (18% / 11% of momentum candles).

**Measured over 2 years, both pairs:** 11.4 setups/month GBP/USD, 14.4 EUR/USD; the pullback refusal
removes 26% of all momentum candles on BOTH pairs.

### PHASE A — the retracement is COUNTED, and a range is DETECTED (added 2026-08-11)

His rule: *"A pullback can be from 1 candle or more so it should count candles... After a rally we
start counting retracement candles and if a momentum candle comes after them we trade."* And:
*"length never disqualifies — the retracement, the reversal detector and the range detector work hand
in hand."*

**Why the 8-bar structure read could not answer it** — measured over 12 months, both pairs:

| | |
|---|---|
| it fires on the wrong SIZE of move | refuses at a median **58 pips / 43 bars**, allows at **19 pips / 14 bars** |
| it says nothing about a live pullback | counter candles just before: **0** when it allows, **1** when it refuses |
| it is 8 hours late by construction | a pivot needs 8 bars *after* it before it can be confirmed |
| it is blind to short retracements | **99%** of retracements run under 8 candles (48% are one candle, 26% two) |
| its most common answer is "cannot tell" | **40%** of momentum candles read "mixed" — which passes |
| nothing detected a range, ever | the trend reader **never once** said "no trend" in 12 months |
| so we trade chop routinely | our trades sit at efficiency **0.25** vs the market's **0.21** — the same market |

**Three layers now, one question each.** `vix1_trend` (48-bar structure) owns direction and the
reversal — **unchanged**. `vix1_retracement` owns the pullback. `vix1_regime` owns "is this still a
trend at all".

**`vix1_retracement` carries TWO numbers, and conflating them was a real defect** caught by measuring
after the plan was approved. `bars` is the retracement the latest candle **came after** — the candle
itself is stepped over, because a momentum candle goes the trend's way and a walk-back straight from
the end reported **0 at 100% of setups on both pairs**. `stall_bars` is candles since the trend last
made a new extreme — a different fact, median **156**, which is a true statement about the trend and
a useless answer to "how long is this pullback". Depth is given in pips **and** in ATR.

**`vix1_regime`** is directional efficiency: net distance ÷ path walked, over 20 closed bars. No
pivots, so no delay. **There is deliberately no threshold constant in the file** — the measured
distribution is perfectly smooth with no natural break, and cutting at 0.20 would call ~47% of all
time "ranging" and remove ~41% of current trades.

**THE MEASUREMENTS DECIDE NOTHING — with ONE exception, added the same day at his instruction.**
Both numbers are computed, printed on the card, on the heads-up DM, and on **every** log line
including the refusals (the refused setups are the comparison group). **Proven, not asserted:** the
12-month replay of the measurement-only step produced identical setups before and after (GBP/USD
377/377, EUR/USD 422/422, zero disagreements). Efficiency thresholds are still Phase B, set by the
user from real signals — picking them from one year of two pairs is how the n=12 swing width (55%
agreement) and the daily timeframe (65%) each looked right on the day and were worse over four years.

### THE ONE RULE THAT DOES DECIDE — a new trend must show its first pullback

`vix1_structure.developing_needs_retracement(maturity, retracement)`. His rule, and his instruction
to build it rather than hold it: *"So the first retracement and then when a momentum candle builds
showing the potential continuation of the price, we trade. If not, the trend is now confirmed and we
can get any momentum candle along the trend."*

| trend maturity | retracement before the momentum candle | verdict |
|---|---|---|
| **developing** (first HH+HL / LL+LH, no continuation yet) | none | **REFUSED** |
| **developing** | 1 candle or more — *length never disqualifies* | allowed |
| **developed** (≥1 break of structure behind it) | anything, including none | allowed — the rule does not apply |

**Measured through the live `detect_bias` over 12 months:** GBP/USD **167 → 120** distinct setups
(**28.1% removed**); on setups the leg gate already allows it refuses 24.9% (GBP/USD) / 14.0%
(EUR/USD) and **0 developed setups on either pair** — asserted in `test_structure.py`, not assumed.

**MATURITY IS READ AT THE MOMENTUM CANDLE, not at the latest bar.** The candle can be up to
`LOOKBACK=12` bars old (median 5) and a swing's confirmation can land inside that gap: measured, the
two reads differ on **0.9% of GBP/USD and 1.8% of EUR/USD** setups. So `detect_bias` replays the
trend on the truncated window (`t_mc`) and uses that for maturity, for the retracement's starting
point, and for the card's reason. If the candle formed mid-reversal (no direction at that point) it
falls back to the current read rather than refusing — that would be a second, unasked-for rule.

**Applied AFTER the leg gate**, deliberately, so its refusals are attributable to it alone.

**Measured at the momentum candles, 12 months:** retracement median 0–1 candles (quartiles 0/2);
**91–95% of retracements are 3 candles or fewer**, i.e. invisible to the 8-bar read.

### The trend window is PINNED (`vix1_bias._H1_TREND_BARS = 1500`)

`vix1.candle_counts[TF.H1]` was raised 1500 → 3000 on 2026-08-10 to feed the long size test. The
trend read does **not** widen with it — it slices the last 1,500 explicitly, because that is the
window its 2026-07-29 calibration was measured on. **Measured: unpinned, 18% of GBP/USD and 11% of
EUR/USD trend verdicts change.** Pinned, 260/260 and 154/154 identical.

---

## KNOWN OPEN DEFECTS / GAPS — not fixed, do not assume otherwise

1. **PENDING REDESIGN, blocked on the user.** The code reproduced only **16% of his real trades** —
   detection is too strict (an earlier 4× threshold rejected 80% of his candles; now 2.5×). Blocked on
   him supplying ~20 trades with entry/SL/TP. Then: recalibrate detection, add *selection* (which setup
   to take when several qualify). ~~move the trend read 1HR → 4HR~~ — **that instruction is WRONG and
   is superseded (2026-07-29): measured, H4 at 120 bars still reported UP during the two-month
   decline. The trend problem was the swing SCALE, not the timeframe, and it is now fixed on the 1HR
   itself (see defect 4).** **Do not "fix" this by guessing at
   thresholds.**
2. **The R ratchet is ADVICE ONLY.** `vix1_manage` decides what to TELL him ("+3R reached — move your
   stop to +2R"); `vix1_alerts` DMs it. **Nothing moves a broker stop** — the user manages the
   position himself. Whether VIX.1 should manage the stop programmatically is his call, not an
   oversight to silently fix.
3. **`ARM_R` imported but unused** in `monitor/vix1_alerts.py` — cosmetic, fixed 2026-07-27.
4. ~~**`clear_trend` is WINDOW-DEPENDENT.**~~ **FIXED 2026-07-29.** The cause was the swing SCALE,
   not the algorithm. At `n=3` over 120 bars it resolved 7-hour wiggles and could see nothing older
   than two days, so it reported UP inside a two-month decline. Now **`n=48` (≈2 days) over 1,500
   H1 bars (~62 days)**: agreement across window sizes 79%→84% (EUR/USD), 76%→80% (GBP/USD); trend
   changes 183→37 and 166→36 over 4.18 years. **H4 keeps `n=3`** — already 89%/77%, and widening it
   made it worse (56%/47%). Guarded by `tests/vix1/test_trend.py`, which asserts the STABILITY
   property rather than a single day's verdict — two candidate fixes each looked right on the day
   they were tried and were worse over four years.
5. **THE 4HR FALLBACK IS DEAD CODE IN PRACTICE — found 2026-08-10, not removed.** `detect_bias`
   reaches for the H4 trend only when the 1HR trend is UNREADABLE (`t1 == 0`). Measured over the last
   year on both pairs, sampled every 20 bars: **0 of 622 reads were unreadable** (GBP/USD 25% up /
   75% down, EUR/USD 41% / 59%). So the `trend4` branch never executes, yet `vix1.py` fetches 120 H4
   bars every scan and `clear_trend` runs on them. It is wasted work and an untested path that would
   come alive silently if the trend settings ever changed. **Removal is the user's call** — flagged,
   deliberately not done in the 08-10 change.
6. **No exhaustion / "price ran too far" rule exists.** All 9 `vix1_entry` rejection reasons are about
   the pullback's shape and position; none asks how extended the move is, so a late entry at the tail
   of a finished move is accepted. Deferred (user decision, 2026-07-27) because the spacing rule
   already refuses the specific 27 Jul case and stacking two new filters at once would make any
   frequency change unattributable.
7. **RANGES ARE MEASURED BUT STILL TRADED — Phase B, awaiting his thresholds (2026-08-11).**
   `vix1_regime` now reports directional efficiency, and it shows the strategy trading chop routinely:
   the momentum candles it allows sit at a median efficiency of **0.25 (GBP/USD) / 0.24 (EUR/USD)**
   against a whole-market median of **0.21 / 0.22** — no different — with **17% / 24%** of trades in
   the choppiest tenth of the market. Nothing acts on this yet, by design. The cut point is his to
   set from real signals; there is no natural break in the distribution to find automatically.
8. ~~**The developing-trend requirement is NOT implemented.**~~ **BUILT 2026-08-11**, same day, on
   his instruction: *"You cant hold this back. I need it build."* I had deferred it as "a real
   behaviour change" — that was my call to make about sequencing, not about whether to build it, and
   he overruled it correctly. See the section above; it removes 28.1% of GBP/USD setups and refuses
   0 developed ones.

*(The "no test suite" gap was closed 2026-07-27 — see below.)*

## What is NOT a defect — checked 2026-07-27

- **VIX.1 cannot fire on a stale pullback.** `find_pullback` scans **backwards from the newest bar**
  and takes the most recent counter candle, and the M1 window is sized to `LOOKBACK + 2` hours — so a
  pullback from hours or days ago can never become an entry. Verified 2026-07-27.
- **No unused imports** across the strategy files (AST-verified, not grep-guessed; re-checked
  2026-08-11 after the retracement/regime work).
- **No dead functions**, no TODO/FIXME/HACK markers. A `max(0.0, …)` clamp in `vix1_retracement`
  was deleted on 2026-08-11 when breaking it on purpose left every test green — the signature of a
  branch that cannot run.

## The test suite — `signal_platform/tests/vix1/`

```
python signal_platform/tests/vix1/run_all.py     # 11 files, exit non-zero on failure
```

No framework, no network, no DB. **Run it before writing the doc entry for a change, not after.**
Every file bootstraps through `_harness.py` — it puts the platform on the path AND sets a dummy
`DATABASE_URL`, which anything importing `strategies/` needs. Skip it and the file passes from the
platform root and fails under `run_all.py`, which runs from the test directory.

| file | covers |
|---|---|
| `test_atr.py` | the volatility yardstick: true range vs plain high-minus-low (the gap case), the window, the edges |
| `test_retracement.py` | the pullback counted by hand (1/2/3/7/12 candles), a doji continuing it, the retracement a candle CAME AFTER vs a rally, the two counts differing, real-time (no 8-bar wait), the closed-candle rule |
| `test_regime.py` | efficiency: 1.0 on a straight line, 0 on a zigzag, ordered in between, "too little history" ≠ "a range" |
| `test_momentum.py` | every gate BOTH ways (accepts and rejects): size vs median, body fraction, bigger-than-previous, counter-wick cap; grading incl. the A boundary; the run; `baseline_body` |
| `test_line_pullback.py` | the line is the BODY CLOSE; **past-the-line accepted / refused / straddling refused / exactly ON accepted**, both directions; `traded_past`; the shape filters |
| `test_manage.py` | ratchet 2R→1R, 3R→2R, whole-R steps, **forward-only**; the structure exit by body close, wicks never counting |
| `test_invariants_real_data.py` | drives `m1_signals` over 4,000 real M1 bars per pair: entry is a **STOP**, SL on the losing side, **TP exactly 2R**, crash-freedom — plus the governing invariant, by **mutating the forming bar and asserting no level moves** |

**Every invariant has a TEETH case** — the assertion is deliberately broken and shown to fail. A suite
that cannot fail proves nothing; that is not a slogan here, it is the reason this exists.

**When a test fails, that is a FINDING to report.** It is not a licence to re-tune a threshold — the
momentum gates were calibrated against the user's real candles, and the pending redesign is blocked on
his trade data.

## Verification without a backtest

**Never run a backtest without explicit approval** (see `CLAUDE.md`). What needs no approval and
should be used instead: unit tests on the real functions, invariant checks over historical data (e.g.
"every signal's pullback candle is past the line", "no level is ever read from the forming bar"),
regression suites, module-import checks, and production log inspection.
