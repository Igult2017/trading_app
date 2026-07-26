# BX-S/D — Smart Money supply/demand

Source: *Smart Money Concept (SMC) Trading Forex Market*, Dixit Vekariya (`docs/reference/SD.pdf`,
167pp, **gitignored** — 5.5MB; original on the user's Desktop).
Pairs: **EUR/USD, GBP/USD, USD/JPY**. Sessions: **London / NY / Asian** (all three — USD/JPY's home
session is Tokyo). Phase 1 = signals only; Phase 2 pending.

**Reading the book's images:** they are embedded in the PDF and extract fine with `pypdf`
(`page.images`). poppler is only needed to *render* pages, which is never necessary. I once claimed
the images were unreadable and deferred a real rule (p33-35) on that basis — don't repeat it.

---

## THE RULES — from the book, verbatim where it matters

### A zone is only a zone with THREE factors (Ch.6)
> p26: "Did it create IFC? Did it break structure, or change character? (Did it break S/D?)"
> p27: "Did it create liquidity before the zone?"
> p29: "…this will be your valid S/D zone (don't forget that it has to break structure / opposite S/D zone)"

`find_zones` establishes **factor 1 only** — everything it returns is a **candidate**.
`bx_sd_validity.py` applies factors 2+3, and that is what makes it a zone. **Only 33% of candidates
qualify.** One definition, used by every path (entry cascade *and* reports) so they cannot drift.

**The cascade PRE-MARKS valid zones, then waits for price to respect one — like the report paths.**
`detect_setup` now selects with `is_valid` as a *pre-filter* (`[z for z in find_zones(h4) if … is_valid(…)]`)
and takes the most-recent VALID zone freshly tapped. It used to grab the single newest *touched*
candidate and check the factors on **only that one** — so a nearer **non-zone** could shadow a real
valid zone right behind it and the whole scan bailed. This is the user's model: mark only qualifying
zones (imbalance + structure break + liquidity grab), then wait; if price disrespects one it is dead,
if it respects one it is traded then mitigated — we only ever hunt fresh, unmitigated, *valid* zones.
Proven on real functions: with a newer INVALID zone and an older VALID zone both freshly tapped, the
old selection bailed on the invalid one; the new selection falls through to the valid one.

### THE ZONE = the candle before the IFC, ANY COLOUR (p29, near-verbatim)
> "Find areas where IFC has been created. Find the **LAST RECENT CANDLE BEFORE THE IFC**. **It doesn't
> have to be in the opposite direction!** (For example: if the IFC was created on the long side, you
> can choose an upside move candle…) Always choose the last candle that created the IFC!"

**One zone per IFC.** Never walk back hunting an opposite-coloured candle — the book rules it out in
as many words, and doing it collapsed every IFC in an impulse onto a single zone at the impulse's
**origin**, 68 pips from where the inefficiency formed. That zone is rarely revisited, so it read
"unmitigated" forever while the real zones next to price were never marked. **That was the reported
symptom.**

### WICK ZONES (p33-35)
> p33: "Normally you would mark this zone as supply, right? … and you would place a limit order here"
> p34: "**There aren't any resting orders left on this candle, all of them get mitigated by this
> following candle.** … this is your valid supply level, **orders are sitting on THIS WICK!**"
> p35: "1. **WICK = VALID SUPPLY**, orders are resting here" / "2. **NOT HERE!**" (pointing at the body)

If the impulse candle's own wick traded back **through** the candle before it, that candle is dead —
its orders were mitigated in flight. The zone becomes **the impulse candle's wick**. Marking the body
puts a limit at a level price has already swept.

### ZONE MARKING IS TYPE-AWARE — one technique per zone type (2026-07-26)

The book does not have one way to mark a zone; it has several, chosen by what kind of zone is in
front of you. `bx_sd_zones.mark_zone` dispatches, and every zone carries the `kind` that marked it.

| kind | technique | book |
|---|---|---|
| `wick` | the impulse candle's own wick — checked FIRST, because when it applies the prior candle has no orders left to mark | p33-35 |
| `engulfed` | same geometry as institutional, TAGGED: the next candle closed beyond the zone candle's wick | p72 |
| `institutional` | the default — the candle before the IFC, any colour, marked **OPEN → MTH** | Ch.4 p17, p29 |

> p17: *"illustrate the **open of the candle** and the **middle**; the middle of the candle we will
> caption **MTH** (stand for 'mean threshold')."*

**It marked high→low until 2026-07-26**, which is not what the book says and is not cosmetic: a
long-wicked candle marked high-to-low is far wider, so it reads as TAPPED much earlier and carries a
stop much further away. Measured over 6,719 H4 bars per pair: median zone width **27.7p → 7.9p**
(GBP/USD) and **21.6p → 6.1p** (EUR/USD), zone count essentially unchanged (1399→1397, 1443→1441),
taps down ~1%. The `engulfed` tag lands on ~63% of non-wick zones, so the book's preferred zone is
the common case, not a rarity.

**EQUILIBRIUM ENTRY IS A SHAPE TEST, NOT A SIZE TEST.**
> p50-51: *"I use 50% entry if the **WICK of the candle is bigger than the 50% of the WHOLE
> candle**."* (worked example p51: *"the wick is 66% of the whole candle. In this case I use 50% of
> the candle for the limit."*)

`bx_sd_zones.wick_dominant`. This was `zone width > 2 pips` until 2026-07-26 — an unrelated
threshold that only correlates with wickiness. It took the 50% entry on a wide clean candle that
should use the proximal edge, and refused it on a narrow all-wick candle that should use 50%.

### Mitigated / unmitigated (p27)
> "When price taps into a d/s zone, that has not been tapped yet, it becomes mitigated from unmitigated."

BX only ever trades **unmitigated** zones. Selection: **"Always use the most RECENT S/D that gives us
the 3 factors."** (p32)

**FRESHNESS IS LEVEL-AWARE, not per-IFC (fix 2026-07-20).** `_first_tap` / `_is_mitigated` only look
AFTER a zone's own `ifc_index`, so a NEWER IFC born at a level price has ALREADY swept read "fresh"
even though the resting orders were gone. Real case: EUR/USD fired a "Fresh 4H demand MITIGATED
[1.13838–1.14055]" (IFC 14-Jul) that an **overlapping 13-Jul demand had been tapped through 6 times**
the day before (the wicks the user marked) — the tap that mitigated the *level* pre-dated this zone's
IFC, so the forward-only check never saw it. `bx_sd_setup.level_pre_mitigated` now suppresses a zone
whose level was worked by an **overlapping older same-direction zone** (its proximal inside this
zone's range) first-tapped inside `[ifc − _LEVEL_WINDOW(18 H4 ≈ 3d), this zone's own first tap)` — the
same swing, not an ancient revisit. Applied in BOTH the mitigation heads-up (`newly_mitigated_zones`)
and the entry cascade (`detect_setup`) — one definition, every path. Measured on ~1yr H4, 3 pairs:
suppresses **33–43%** of tapped zones (re-worked levels); genuinely fresh zones — price left and
returned — still fire. **Do not revert freshness to the bare per-IFC `_first_tap`.**

**The respected-retest is the ONE sanctioned exception — and it is the FRESH zone's 2nd touch, not any
later touch.** `is_respected_retest` = first tap (mitigation) → body-move away ≥ 1 zone-height
(respected) → the **FIRST return after that reaction, happening now**. It must stop at that first
return and require IT to be recent — **not** scan forward for *any* recent tap. A zone mitigated →
respected → retested → reacted → retested again (tapped 3–4+ times) is **drained**: its orders are
being consumed, so it is no longer fresh and must not fire. The old loop skipped past earlier retests
and fired on the latest recent one, so drained zones re-fired forever (proven: a synthetic drained
multi-touch fired under the old loop, does not under the fix; a clean 2nd touch still fires).

**FRESH = UNMITIGATED, confirmed from the book across four chapters — every POI we ENTER on must be
fresh, never a re-tap.**
> Ch.6 (def): "When price taps into a d/s zone, **that has not been tapped yet**, it becomes mitigated
> from unmitigated."
> Ch.9 Trading Plan — Second Step: "**Finding unmitigated** supply and demand on 15m" · "targeting the
> **recent unmitigated** supply". Third Step: "if it gives you two zones, but only one has been
> mitigated, **you can use the one that has not been mitigated yet**."
> Ch.7: "**ALWAYS (!!) check if the price comes from an unmitigated zone**."
> Ch.9 p48 (Continuation): a scale-in "if you missed the flip/choch", entering the pro-trend
> continuation "targeting the **next unmitigated** supply".

**A TAP IS A RETURN, never the gap's own creation candle (fix 2026-07-21, `is_fvg_tap`).** The FVG is
the 3-candle pattern (ifc-1, ifc, ifc+1); its far edge is DEFINED by candle **ifc+1** (demand
top = `h4[ifc+1].low`, supply bottom = `h4[ifc+1].high`). The continuation tap loop started at
`ifc+1` and tested `h4[ifc+1].low <= fvg.top` — i.e. candle ifc+1 vs its OWN boundary, **trivially
true**. So **every** fresh FVG read as "instantly tapped" by the wick of the candle that created the
gap (measured: 100% of FVGs, both directions). That fired a false USD/JPY CONTINUATION on a zone price
had broken UP and away from and NEVER returned to. Per the book (p27: price taps INTO a zone that has
not been tapped yet), a tap is a LATER candle coming back into the gap — the loop now starts at
**`ifc+2`**. Validated: the false signal is gone, all 289 genuine return-taps kept, and the 8 demand
FVGs that never returned no longer fire. **`_first_tap` (zone mitigation) is NOT affected** — a zone's
top is `h4[ifc-1].high`, and the FVG condition (`h4[ifc-1].high < h4[ifc+1].low`) guarantees ifc+1
cannot self-tap it. Same fix covers supply. **Do not revert the tap search to ifc+1.**

Two freshness bounds this principle forces, both now enforced in `bx_sd_retest.py`:
1. **The mitigation itself must be recent** (`is_respected_retest`, `fresh_within` — default 12 H4 bars,
   ~2 days). Bounding only the 2nd touch let an *ancient* first mitigation retest now and fire; the book
   trades the **most recent unmitigated** zone, so the whole mitigation→reaction→retest must sit inside a
   fresh window. (Proven: t1 beyond the window no longer fires; a clean recent cycle still does.)
2. **The continuation FVG must be fresh** (`is_fvg_tap`): its **FIRST** tap must be the recent one, not a
   re-tap. The book's continuation targets the *next unmitigated* imbalance — a re-tapped FVG is
   mitigated, so it must not fire. (Proven: a stale FVG re-tap fired under the old any-recent-tap loop,
   does not under the fix; a fresh first tap still fires.)

### Levels closed, taps and price live
A **level must stay put; an event is live.**
- `find_zones` → IFCs from `closed_only()`; **mitigation reads the FULL series** (a tap is happening now)
- `map_structure` → **closed only**. Its own rule is "by body CLOSE, never wicks" — a forming bar has
  no close, so its "close" is just live price, and a BOS could confirm then un-confirm.
- `detect_setup`'s `price = h4[-1].close` and `_first_tap` → **LIVE, untouched**
- `check_invalidation` → **closed only**. "Broken" = a body CLOSE beyond the distal (a level), so the
  still-forming M15/H4 bar is dropped; reading its live close fired false stand-downs. The last CLOSED
  M15 keeps the alert responsive (15-min granularity) without waiting the full 4H.

Proven before fixing: the same zone appeared/vanished purely from the forming H4 bar's low
(1.2860 EXISTS → 1.2844 GONE). On the 4H that flicker lasts **hours**.

Safe because `closed_only` drops **trailing** bars only (data is chronological), so an index into the
closed list stays valid in the full list — verified explicitly.

**`find_liquidity` deliberately NOT trimmed:** pools come from `find_swing_points`, which needs bars
either side, so a forming bar can never be a pivot; `_daily_pools` already skips "the current forming
day"; `is_swept` reads wicks, which are live facts. Nothing to fix.

**15M / D1 / W1 / MN** get it free — the trim sits inside the builders, not the callers. (A forming
**MN** bar is "forming" for a month.)

### A zone price has CLOSED through is DEAD — everywhere
The book's Ch.8 flip: a broken demand *becomes* supply. It is finished as what it was, so nothing
trades it. `bx_sd_zones.zone_broken`, applied in `bx_sd_validity.is_valid` (every report path) and in
`bx_sd_setup` (the core cascade, which picks from raw candidates).

**By body close, never a wick** — BX's rule everywhere. A wick beyond the distal is a **sweep** (the
book's own liquidity grab, and a *reason* to trade the zone); a close beyond it is a break. Reading
wicks here would throw away exactly the setups the book wants. Verified: a wick through the distal
that closes back inside still fires.

**Measured cost of not having this: 52% of respected-retests (344 of 657, 2y real data, all 3 pairs)
were on zones price had already closed through** — BX proposing to buy support that no longer existed.
The retest test is `low <= zone.top`, which is trivially true forever once price is below the zone.
The continuation path had it too.

### The 3 report paths, measured (2y real, H4 gates only — the 1M/5M check sits after)
| path | reaches the 1M/5M check |
|---|---|
| respected retest (mitigated → respected → retested) | ~27/month, 3 pairs |
| FVG-tap continuation | ~42/month |
| core 4H cascade | ~4/month |

### Zone identity is the IFC, never the origin
One zone per IFC ⇒ the IFC is unique. `origin_index` is **not**: a wick zone sits **on** its impulse
(`origin == ifc`) while the next IFC's ordinary zone sits on that same candle (`origin == ifc-1`).
Origin-keyed dedup silently suppressed **39 zones** across 8 test series. Applies to **both**
`bx_sd_reports` and `bx_sd.analyze` — I fixed the first and left the second behind for two commits.

### The TP must be a VALID zone
The TP is the **first** candidate clearing 2R, so a nearer **invalid** one wins over a real zone and
we aim at a level with no orders behind it — it never fills and the RR on the card is fiction.
Measured: **5 of 9** unmitigated zones the picker saw were invalid.

### Locked constraints (user)
EUR/USD + GBP/USD + USD/JPY · **pro-trend only** · **confirmed entries only** (a CHoCH must print —
never a blind limit) · **liquidity-aware both ways** (a pool must be swept = fuel; never enter with an
unswept opposing pool between entry and SL) · ≥2R.

### MTF, confirmation entry & grading — the SOP (book Ch. "Understanding Time-Frames" + Ch.15 Checklist)
The book's Standard Operating Procedure, which BX follows (verified against the book's own diagrams):
- **4H = Macro / bias.** Mark valid 4H zones; a zone *only matters when price REACTS from it* (Checklist
  step 1). D1 = premium/discount context + when the 4H trend is likely to end.
- **15M / 30M / 1H = analysis TF: it REFINES the 4H setup** into a tight POI before the entry (book
  Ch.15 steps 2–5: "refine the same zone… if refinement gives more than one obvious zone, go back **up**
  to the TF which gives one clear zone"). The **clearest** of the three wins. Alignment here (a
  supporting zone / CHoCH in the 4H bias direction) is the **A-grade** confluence — it is NOT a hard gate.
- **1M (or 5M) = execution + CONFIRMATION ENTRY.** A **BMS** — CHoCH / S/D-flip / continuation, by body
  CLOSE, **inside** the 4H zone. **Mandatory.** The book's **"Entry-2 Justification"** (wait for the
  BMS); its **"Entry-1 Risk"** (blind limit) is **banned** — every fired BX signal is a confirmation entry.
- Book entry types (Ch.15 step 7): **DS/SD Flip · Continuation · CHoCH**. (A standalone "respected
  retest" is NOT a book entry type — see below.)

**Grade (shown on the signal card) — each tier adds one MTF layer:**
- **C** = 4H zone + entry TF (1M/5M) only.
- **B** = 4H zone + **analysis TF (15M/30M/1H) alignment** + entry TF (1M/5M).
- **A** = B + **HTF confluence** (a D1 / W1 / MN zone aligned with the 4H bias).

**EVERYTHING revolves around the UNMITIGATED 4H zone.** It is the one anchor; D1/W1/MN, the analysis
TFs, RSI, pricing — *everything else is only confluence to it* (grade), never a standalone setup. There
is **no** standalone D1/W1/MN retest: a HTF zone matters only when it *backs* a 4H zone (→ A grade).

**Retest = re-entry on a MITIGATED 4H zone, ONLY with strong evidence it was RESPECTED** (`retapped_now`):
first tap OLD (mitigated), then a real **reaction away** ≥ one zone-height (the respect — a body move,
not a wick), the zone not closed through, and price back inside it now. **No reaction = not respected =
not considered.** It then still needs a 1M/5M confirmation entry and fires **only at B/A** (never bare
C — a mitigated zone must EARN re-entry with MTF confluence). This REPLACES the old `is_respected_retest`
(which treated a mitigated zone's return as a "fresh 2nd touch"). Rule: **only fresh unmitigated 4H
zones fire at bare C**; a respected mitigated 4H zone needs B/A.

### Rate (measured, 2y real data, 3 pairs)
**~4.1 setups/month** combined (98 in 24 months) — roughly one a week. Valid-zone mitigations
(the DM heads-up rate): **~37/month ≈ 1.2/day**. The 4H gate passes ~11% of tapped valid zones; those
still face the 15M CHoCH and the 1M/5M ≥2R trigger, so **actual entries are fewer than 4/month**.

---

## Fix log (newest first)

| commit | what |
|---|---|
| _audit-2026-07-22_ | **full audit (user: "audit BX… fix. Also check how demand and supply zones are implemented"). Six fixes:** (1) **`zone_broken` read the FORMING bar's live close** — the zone died intra-bar exactly during the sweep wick below it (the entry moment) and resurrected when the bar closed back inside; now `closed_only`, same rule check_invalidation already followed. Hit every path (is_valid → setup + all reports + retest). (2) **Monitor entry-trigger was one-sided (`hi >= entry` for a BUY) — trivially true for BX's LIMIT-style entries**, so every BX signal read as instantly filled and the pending-order protection never applied to BX; now CONTAINMENT (`lo <= entry <= hi`), correct for stop (VIX) and limit (BX) alike. (3) **`retapped_now`'s RESPECT (a body-close reaction) read live closes** — now closed bars only; the back-inside re-tap stays live (an event). (4) **`htf_backing` counted CLOSED-THROUGH D1/W1/MN zones** — "a zone price closed through is DEAD — everywhere" now includes the HTF map (mitigated HTF zones still back — demanding unmitigated HTF would kill nearly every A). (5) **Core cascade lacked the micro-zone floor** all 3 report paths had — a sub-3-pip candidate could drive a channel entry; `_MIN_PIPS=3` now in detect_setup too. (6) **`_locked` setdefault never re-locked a NEW zone while an old lock lived** — its invalidation alert was silently lost; a new zone now supersedes, the same zone keeps its original TTL. All verified on synthetic tapes + a real GBPUSD H4 pipeline run (52 candidates → 9 valid, no crash) |
| _e2e-defensive_ | **END-TO-END test on REAL data (yfinance H4/M15/M30/H1/M5/M1, 3 pairs, 120-bar replay) found a live bug.** `defensive_ok`'s **SL-on-pool** test did NOT filter `is_swept` (the between-entry-and-SL test did). With the full pool set after Phase 5/6 (swings + EQH/EQL + day/week/month + session = **339 pools on EUR/USD**), **98% of all price levels** sat within 1.5 pip of some pool — the guard blocked almost every possible stop and silently killed valid setups. A swept pool has **no resting stops left**, so it must not block. Fixed: both tests now use one `live` (unswept, non-excluded) set. Blocked levels 98% → **26%**; replay signals **4 → 8**, defensive false-blocks **4 → 0**. Funnel also confirmed the cascade completes end-to-end (graded A/C signals on GBP/USD + USD/JPY) |
| _full-audit_ | full structural + practical audit. **BUG:** `detect_setup` ran the defensive-liquidity guard on the **WIDE 4H zone's** entry/SL — levels we never trade (`setup.entry/sl` are unused downstream; the real entry/SL come from the entry-TF refinement, and `confirm_grade` guards THOSE). It was a pure **false-reject** source (a pool on the 4H distal killed setups whose real SL is nowhere near it) → removed. **STRUCTURAL:** dead code deleted — `ltf_confluence` (orphaned by the MTF rebuild, 133→80 lines), `sweep_grab`, `bx_sd_zones.unmitigated` (VIX.1 uses the *shared* module); `bx_sd_liquidity` was 176 lines → split the pool BUILDERS into new **`bx_sd_pools.py`** (LiquidityPool + period + session), leaving the QUERIES (find_liquidity/is_swept/swept_before/defensive_ok). Verified: chain imports, pools build, defensive + retest behavior unchanged. Known deviation: `bx_sd_zones.py` = 159 (>150) — kept whole, it is one responsibility and the overage is settled-rule documentation |
| _channel-confirmed-only_ | **CORRECTS the "everything → channel" routing below.** The channel carries **CONFIRMED SIGNALS ONLY** — a 4H zone mitigated + entry alignment (**C**), or MTF alignment + confluence + entry (**B/A**) — across all three entry paths (core cascade · retest · continuation). The **mitigation heads-up and the invalidation are NOT signals**: `to_channel` removed, they route to the **admin DM** again (`alert_only=True` → `on_setup_alert` → private). `dispatcher.on_setup_alert` restored to its original semantics. "Everything about BX to the channel" meant every SIGNAL TYPE, not the pre-signal heads-ups |
| _sessions-phase6_ | **Session H/L liquidity** (Asian/London/NY) now marked from a FINER feed (M15/M30 — H4 is too coarse to isolate a session boundary). `_session_pools` groups the finer stream by (day, session), skips the forming session, indexes each pool into the **H4** stream (so `is_swept`/`swept_before` still work), and overlapping sessions both count. Threaded via an **optional** `session_candles` param on `find_liquidity` into the entry TP + defensive checks (`confirm_grade`, `entry_trigger`/`_tp_candidates`, continuation); existing callers unaffected. Windows: Asia 00-09, London 07-16, NY 12-21 UTC (fixed; a ±1h DST shift doesn't move a session's extreme). Trend-line liquidity still not auto-detected (unreliable) |
| _liq-phase5_ | Phase 5 liquidity + audit: (1) `find_liquidity` now also marks prior **WEEK + MONTH** H/L (PWH/PWL/PMH/PML), not just prior day (book Ch.5 "Daily/Weekly/Monthly high/low"); (2) **TP targets the resting liquidity** — `_tp_candidates` adds unswept buy-side pools above / sell-side below (weak highs/lows), nearest-first, so TP aims at where stops rest, not only the opposite zone; (3) **AUDIT BUG FIXED** — the retest path (now via `confirm_grade`) had lost the **defensive-liquidity guard** in the MTF rebuild; added it to `confirm_grade` on the FINAL entry/SL, so every entry-confirming path (fresh + retest + continuation) is defended. Session H/L + trend-line liquidity still deferred (need a finer feed) |
| _liq-inducement_ | (1) **restored the inducement guard** on the mandatory entry — the MTF rebuild dropped it (it lived in the now-unused `ltf_confluence`): the entry CHoCH must reverse off a **SWEPT** swing (the book's "enter AFTER the liquidity grab", p22 — inducement taken, not resting). `entry_trigger` now calls `_choch_valid`. Verified: reversal off a higher low = premature/rejected. (2) **Routing: EVERYTHING BX → the channel** — the mitigation heads-up + invalidation now go public (`to_channel`, heads-up card), so subscribers see the whole lifecycle (zone tapped → entry → resolve), not just entries |
| _sweep-audit_ | audit after the MTF rebuild: (1) confirmed **wick = re-tap/liquidity-sweep, body-close = break** everywhere (book p109/p111/p67 — "structure breaks only by candle body not wicks"; zone_broken/check_invalidation/map_structure use `.close`, taps/re-taps use `.low`/`.high`) — no change needed; (2) `retapped_now` now requires **strong respect** (a real reaction away after the first tap; no reaction = not considered); (3) fixed a card bug — `conf.risk_pips` showed the analysis-level POI not the final entry-TF SL. No dangling refs / signature mismatches after the rebuild |
| _mtf-rebuild_ | MTF/confirmation/grading rebuilt to the book SOP + user spec: **1M/5M confirmation entry is the mandatory confirm** (15M demoted to analysis-TF *refinement*, cycles 15M/30M/1H clearest-wins), entry-TF refinement for a tight SL, **C/B/A grade** on the card (shared `bx_sd_confirm.confirm_grade`). **Retest redesigned** (`retapped_now`): a MITIGATED but valid pro-trend 4H zone re-tapped now, fires only at **B/A** (never bare C — replaces the flawed is_respected_retest). **Continuation graded** on the same ladder. New files `bx_sd_analysis.py`, `bx_sd_confirm.py`. All verified on the real functions |
| _premark-valid_ | core cascade (`detect_setup`) now **pre-marks valid zones** (`is_valid` as a filter) and takes the most-recent VALID freshly-tapped zone, instead of grabbing the single newest *touched* candidate and bailing if it fails the factors. A nearer non-zone can no longer shadow a real valid zone behind it — brings the cascade in line with the report paths and the user's "pre-mark valid, then wait for respect" model. Fallback proven on the real functions |
| _audit-liq-inval_ | full-BX audit: (1) the locked **defensive-liquidity** guard (`defensive_ok`) was enforced only in the core cascade — the **retest + continuation report paths fired blind**; now both reject an SL parked on a pool or an unswept opposing pool between entry and SL; (2) `check_invalidation` read the **forming** M15/H4 bar's close for a body-close "broken" call → false stand-downs; now reads **CLOSED** bars only (last closed M15 keeps it responsive). Both verified on the real functions |
| _fresh-book_ | book-confirmed freshness (Ch.6/7/9): (1) `is_respected_retest` now requires the **mitigation itself** recent (`fresh_within`), not just the 2nd touch — the book trades the *most recent unmitigated* zone; (2) `is_fvg_tap` continuation now requires the **FVG's FIRST tap** to be the recent one, not a re-tap ("targeting the next unmitigated", p48). Both verified on the real functions |
| _retest-fresh_ | respected-retest fired on **drained** zones (any later recent tap). Bound it to the FRESH 2nd touch: the FIRST return after the reaction must itself be the recent event, else don't fire. Clean 2nd touch still fires; drained multi-touch no longer does (verified) |
| `bae83bb` | zones + structure from **CLOSED** candles; taps and price stay live |
| `4d55ffc` | TP targeted **invalid** zones; `analyze`'s signal key was still origin-based |
| `a69a207` | only **book-valid** zones (3 factors) reach any report — **67% fewer DMs** (4.9 → 1.6/day) |
| `c78220c` | report dedup keys must identify a zone by its **IFC**, not its origin |
| `5b9b67a` | **wick zones** (p33-35) |
| `0e9b4c0` | zones = the candle before the IFC, **any colour** (p29) + USD/JPY added |
| `e3d734c` | BX entries → public channel (`451HRZ`); heads-ups/invalidations → DM |

## Files
`bx_sd.py` (cascade) · `bx_sd_zones.py` · `bx_sd_validity.py` (**the 3 factors — one definition**) ·
`bx_sd_structure.py` · `bx_sd_liquidity.py` · `bx_sd_setup.py` (4H gate) · `bx_sd_ltf.py` (15M) ·
`bx_sd_entry.py` (1M/5M trigger) · `bx_sd_confluence.py` · `bx_sd_htf.py` · `bx_sd_mitigation.py` ·
`bx_sd_retest.py` · `bx_sd_continuation.py` · `bx_sd_reports.py` · `bx_sd_signal.py` · `bx_sd_watch.py`

### Routing — entries are REAL signals
**ENTRIES → the public channel** (`strategy_id = "bx_sd"`, `alert_only=False`): saved to the DB,
shown on AssetPage, and **MONITORED** — so the monitor closes them on TP/SL and the channel is told
how each one ended (`✅ TP HIT · +2.0R` / `❌ SL HIT · -1R`). They were `alert_only` until 2026-07-17,
which bypassed the validator and skipped the save entirely: BX posted entries into the channel and
then went silent on every one of them.
The **mitigation heads-up and the invalidation keep `bx_sd_watch` and stay DMs** — they are not
signals.

Two consequences of persisting, both correct but both new:
- BX entries now face the validator. Confidence is safe by construction: `_PASS = 65` gates the entry
  TF, so confidence is at least `0.60 + 65/400 = 0.7625`, above `min_confidence = 0.70`. RR is >= 2 by
  the cascade's own rule.
- BX can emit up to THREE entries in one scan (core cascade + retest + continuation). The
  per-strategy dedup allows ONE active signal per symbol+direction, so the others are dropped — you
  cannot hold three positions on the same pair and direction anyway.

## Open / not done
- **`self._locked` is RAM-only** — a redeploy forgets a watched setup, losing its invalidation alert.
- Deliberately deferred (user's call): G2 latency (by design — it's the win-rate), G6 zone selection
  by strength, G7 counter-trend (out of scope).
- Phase 2: auto-execute (cTrader orders) + management.
