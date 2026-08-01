# BX-S/D — architecture map (post-restructure, 2026-07-27)

**Read this before changing anything in BX.** It exists because the same defects kept being
re-derived. `bx-sd.md` holds the settled RULES and the fix log; this holds the SHAPE.

---

## The model, in one paragraph

Traders pre-mark zones and wait. BX does the same: a zone is judged **once, when it qualifies**, from
the bars available at that moment; its boundaries are then fixed forever and it moves through a
lifecycle. Nothing re-derives a zone later. Everything else in the strategy reads that one book.

```
 H4 bars ──► REGISTRY (bx_sd_registry.build)  ── the ONE zone book
                │  formation decided once, boundaries frozen
                │  pending → unmitigated → wick/body_mitigated ⇄ respected → broken
                ▼
        ┌───────┴────────┬──────────────┬──────────────┬─────────────┐
   detect_setup      scan_reports     control      _tp_candidates   htf_zone_map
   (cascade)      (heads-up/retest)  (Ch.7)        (targets)        (D1/W1/MN)
                │
                ▼
    analysis refine (15M/30M/1H)  →  MANDATORY 1M/5M confirmation  →  grade  →  card
```

## Why it is built this way

Zones used to be recomputed from a rolling 200-bar window **on every scan**, so validity depended on
when you asked. On 27 Jul 2026 that marked a mid-waterfall candle as a supply zone off a structure
break at **lag −1** — a break that happened *before* the zone's own imbalance existed — and fired a
live SELL on GBP/USD at a level the user correctly said was not a zone. A patch would have fixed that
one comparison; the model was the problem.

**Invariant that must never be broken:** a zone is judged only with data available at its formation.
Replay determinism is the test — building over N bars and N+1 bars must agree on every zone present at
N. If that ever fails, zones are being re-judged and this class of bug is back.

---

## The lifecycle

**Rewritten 2026-07-30.** Mitigation is by **wick OR body** and the two are different events; a tap
never ends a zone; only a body close beyond the distal does.

| state | meaning | transition |
|---|---|---|
| `pending` | imbalance printed, waiting for its leg to break structure | dropped only if **price returns to it before any break** — no candle count |
| `unmitigated` | qualified and MARKED — waiting for price, **however long that takes** | |
| `wick_mitigated` | wick entered, **body stayed outside** — a sweep. Orders unfilled, zone still loaded | signals, and the card says *wicked only* |
| `body_mitigated` | the body traded the zone (Ch.6 p27) — **spent** | a retap still signals, with a caution |
| `respected` | after a tap, price closed a full zone-height away | retappable; **ONCE RESPECTED IT STAYS RESPECTED** (until broken) so the RETEST path keeps it at the B/A bar |
| `broken` | **body** closed beyond the distal — dead (Ch.8 flip) | the ONLY terminal state |

`retaps` counts **return VISITS** — `in_zone` remembers whether the previous closed bar was inside, so
only the edge of a visit increments. It counted BARS until 2026-07-30 (a zone visited twice reported
16), which inflated `bx_sd_strength` exactly where a zone was weakest: grinding sideways inside a zone
is the opposite of respecting it. `last_tap_at` stamps the most recent bar inside.

**`live_visit()` is the dedup unit for the mitigation heads-up**, not the zone. The registry ages on
CLOSED bars, so at the instant of a live tap the counters have not moved; `live_visit()` returns a
number stable across one visit and incrementing on the next. Keying the heads-up on the zone alone
sent exactly one alert per zone for its entire life and swallowed every retap.

**`live` = every state except `broken`.** Do **not** select on `live` in the cascade — `respected`
**SUPERSEDED 2026-08-01 — there is now ONE entry model.** The cascade selects **`respected` only**:
tapped, closed a full zone-height away, and tapped again now. The user's rule — *"wait for the price
to move away from the zone and then when it pulls back we use that for entry"*. Entering on the
FIRST touch is gone; that path had no evidence the zone held and is where the losses came from.

The separate RETEST path in `bx_sd_reports` ② is **removed**, because it became the same trade. The
cascade absorbed it, not the reverse — the cascade owns the entry, the watch lock and the
invalidation alert, which the retest path never had.

**Live-zone counts after the 2026-07-30 lifecycle change:** EUR/USD 7→25, GBP/USD 14→22,
USD/JPY 15→39, GBP/JPY 19→31. **The marking fix later the same day barely moved the COUNT** (1000 H4
bars: GBP/JPY 32→35 live, GBP/USD 22→23, EUR/USD 28→30) — it changed the SIZE of each band, which is
the point.

## Formation — the book's three factors, all at formation time

1. **IFC** — a real 3-candle imbalance (`find_fvgs`: candle1.low > candle3.high, wick to wick)
2. **Its leg broke structure** — the most recent structure event at or before the IFC is already in
   the zone's direction (a **pullback origin** inside an established leg), OR a break in that
   direction prints afterwards. **There is NO candle window**: `BREAK_SPAN = 6` was invented, appears
   nowhere in the book's 167 pages, and discarded pullback-origin zones — it cost a real GBP/JPY
   setup on 15/29 Jul. The 27 Jul defect is still rejected because there the prevailing structure ran
   *against* the candidate.
3. **Liquidity grabbed before it** (`swept_before`, 20-bar look-back)

Then marked by the book's technique (`mark_zone`): **wick** (p33-35) → **engulfed** (p72) →
**institutional** (Ch.4).

**THE BAND IS THE WHOLE CANDLE, HIGH TO LOW** (p16 and p19 both box the entire candle; p72: *"Demand
is the last bearish candle before a break of sub structure"*). p17's **open and MTH are two
monitoring RAYS drawn on the candle, not its edges** — *"By putting these horizontal lines allows us
to constantly monitor these Institutional candles."* Coding them as the edges (2026-07-26 → 07-30)
cropped the band to a third of its size, produced 0.1-pip "zones", and turned an ordinary sweep into
a body break — it deleted a live GBP/JPY zone four bars before it ran 77 pips. **The error is not
symmetric:** too narrow invents breaks and misses taps; too wide can do neither, because
`bx_sd_ltf.refine_zone` collapses a wide 4H zone onto a tight LTF POI for the entry (the book's Ch.9
third step). Do not "tighten" this. Pinned by `tests/bx_sd/test_marking.py`.

**Zone width scales the trade.** The stop is `_SL_BUFFER_PIPS` beyond the 4H distal and
`_RESPECT_BUFFER` is a fraction of zone height, so both track the band. Median H4 zone width is
~18–38 pips depending on the pair; TP is a fixed 3R, so R:R holds and absolute risk moves with it.

**No catch-up replay from the IFC.** The bars between the IFC and the marking are the impulse *moving
away* from the zone; replaying them makes the zone mitigated by its own creation candle. Measured:
zero mitigations are missed by starting the clock at `marked_at` (27 months, both pairs).

---

## Module map — 20 files

| file | owns |
|---|---|
| **`bx_sd_registry.py`** | **the zone book** — formation, lifecycle, `to_zone()` |
| **`bx_sd_strength.py`** | **zone strength** — HTF confluence + violent departure + stack depth + retaps. Labels, never gates. **`score()` MUST be passed `htf_map` and `as_zone`** or HTF confluence — the heaviest weight — silently scores zero; that call was wrong for a day and backed 0 of 196 zones |
| `bx_sd_zones.py` | MARKING techniques + `Zone`, `find_fvgs`, `zone_broken`/`break_index`, `needs_eq50` |
| `bx_sd.py` | orchestrator — **builds the book ONCE per scan** and passes it down |
| `bx_sd_setup.py` | the cascade: which marked zone is price working now |
| `bx_sd_reports.py` | ① mitigation heads-up (DM) ② retest (channel, B/A) |
| `bx_sd_control.py` | Ch.7 "who is in control" — reads `mitigated_at`/`broken_at` |
| `bx_sd_entry.py` | entry trigger (CHoCH / S/D flip), refinement, TP candidates |
| `bx_sd_ltf.py` | 1M/5M confirmation + `refine_zone` |
| `bx_sd_confirm.py` | `confirm_grade` — refine + confirm + grade |
| `bx_sd_htf.py` | D1/W1/MN backing — **also via the registry** |
| `bx_sd_signal.py` | the card |
| `bx_sd_entry_type.py` | Ch.2 entry-type naming (label only) |
| `bx_sd_structure.py` / `_liquidity` / `_pools` / `_confluence` / `_analysis` / `_watch` / `_retest` / `_mitigation` | supporting |

**`find_zones` has exactly ONE legitimate caller: `bx_sd_ltf.refine_zone`** (a transient POI *inside*
an already-marked zone). Anything else calling it is minting zones outside the book — that is the
regression to guard against.

## Deleted, and why

| gone | superseded by |
|---|---|
| `bx_sd_validity.py` | the registry's formation test |
| `bx_sd_freshness.py` | `mitigated_at`; **`level_pre_mitigated` is impossible by construction** when zones persist |
| `bx_sd_continuation.py`, `fvg_zone`, `is_fvg_tap` | removed — they entered off an **imbalance**, not a zone. BX trades zones only |
| `retapped_now` | the `respected` state |
| `newly_mitigated_zones` | the `wick_mitigated` / `body_mitigated` states |
| the `pro_trend()` gate | Ch.7 control (reported, never a gate) — it cost 70-78% of valid zones |

---

## Measured behaviour (27 months, real broker H4 + M1)

| | GBP/USD | EUR/USD | GBP/JPY | US100 | US30 |
|---|---|---|---|---|---|
| setups/month | 5.1 | 4.9 | 5.1 | 5.7 | 5.6 |

Win rate (full cascade, M1-confirmed, spread-netted): **EUR/USD 6.9% / −4.1R**, **GBP/USD 1.1% /
−79.9R**. Confirmation arrives a median **19–22 min** after the H4 close.

## Entry, stop and target — the user's rules (2026-07-27)

| | rule | constant |
|---|---|---|
| **Tap must be LIVE** | the zone must be tapped by the **FORMING bar**, right now — not "sometime in the last N bars". A tap is an EVENT HAPPENING NOW | — |
| **Trigger** | any of the book's THREE methods on 1M/5M: **CHoCH · S/D flip · continuation BOS** (Ch.9 step 4) | — |
| **Respect** | the confirming close must sit this far inside the 4H zone from the **distal** — *"moved away from it a little, not struggling to break it"* | `_RESPECT_BUFFER = 0.25` (of zone height) |
| **Entry** | the **confirming bar's close** — the confirmation IS the signal, so enter where price is, not at a level it just left | — |
| **Stop** | beyond the **4H zone's distal** — never the refined POI | `_SL_BUFFER_PIPS = 6.0` |
| **Target** | fixed R multiple — *"TP can take care of itself if we take care of entry well"* | `_TP_R = 3.0` |
| **Breakeven** | SL → entry at 1R; a return to entry is a **scratch, not a loss** | — |
| **Trailing** | **OFF**, blocked at the transition (`allow_trailing=False`) | — |

All constants live in `bx_sd_setup.py` (`bx_sd_entry` imports from it, so that direction is acyclic).

**These are the user's numbers, not derived ones.** Change them on his instruction or on evidence, not
because a backtest prefers something else.

## KNOWN OPEN DEFECTS — not fixed, do not assume otherwise

1. **Entry-price model is provisional.** "Enter at the confirming close" is the minimum change that
   stops signals firing behind price. The user has explicitly parked anything cleverer: *"keep it that
   way until I have a data-backed approach on how the entry signal should be."* **Do not invent one.**
2. ~~**Replay depth** — `candle_counts[TF.H4] = 200`~~ **CLOSED** — it is 1000 (~166 days). This entry
   was stale for three days; a stale open-defect list is worse than none, because the next session
   trusts it.
3. **`pro_trend()` is dead code** in `bx_sd_structure` — no callers, kept only because removing a
   public method risks callers outside `strategies/`.
4. **Four files are over the 150-line limit** and were before the 2026-07-30 work: `bx_sd_zones.py`
   289, `bx_sd_registry.py` 282, `bx_sd.py` 195, `bx_sd_setup.py` 193. `bx_sd_zones` splits cleanly
   (the marking techniques are one responsibility) but it is imported widely, so it is a planned
   refactor, not something to do inside a bug fix.
5. **`bx_sd_analysis.analysis_refine` sets `entry`, `sl` and `risk_pips` that are all superseded.**
   `confirm_grade` overwrites `risk_pips` from the trigger, and the card and the `Signal` both read
   `trig.*`, so **no wrong number reaches the user** — but the object carries a stop computed at
   `distal ± 2 pip` while the real stop is `_SL_BUFFER_PIPS = 6` off the **4H** distal. Read `trig`,
   never `conf`, for prices.
6. **The RETEST card carries no zone strength or mitigation note.** `bx_sd_retest._setup_for_zone`
   builds its own minimal `SetupResult` rather than going through `detect_setup`, so the two
   enrichments added on 2026-07-30 reach the fresh cascade only. The retest path says `🔁 RETEST [B]`
   and the grade, which is not nothing, but it cannot say *wicked only* or *STRONG*.

> **THE TAP IS LIVE, THE ZONE IS CLOSED-BAR.** The registry marks and ages zones from CLOSED bars
> (a level must come from a closed candle). But "is price at this zone?" is asked of the **FORMING**
> bar. The cascade therefore accepts a zone in state `unmitigated` **or** `mitigated` plus a live tap —
> requiring `mitigated` alone is impossible, because the forming bar's tap is not in the book yet and
> by the time the state flips at bar close the live bar has moved on. **That combination silences the
> strategy; it was caught in review, do not reintroduce it.**

### Closed, with what closed them
- ~~Stop/target scale mismatch (median 20R)~~ — stop now off the 4H distal, TP fixed at 3R.
- ~~`trade_management.py` dead~~ — wired into `monitor/signal_monitor.py` for `bx_sd*` signals.
- ~~Signals firing behind price~~ — entry is the confirming close; **market entry cannot expire**.
- ~~Signals for events that had already passed~~ — both paths defined "now" as *any tap inside the last
  6 H4 bars (24 HOURS)* and read only closed bars, so a zone tapped 20 hours ago still fired. Reported
  live by the user (EUR/USD RETEST, 27 Jul 15:48). Both now require a tap by the **forming** bar.
  Measured over 60 H4 bars: 7 candidate bars under the old window vs 5 under the live rule — **2 of 7
  were stale**.
- **Confirmation "rejecting only 3 of 126" was investigated and is NOT a defect.** The filter in this
  strategy is the ZONE, not the confirmation. A tapped zone usually does produce a CHoCH within 24h —
  that is the confirmation confirming, which is its job. Tightening it would cut setups to chase a
  number. Do not "fix" this.

> **Setup frequency is a market output, never an acceptance criterion.** How many zones form per month
> is the market's business. Report it as an observation; never gate a change on it, and never tune
> toward a preferred number. (User, 2026-07-27.)

## Verification harnesses (scratchpad)

In the repo (**72 checks**): `tests/bx_sd/test_zones.py` (28, lifecycle) ·
`tests/bx_sd/test_marking.py` (19, band geometry + the 29 Jul regression, on REAL cTrader bars) ·
`tests/bx_sd/test_visits.py` (25, retap-as-visit, `live_visit()` dedup, strength HTF wiring, card).

Scratchpad: `bx_registry_test.py` (invariants + determinism + the 27 Jul case) · `bx_walkforward.py`
(setups/month) · `bx_winrate.py` (full cascade win rate) · `bx_control_test.py` · `bx_e2e.py`.

**Measure walk-forward or the number is fiction** — `map_structure()` returns the FINAL state, so
filtering whole history in one pass applies today's structure to the past. That mistake produced a
1.2/month figure that was wrong by 4×.
