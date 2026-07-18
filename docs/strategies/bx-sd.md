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

### Mitigated / unmitigated (p27)
> "When price taps into a d/s zone, that has not been tapped yet, it becomes mitigated from unmitigated."

BX only ever trades **unmitigated** zones. Selection: **"Always use the most RECENT S/D that gives us
the 3 factors."** (p32)

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

**Retest = a re-entry on a MITIGATED but MAJOR zone.** Only a *previously-valid* **4H / D1 / W1 / MN**
zone (never lower) that is respected **again** WITH a 1M/5M confirmation entry AND other confluence may
fire to the channel — **graded, never bare C** (a mitigated zone must earn re-entry with confluence).
A mitigated *lower*-TF zone respected again is **not tradeable**. This REPLACES the old
`is_respected_retest` (move a full zone-height away, then return, on any valid zone), which wrongly
traded already-mitigated zones as if they were fresh 2nd touches — the rule is **only fresh unmitigated
4H zones fire at bare C**; mitigated majors need B/A confluence. The **same** 4H + 15M/30M/1H + 1M/5M
MTF-alignment grade applies to retests, and requiring that alignment (B/A) is exactly what filters the
low-quality retests out.

### Rate (measured, 2y real data, 3 pairs)
**~4.1 setups/month** combined (98 in 24 months) — roughly one a week. Valid-zone mitigations
(the DM heads-up rate): **~37/month ≈ 1.2/day**. The 4H gate passes ~11% of tapped valid zones; those
still face the 15M CHoCH and the 1M/5M ≥2R trigger, so **actual entries are fewer than 4/month**.

---

## Fix log (newest first)

| commit | what |
|---|---|
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
