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
                │  pending → unmitigated → mitigated → respected → broken
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

| state | meaning | transition |
|---|---|---|
| `pending` | imbalance printed, waiting to see if the impulse breaks structure | up to `BREAK_SPAN`(6) bars; no break → **dropped, never a zone** |
| `unmitigated` | qualified and MARKED — waiting for price | |
| `mitigated` | price tapped it (Ch.6 p27) | transient: median **1 bar** before it resolves |
| `respected` | after the tap, price closed a full zone-height away | the RETEST path's input |
| `broken` | body closed beyond the distal — dead (Ch.8 flip) | terminal |

Measured on GBP/USD, 27 months: **361 zones marked, 69% ever mitigated, 45% ever respected**, end state
`broken 339 / unmitigated 13 / respected 9`.

**`live` = unmitigated | mitigated | respected.** Do **not** select on `live` in the cascade — that
was a real bug: `respected` belongs to the retest path (min_grade `B`), and accepting it in the fresh
cascade fired the same zone twice, the second time at C+, bypassing the higher bar the retest requires.
The cascade selects `state == "mitigated"` only.

## Formation — the book's three factors, all at formation time

1. **IFC** — a real 3-candle imbalance (`find_fvgs`: candle1.low > candle3.high, wick to wick)
2. **Its impulse broke structure** — the break must be at or **after** the IFC (`ifc_i <= e.index <=
   ifc_i + BREAK_SPAN`). *Starting this window at the origin candle is what caused the 27 Jul defect.*
3. **Liquidity grabbed before it** (`swept_before`, 20-bar look-back)

Then marked by the book's technique (`mark_zone`): **wick** (p33-35) → **engulfed** (p72) →
**institutional** open→MTH (Ch.4).

**No catch-up replay from the IFC.** The bars between the IFC and the marking are the impulse *moving
away* from the zone; replaying them makes the zone mitigated by its own creation candle. Measured:
zero mitigations are missed by starting the clock at `marked_at` (27 months, both pairs).

---

## Module map — 20 files

| file | owns |
|---|---|
| **`bx_sd_registry.py`** | **the zone book** — formation, lifecycle, `to_zone()` |
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
| `newly_mitigated_zones` | `state == "mitigated"` |
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
2. **Replay depth** — `candle_counts[TF.H4] = 200`; zones persist until mitigated or broken, and the
   same history shows 7 live zones at 200 bars vs 13 at 797. Older live zones are invisible.
3. **`pro_trend()` is dead code** in `bx_sd_structure` — no callers, kept only because removing a
   public method risks callers outside `strategies/`.

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

`bx_registry_test.py` (invariants + determinism + the 27 Jul case) · `bx_walkforward.py` (setups/month)
· `bx_winrate.py` (full cascade win rate) · `bx_control_test.py` · `bx_marking_test.py` · `bx_e2e.py`.

**Measure walk-forward or the number is fiction** — `map_structure()` returns the FINAL state, so
filtering whole history in one pass applies today's structure to the past. That mistake produced a
1.2/month figure that was wrong by 4×.
