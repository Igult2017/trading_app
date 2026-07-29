# BX-S/D — Smart Money supply/demand

> ## ⚠️ READ [bx-sd-architecture.md](./bx-sd-architecture.md) FIRST
>
> The zone layer was **rewritten** on 2026-07-27 into a pre-marked zone book with a lifecycle
> (`bx_sd_registry.py`). **This file's RULES (from the book) remain authoritative. Its descriptions of
> HOW the code works are, in places, superseded** — anything below referring to `bx_sd_validity`,
> `bx_sd_freshness`, `level_pre_mitigated`, `is_respected_retest`/`retapped_now`, `fvg_zone`, the
> FVG-continuation path, or `find_zones`-based selection describes **code that no longer exists**.
> Those sections are kept because they record WHY each rule exists; do not read them as current
> implementation. The architecture doc has the module map, the lifecycle, and the open defects.

Source: *Smart Money Concept (SMC) Trading Forex Market*, Dixit Vekariya (`docs/reference/SD.pdf`,
167pp, **gitignored** — 5.5MB; original on the user's Desktop).
Pairs: **EUR/USD, GBP/USD, USD/JPY, GBP/JPY** (GBP/JPY added 2026-07-27 at the user's request).
Sessions: **London / NY / Asian** (all three — the JPY pairs' home session is Tokyo).
Phase 1 = signals only; Phase 2 pending.

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
EUR/USD + GBP/USD + USD/JPY + GBP/JPY · **either direction — see "Who is in control" below** · **confirmed
entries only** (a CHoCH must print — never a blind limit) · **liquidity-aware both ways** (a pool must
be swept = fuel; never enter with an unswept opposing pool between entry and SL) · ≥2R.

> **"pro-trend only" was WRONG and was removed 2026-07-26.** The user: *"Im trading both pro trend and
> against trend. I dont care about trend so long as a zone is respected"* / *"Per the book there is no
> pro or counter trend. It is either demand is in control or supply is in control depending on the zone
> that was mitigated to propel the move or direction."*

### Who is in control — the book's model (Ch.7), NOT a trend
**The book has no swing-structure trend.** `map_structure().pro_trend()` implemented a concept the book
never uses, and BX gated on it. Control is decided by **which zone was broken through to propel the
move** — `bx_sd_control.control()`:

**Control is taken TWO ways, and the LATEST event of either kind holds it:**

| The book says | Page | Code |
|---|---|---|
| *"You want to trade the **controlling side**… if the price comes from an unmitigated supply zone, SUPPLY IS IN CONTROL, **YOU CAN'T TRADE DEMAND WITHOUT A CONFIRMATION**"* | p35 | control is **reported, never a gate** — every BX entry is already confirmed |
| **MITIGATION** — *"the price **mitigated an unmitigated supply zone, so now SUPPLY IS IN CONTROL**"* (diagram) | **p36** | tap an unmitigated zone → **that zone's own side** takes control (`_first_tap`) |
| *"We broke through the minor supply, **forcing demand to be in control**… **rejected on the major supply, causing supply to be in control again**"* | p38 | **both** mechanisms in one sentence — break, then a rejection (= a tap) |
| *"**We do not place a limit order here!**"* | p38 | the ONLY thing control forbids is the unconfirmed **risk entry** — BX has no such path |
| *"**supply is in control, but we expect a Flip or CHoCH after we tapped in H4 demand**"* | p57 | the book taking the against-control trade, on confirmation |
| *"Price broke through our last supply level, **demand is in control now**, so we can look for long entries on the 1m"* | p58 | `break_index` on the opposing zone |

**Every BX signal passes the MANDATORY 1M/5M confirmation (`bx_sd.py` STAGE 2-3).** So by the book's own
rule BX is entitled to trade both sides — it was already paying the price of admission while being
denied the trade. Control travels onto the card (`with_control`: `True` / `False` / **`None` when no
side is in control** — "untested" is not "against").

Ch.6 p26 fixes the vocabulary: *"When price taps into a d/s zone, that has not been tapped yet, it
becomes **mitigated** from unmitigated."* **Mitigated = tapped**, not broken.

A tap only confers control if the zone **held**. On a bar that closes beyond the distal, the touch is
part of the break — counting both would tie the two sides on one bar and report "none" for what is
plainly a break.

**`control()` has FOUR values, and "none" ≠ "contested".** A single 4H bar can tap an unmitigated
supply above *and* an unmitigated demand below; measured over 27 months on five instruments that is
**~25-30% of setups**. Reporting it as *"no side in control yet"* would state something false about a
bar on which both sides just acted — the book calls it the **"tug of war"** (p81). `with_control` is
`None` for both neutral values, so neither is ever rendered as an against-control trade; use
`bx_sd_control.NEUTRAL` rather than testing `!= "none"`.

**If an unconfirmed limit/risk-entry path is ever added, p35 binds it and `control()` is the gate.**

### Entry types — the book's own two (Ch.2), and which one BX takes
The book splits entries on ONE axis: **has the HTF trend been confirmed by a second BMS?**

| | Book | The book's conditions | BX |
|---|---|---|---|
| **Entry-1 — risk entry** | a limit order on the refined zone. *"There is minimal confirmation for entry therefore the **likelihood of being stopped out is increased**"* | with trend + momentum; after the **first** BMS — diagram p9: *"Risk entry: **Trend has yet to be confirmed**/justified"* | **never taken** |
| **Entry-2 — justification entry** | *"Waiting for a **BMS to occur on a LTF** in the direction of the trend gives you additional confirmation… more safely than simply setting a limit order"* | price returning aggressively, **"you're looking to take a counter trend trade"**, multiple zones; after the **second** BMS — diagram p9: *"Trend has now been confirmed/justified"* | **always** |

`StructureState.confirmed` is exactly the book's axis (True after two same-direction breaks), which is
why it is still computed even though BX no longer *gates* on the trend. `bx_sd_entry_type.classify()`
names the situation on the card; **it never rejects a setup.**

Because BX always waits for the LTF BMS/CHoCH, p35's prohibition — no unconfirmed limit against
control — is satisfied **structurally**, not by a check that could be forgotten. The book naming
counter-trend as a justification-entry case (Ch.2 p6) is independent corroboration of the control
model reached from p35/p57.

### Zone marking — what is DIAGRAM-verified (2026-07-27)
Previously derived from extracted text alone; the book's diagrams were unreadable until the PDF was
supplied. Verified against the actual drawings:

| Technique | Page | Verdict |
|---|---|---|
| Institutional zone = **open → MTH** | Ch.4 p17 | ✅ text is explicit; unchanged |
| Wick zone = the **IFC candle's own wick** when the prior candle's orders were consumed | **p34 diagram** *"There aren't any resting orders left on this candle… **orders are sitting on THIS WICK!**"* | ✅ `_wick_zone` correct |
| Zone candle's **colour is irrelevant** | p29 text + **p42 diagram** (demand marked on a red candle, supply on a blue one) | ✅ correct |
| **eq50 has TWO triggers** | p51-52 **and p53-54** | ❌ **was wrong — fixed**, see below |

**The eq50 defect.** The marking rebuild replaced `zone width > 2 pips` with the wick rule, calling the
pip threshold *"an unrelated size threshold"*. It is not — it is the book's **second** eq50 scenario:
*"I use 50% entry in **one more scenario, if the maximum 2 pip SL can't fit**… the candle is more than
2 pips, so the SL can't cover the whole zone"* (p53), *"to make sure the whole zone is covered, and my
SL isn't bigger than 2 pips"* (p54). Both are the book's and they are **ORed** — `bx_sd_zones.needs_eq50`.
Wide zones had stopped receiving the equilibrium entry that keeps their stop inside 2 pips.

**Not implemented (known gap):** the book cycles timeframes to find an engulfed zone — *"on the H4 the
demand was not engulfed so I went on the H3 and it was"* (p75) — and Ch.4's institutional **decay**
(*"comes back to that same area a numerous number of times… the Institutional candle is losing
strength"*). Neither is modelled.

### The source book
`C:\Users\FSD\trading_app_data\reference\SND.pdf` — **kept OUTSIDE the git tree deliberately** (a Stop
hook auto-pushes to GitHub; the book is copyrighted). `pdftoppm` is absent, so pages render via
`pypdf` + `PIL`. **Much of this book is diagrams** — pp 9, 10, 17, 30, 34, 35, 37, 40, 50, 57, 63, 66,
67, 69, 74 carry no text at all. Any rule derived from `SD_text.txt` alone is derived with those pages
missing, which is how the eq50 defect and the half-built control model both survived review.

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

### Rate (measured 2026-07-26 — walk-forward, 27 months of REAL broker H4, 5 instruments)
**~5 4H setups/month PER INSTRUMENT** after the trend gate was removed (was 1.1–1.5):

| | before | after |
|---|---|---|
| GBP/USD | 1.2 /mo | **5.0** |
| EUR/USD | 1.4 /mo | **4.7** |
| GBP/JPY | 1.1 /mo | **5.1** |
| US100 | 1.2 /mo | **4.9** |
| US30 | 1.5 /mo | **4.9** |

These are **4H setups**, not entries — each still faces the mandatory 1M/5M confirmation and the ≥2R
trigger, which remove more again.

> **Measure this WALK-FORWARD or the number is fiction.** Filtering whole history in one pass applies
> today's structure to the past. `map_structure()` returns the FINAL state — calling it once over 27
> months is the exact bug that produced the old 1.2/month figure. Step bar by bar with a rolling
> 200-bar window (`candle_counts[H4]`), which is what production actually does.

---

## Fix log (newest first)

| commit | what |
|---|---|
| 2026-07-30 | **TWO INVENTED TIME RULES REMOVED — they were not in the book and they were silently destroying real zones.** The user marked a GBP/JPY H4 demand zone (15 Jul, 217.31–217.56), price returned on 29 Jul and ran 100+ pips, and BX sent nothing. It had generated that zone as a candidate **twice** and thrown both away. **(1) `BREAK_SPAN = 6`** required structure to break within 6 bars *after* the IFC. Structure had broken **two bars before** it (up-BOS 15 Jul 01:00; IFCs 09:00 and 13:00) — the zone was a **pullback origin inside an already-broken leg**, the most ordinary kind there is, and the window only looked forward. **Searched all 167 pages of the book: ZERO mentions of any candle or bar count attached to the break.** The book asks only *"Did it create IFC? Did it break structure, or change character?"* (p26) and *"don't forget that it has to break structure"* (p29). Replaced with a **leg test**: the zone is valid if the most recent structure event at or before the IFC is already in its direction, OR a break in that direction prints afterwards. The bound that replaces the clock is **structural, not temporal** — a pending zone is dropped if price returns to it before any break, because a zone that launched nothing was never a zone. **(2) The 200-bar H4 window** meant a zone older than ~33 days did not expire, it **ceased to exist**, which makes premarking pointless — the entire purpose is to have the zone written down when price finally comes back. Now **1000 bars (~166 days)**. Deliberately not DB-persisted: the registry stays a pure replay of closed bars, so nothing can desynchronise across restarts. **MEASURED:** live zones per pair 7→25 (EUR/USD), 14→22 (GBP/USD), 15→39 (USD/JPY), 19→31 (GBP/JPY). **The user's 15 Jul zone is now marked and shows `respected, retaps=1`.** The 27 Jul regression (a BOS at lag −1 selling a mid-waterfall candle) is still rejected — asserted as a test, because there the prevailing structure ran *against* the candidate. |
| 2026-07-30 | **MITIGATION IS NOW WICK-vs-BODY, AND A ZONE CAN BE RETAPPED.** The user's rules, asked for rather than guessed: *"Break of a zone has to be the body of the candle not the wick. But mitigation can be done by the wick or body… Where wick mitigates a zone, chances are that it's gonna be retapped."* The single `mitigated` state became **`wick_mitigated`** (wick entered, body stayed outside — the orders were never filled, so the zone is still loaded and price is expected back) and **`body_mitigated`** (the zone actually traded; spent). **A tap never ends a zone — only a body close beyond the distal does.** Retaps are counted and allowed from every live state: a wick tap signals AND its later retap signals again, and a retap of a body-mitigated zone still signals but the card carries *"CAUTION: retap of a zone that had already been properly mitigated."* New `bx_sd_strength.py` ranks zones on the user's four inputs — **HTF confluence (D1/W1/MN, reusing `bx_sd_htf.htf_backing`), violent departure (measured in zone-heights so it is scale-free across pairs), depth in the stack (the furthest same-side zone ranks highest), and retaps survived**. It **labels, never gates**: a weak zone still fires. The card now states which mitigation happened and the zone's strength — previously a wick-only tap and a full body mitigation looked identical on it. 26 lifecycle tests with teeth in `tests/bx_sd/test_zones.py`. |
| 2026-07-29 | **THE STAGE TRACE NOW HAS A HEARTBEAT — a settled state is no longer invisible.** `_log` was change-triggered by design ("a 'missed setup' is diagnosable without spamming every scan") and that was right in principle and blind in practice: once a symbol settles it goes quiet indefinitely, so any log window that misses the transition shows NOTHING. **Measured 2026-07-29: a 3h29m production window contained ZERO BX lines while all four instruments sat in perfectly healthy states**, and answering "is BX working" needed a live broker query plus a local replay of the zone machinery rather than one grep. The transition still prints instantly; an unchanged stage now restates every 900s via `core/stage_tracker.py`, and each emitted line is also written to `signal_events` as `stage='evaluated'` so it survives the buffer rolling and the container restarting. **Also surfaced the number that actually answers "why no signal": the distance from price to the nearest live zone.** `bx_sd_setup` computed the live-zone count and threw the distance away, so the reason line could not distinguish "price is 2 pips off a zone, watch closely" from "price is 200 pips away, nothing will happen today" — it now reads `no marked zone being tapped right now (N live zones on the book, nearest M pips away)`. No trading logic changed: the same setups fire and the same ones are declined. |
| 2026-07-27 | **GBP/JPY ADDED — BX now scans four pairs.** User: *"Is BX watching GBPJPY too? It should."* It was not: the platform's instrument universe held only EUR/USD, GBP/USD and USD/JPY, so nothing even fetched candles for it. Two lines: a row in `config/instruments.py` and the symbol in `allowed_instruments`. **Everything else derives and was verified, not assumed** — the broker symbol (`GBP/JPY` → `GBPJPY`, resolved against cTrader's own live symbol list, so there is no id table to maintain), pip size 0.01 / 3 price digits (`shared/pip.py` keys off "JPY" in the name), and the news currency map `['GBP','JPY']` (generated from the instruments table, so the news-candle and news-window gates work on it immediately). **Note this is a genuine cross** — both legs carry news, unlike the USD-quoted pairs, so the high-impact news window will gate it on GBP *and* JPY releases. **VERIFIED AGAINST THE BROKER, not assumed:** `get_symbols` on the cTrader hosted MCP (read-only `/data/` profile) returns 179 symbols including `GBPJPY` — the exact string the code derives — and the audited precision table gives `pipDigits 3`, matching `shared/pip.py`. Do not add a pair on the strength of "it will error loudly if wrong"; confirm the symbol string and the pip digits first. |
| _live-tap_ | **BX was signalling events that had already passed.** User reported a live EUR/USD RETEST (27 Jul 15:48) whose mitigation was long over: *"we are only trading zones that have been mitigated in real time, not the ones that have been passed by events."* **Cause:** both the cascade and the retest defined "now" as *any tap within the last `_RECENT`=6 H4 bars — 24 HOURS* (`mz.mitigated_at >= recent_cut`, `any(mz.tapped_by(c) for c in bars[-6:])`), and both read `closed_only(h4)`, so the LIVE bar was never consulted. A zone tapped 20 hours ago still fired. **Fix:** both paths now require the zone to be tapped by the **FORMING bar** — `mz.tapped_by(h4[-1])`. Measured over the last 60 H4 bars on GBP/USD: 7 candidate bars under the old window vs 5 under the live rule, so **2 of 7 (~29%) were stale**. **Caught in review before shipping:** the first cut required `state == "mitigated"` AND a live tap, which can NEVER both hold — the registry ages zones from CLOSED bars, so the forming bar's tap is not in the book yet and the zone still reads `unmitigated`; by the time the state flips at bar close the live bar has moved on. That would have silenced the cascade entirely. The gate is `state in ("unmitigated","mitigated")` + a live tap; `respected` stays the retest path's |
| _entry-be_ | **Entry reworked to the user's rules; breakeven finally wired; trailing deactivated.** (1) **THREE book entry methods** (Ch.9 step 4) — CHoCH and S/D flip were already there; **continuation** added as an entry-TF BOS in the trade direction, built from `map_structure().last_bos`, **no FVG wrapped as a zone**. (2) **Distal respect guard** — user: *"the 4H distal will only guide to ensure the 4H zone has been respected and the price has moved away from it a little, not struggling to break it."* The confirming close must sit `_RESPECT_BUFFER` (0.25) of the 4H zone height inside the zone from the distal; price grinding on the distal is a zone about to break, not one holding. (3) **Entry = the confirming bar's CLOSE**, not a limit at the refined POI. The M1 CHoCH only prints AFTER price has reacted away from the edge, and the old code then posted the limit back AT that edge — asking price to return to a level it had just left. Measured on 27 months: **13-14% of signals fired with price ALREADY past the entry, and 22-29% never filled inside 24h**. Market entry cannot expire. (4) **BREAKEVEN wired into `monitor/signal_monitor.py`** for `bx_sd*` only — `strategies/trade_management.py` implemented SL→entry at 1R and scored `BE` apart from `SL`, but **had no importer and had never run**, so live BX had no breakeven at all despite the user relying on one. Caught in review: the `TradeState` must be built OUTSIDE the per-bar loop or the phase resets every bar and the stop never moves — regression-tested (reach 1R on one bar, return to entry ten bars later, still scores BE). (5) **TRAILING DEACTIVATED** (user: *"deactivate trailing SL for now"*) — blocked at the TRANSITION via `allow_trailing=False`, not merely left unreachable by passing `h1_recent=None`; a BX trade now exits only at TP, BE, or its original SL. Also: `_tp_candidates` deleted (TP is a fixed `_TP_R`=3R), stop is `_SL_BUFFER_PIPS`=6 pips beyond the **4H distal** (it was being computed in `detect_setup` then silently replaced by a ~3-pip stop off the refined POI, putting spread at 20-30% of risk). **Confirmation "rejecting only 3 of 126" was investigated and is NOT a defect** — the ZONE is the filter, not the confirmation; changing nothing. **Frequency is a market output, never an acceptance criterion** (user) — reported, never gated on |
| _zone-book_ | **THE ZONE LAYER WAS REWRITTEN. See [bx-sd-architecture.md](./bx-sd-architecture.md) — read it before touching BX.** User reported a live GBP/USD SELL (27 Jul, 3.0 pip risk, 1:20.3) marked off a "zone" at 1.33555-1.33677: *"There was no zone there. We are not marking FVGs as zones."* He was right. Zones were **recomputed from a rolling 200-bar window on every scan**, so validity depended on when you asked — the signal's zone was validated by a structure break at **lag -1**, i.e. BEFORE its own imbalance existed, which let a mid-waterfall candle pass as a zone. Four "valid" supply zones were stacked down one four-bar collapse. **Root cause:** `broke_structure` searched from `origin_index` (the candle BEFORE the IFC) instead of from the IFC. **Fix:** not a patch — a rewrite to the model the user asked for: *"mark the zones when they form so they stay pre-marked the moment they qualify, then wait for price to mitigate them, then respect them, then look for confirmed entries in 1M or 5M."* New `bx_sd_registry.py` marks a zone ONCE at formation (3 book factors, break at/after the IFC), freezes its boundaries, and tracks `pending → unmitigated → mitigated → respected → broken`, keyed on the IFC's TIME so zones survive bars arriving; built by replaying closed bars, so it is a pure function of history and cannot see the future. **Every component now reads that one book** — cascade, reports, control, TP selection, and D1/W1/MN backing. **Deleted:** `bx_sd_validity`, `bx_sd_freshness` (incl. `level_pre_mitigated`, impossible by construction now), `bx_sd_continuation`, `retapped_now`, `fvg_zone`/`is_fvg_tap` (the FVG path — BX trades zones, never imbalances), `newly_mitigated_zones`. **Also fixed during the audit:** the cascade selected on `live`, which includes `respected` — so one zone could fire BOTH the fresh cascade (C+) and the retest (B/A), a duplicate that bypassed the retest's higher bar; it now selects `state == "mitigated"` only. **Verified:** the reported signal no longer fires at any window size; no zone in 27 months is marked off a pre-IFC break; replay determinism holds; setups/month UNCHANGED (5.1/4.9/5.1/5.7/5.6 — nothing cut, the user's condition); 69% of marked zones get mitigated; control/marking/registry tests and a 3-pair live e2e pass. BX went 21 modules/2,146 lines → 20/2,020 with the lifecycle ADDED |
| _book-diagrams_ | **The PDF arrived and reading the DIAGRAMS found two defects that text-only review could not.** (Book now at `trading_app_data/reference/SND.pdf`, outside the git tree — the Stop hook auto-pushes and it is copyrighted.) **(1) `control()` implemented HALF the rule.** Control is taken two ways and only the break half was coded. p36's diagram: *"the price **mitigated an unmitigated supply zone, so now SUPPLY IS IN CONTROL**"* — tapping an unmitigated zone hands control to **that zone's own side**. p38 contains both mechanisms in one sentence (*"broke through the minor supply, forcing demand to be in control… **rejected on the major supply, causing supply to be in control again**"*) and only the first was read. Ch.6 p26 settles the word: *"When price taps into a d/s zone, that has not been tapped yet, it becomes **mitigated** from unmitigated"* — **mitigated = tapped**, which is exactly what the user had said (*"the zone that was mitigated to propel the move"*). Now: latest event of either kind wins; a tap confers control only if the zone HELD (on a bar closing beyond the distal the touch belongs to the break, else the two sides tie on one bar and a plain break reports "none" — caught by test, fixed). **(2) The eq50 rule lost a real book trigger.** The marking rebuild replaced `zone width > 2 pips` with the p51 wick rule, dismissing the pip threshold as *"an unrelated size threshold"*. It is the book's **second** scenario: *"I use 50% entry in **one more scenario, if the maximum 2 pip SL can't fit**"* (p53-54). Both triggers now ORed in `bx_sd_zones.needs_eq50`; wide zones get the equilibrium entry again. **(3) Entry types named (Ch.2, diagrams pp9-10):** Entry-1 risk = after the 1st BMS (*"trend has yet to be confirmed"*), Entry-2 justification = after the 2nd (*"trend has now been confirmed"*) — exactly `StructureState.confirmed`. New `bx_sd_entry_type.py` labels every card; **no risk-entry path added** (user's decision), so p35 stays satisfied structurally. The book independently names counter-trend as a justification-entry case, corroborating the control model. **Verified:** 26 unit tests incl. both control mechanisms and their interaction; selection **unchanged** (control/entry-type are informational — the /mo and buy/sell mix must not move, and did not); marking impact re-run (median width 21.6p → 6.1p, taps −1%); card renders in all 3 control states. **(4) "contested" split out of "none".** Adding the second mechanism made same-bar ties common — `none` went from *never occurring* to **~25-30% of setups**, because one 4H bar can tap an unmitigated supply above and an unmitigated demand below. The tie rule was right but the LABEL was not: the card said *"no side in control yet"* about a bar on which both sides had just acted. `control()` now returns `contested` distinctly (the book's "tug of war", p81); `with_control` stays `None` for both neutral values so neither renders as against-control, and consumers must test `bx_sd_control.NEUTRAL` rather than `!= "none"` — testing against `"none"` alone would have classified a contested bar as a counter-trend trade. Also fixed `bx_phases_verify` asserting card lines **by index** — the card legitimately gained a line and a correct card failed the test |
| _control-not-trend_ | **THE TREND GATE WAS THE BIGGEST DEFECT IN BX AND IT WAS NOT A BOOK RULE.** User: *"Zones and being tapped cannot be less that 5 per month. Lets be realistic. Your testing tool is flawed."* He was right twice. **(a) My measurement was broken** — the funnel called `map_structure(h4).pro_trend()` ONCE over 27 months (it returns the FINAL state), applying the Jul-2026 trend to 2024 zones; on US100 that alone cut 51 setups to 8. Re-measured **walk-forward** (rolling 200-bar window, as production runs): the true rate was **1.1–1.5/month**. **(b) The gate itself was the defect.** `pro_trend()` is a swing-structure trend — **a concept this book never uses**. The book asks who is IN CONTROL (Ch.7), and control **never forbids a direction**; it forbids only the unconfirmed **risk entry** (*"We do not place a limit order here!"*, p38). The book itself takes the against-control trade: *"supply is in control, but we expect a Flip or CHoCH after we tapped in H4 demand"* (p57). **Every BX signal already passes the MANDATORY 1M/5M confirmation**, so BX was paying the book's price of admission and still being denied the trade. Removed the gate from **all three paths** — setup (`bx_sd_setup`), retest (`bx_sd_reports`, where an UNCONFIRMED trend had been silently killing *every* retest ≈ half of all bars) and continuation (`bx_sd_continuation`, which keeps its own entry-TF BOS/flip requirement = the book's p57 condition). Measured on 27 months of **real broker H4**, five instruments: **1.2 → ~5.0 setups/month (3.3–4.6×)**; **70–78% of book-valid freshly-tapped zones had been discarded purely for facing the wrong way** — matching the user's own estimate of ≥5/month. Quality split under an identical proxy showed **no material gap** (PRO 10% / COUNTER 7% / NO-TREND 13% win rate), so **no asymmetric grade bar** was added. New `bx_sd_control.py` models control the book's way (break the opposing zone → take control, latest break wins); `zone_broken` now delegates to a new `break_index` so the two can never drift. Cards state control instead of asserting a trend, with **three** states — `with_control` is `None`, not `False`, when no side is in control. `bx_sd_setup` split (150-line rule): freshness helpers → new `bx_sd_freshness.py`, verbatim |
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
