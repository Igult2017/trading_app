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

## Liquidity pools — one day definition, three period keys (2026-08-05)

The book's four pool types (Ch.5) all feed `swept_before` at zone FORMATION and `defensive_ok` at
entry. `bx_sd_pools.forex_day()` is the single rule everything else derives from:

| pool | key | note |
|---|---|---|
| swing high/low, EQH/EQL (2-pip tol) | — | built directly in `find_liquidity` |
| PDH/PDL | `forex_day(t)` | |
| PWH/PWL | ISO week of `forex_day(t)` | Mon–Fri forex days share one ISO week = Sun 21:00 → Fri 21:00 |
| PMH/PML | `(year, month)` of `forex_day(t)` | real calendar months |
| Asia/London/NY high/low | `_SESSIONS` + a **finer feed** | absent unless `session_candles` is passed |

**The day rolls at 21:00 UTC, and 21 is not a guess.** The broker's H4 grid moves with DST — bar
starts are `{01,05,09,13,17,21}` in EEST and `{02,06,10,14,18,22}` in EET, both its own midnight. A
22:00 roll is exact in winter and files every summer day's FIRST bar under the previous day. Nothing
starts between 19:00 and 21:00, so 21:00 is exact in **both** regimes — not a compromise between them.

**`session_candles` must be passed to `build()` or session pools do not exist.** They are optional
by signature and were fed to only one of three call sites for as long as the parameter existed, so
factor 3 could not see a single Asia/London/NY level while the entry-time defensive check two modules
away had been reading them all along.

## BX publishes TWO moments (2026-08-04)

The user asked for the earlier one: *"For price taps into 4HR zone and there is a confirmation in 5M
or 1M a cheeky signal should be sent … I am asking for the first signal before the pullback."*

| | **TAP ALERT** ("cheeky one") | **ENTRY** |
|---|---|---|
| fires when | zone TAPPED + a 1M/5M **reversal** reaction | zone RESPECTED → moved away → first 4H pullback → 1M/5M confirmation |
| zone state | **NOT** `respected` | `respected` |
| carries | no entry, no stop, no target | all three, plus the order type |
| goes to | the channel, `alert_only` + `to_channel` | the channel, a real signal |
| owned by | `bx_sd_reports` ③ → `bx_sd_tap_alert` | `bx_sd_setup` + `bx_sd_confirm` |

**`respected` is the divider, and it is absolute.** The tap alert requires the zone NOT to be
respected; the entry requires that it is. One zone can never produce both at the same moment, so
there is never a question of which card means "place a trade". Do not relax either side of that
without replacing the guarantee.

**The confirmation is ONE function** — `bx_sd_entry.reaction_on`, shared by both. It was inline in
`entry_trigger` until the tap alert needed the same question answered without an entry. Two copies
would drift, and the drift would be invisible: the room told a zone is confirmed while the cascade
that decides whether to trade it disagrees.

**The tap alert passes `reversal_only=True`.** The continuation arm asks only "is the last entry-TF
BOS in my direction" — i.e. the move is still going. At a zone that has already proven itself that is
evidence; at an unproven zone it is nearly nothing, and it fires on most trending pairs.
`test_tap_alert` pins this with a faded-rally fixture that the reversal arms decline and continuation
accepts.

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
**SUPERSEDED 2026-08-01 — there is now ONE entry model.** The cascade selects **`respected` only**
(tapped, then closed a full zone-height away), and then requires **a live RETAP *or* a 4H PULLBACK**.
The user's rule — *"wait for the price to move away from the zone and then when it pulls back we use
that for entry"*, plus *"keep the retap and add a pullback"*. Entering on the FIRST touch is gone;
that path had no evidence the zone held and is where the losses came from. See "A RETAP and a
PULLBACK are different things" below — the OR is the part that keeps getting broken.

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
| `bx_sd_reports.py` | ① mitigation heads-up (DM) ③ **TAP ALERT — the public pre-pullback card** (② retest deleted) |
| **`bx_sd_tap_alert.py`** | **the tap alert's FACTS** — zone, tap kind, reaction method. No entry/stop/target, ever |
| **`bx_sd_pools.py`** | where the resting stops are: **`forex_day()`** (the 21:00-UTC roll every period key derives from), period pools (PDH/PWH/PMH), session pools (Asia/London/NY) |
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
| the `pro_trend()` gate | Ch.7 control (reported, never a gate) — it cost 70-78% of valid zones. **A narrower, regime-conditional gate returned 2026-08-01**: pro-trend only while the 4H is trending, both directions in a range (`bx_sd_setup.regime`) |
| the **RETEST path** (`bx_sd_reports` ②) | the core cascade — 2026-08-01. It required `respected` + live retap + B/A confirmation, which is now a strict SUBSET of the cascade's retap branch, so both would emit for one zone with different grades and different dedup keys (unable to suppress each other). The retap did **not** go with it; it is one of the cascade's two ways in |
| `_PULLBACK_LOOKBACK` (entry-TF, 24 bars) | `_PB_LOOKBACK_H4` — the pullback is a **4H** event; a second, tighter definition on the entry TF was silently the one the stop used |
| `bx_sd_retest.py` (whole module) | nothing — `bx_sd_reports` was its **only** importer, so deleting the retest path orphaned it outright. Found by the 2026-08-01 audit, not by the change that caused it |

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
| **Zone must be RESPECTED first** | `state == "respected"` — price tapped it and then CLOSED a full zone-height clear of it. Nothing fires on a first touch any more | `REACT_MULT = 1.0` (registry) |
| **Then a RETAP *or* a 4H PULLBACK** | *"Keep the retap and add a pullback"* (2026-08-01). Two ways in, an **OR**, never one replacing the other | `_PB_LOOKBACK_H4 = 12` bars |
| **Retap must be LIVE** | back INSIDE the zone by the **FORMING bar**, right now. A tap is an EVENT HAPPENING NOW | — |
| **Pullback is 4H and CLOSED** | price left the zone, ran, and is retracing on the 4H — **one candle or many**, and it *"might not"* reach the zone. A pullback is a LEVEL, so closed bars only | `_PB_LOOKBACK_H4 = 12` |
| **Trigger** | any of the book's THREE methods on 1M/5M: **CHoCH · S/D flip · continuation BOS** (Ch.9 step 4). This is what confirms the pullback has **ENDED** | — |
| **Respect (distal guard)** | the confirming close must sit this far inside the 4H zone from the **distal** — *"moved away from it a little, not struggling to break it"* | `_RESPECT_BUFFER = 0.25` (of zone height) |
| **Entry** | the **confirming bar's close** — the confirmation IS the signal, so enter where price is, not at a level it just left | — |
| **Stop** | **15 pips behind the 4H pullback's own extreme**, *"whether the pullback happens on the zone or far from it"*. On a bare retap (no 4H pullback) it falls back beyond the 4H zone's distal | `_SL_BEHIND_PULLBACK_PIPS = 15.0` / `_SL_BUFFER_PIPS = 6.0` |
| **Target** | fixed R multiple — *"TP can take care of itself if we take care of entry well"* | `_TP_R = 3.0` |
| **Breakeven** | SL → entry at 1R; a return to entry is a **scratch, not a loss** | — |
| **Trailing** | **OFF**, blocked at the transition (`allow_trailing=False`) | — |

All constants live in `bx_sd_setup.py` (`bx_sd_entry` imports from it, so that direction is acyclic).

**These are the user's numbers, not derived ones.** Change them on his instruction or on evidence, not
because a backtest prefers something else.

### A RETAP and a PULLBACK are different things — and both are entries

This is the single most re-broken rule in BX. It was got wrong twice in one day, in opposite
directions. In the user's words (2026-08-01):

> *"A tap and a retap of the zone is different from a pullback. A pullback means the price has left
> that zone and on its way it just pulls back abit — not back to the zone, but just a pullback then
> continuation. A pullback can take the price back to the zone but in some cases it might not."*

| | RETAP | PULLBACK |
|---|---|---|
| what | price is back **inside** the zone | price left the zone, ran, and is **retracing within that move** |
| where | at the zone | usually **nowhere near** the zone — but always measured FROM it |
| timeframe | the zone's, read from the **FORMING** bar (a trigger) | **4H**, read from **CLOSED** bars (a level) |
| size | n/a | a fraction of the move away: `_PB_MIN_RETRACE` (0.236) to `_PB_MAX_RETRACE` (1.0) |
| detector | `MarkedZone.tapped_by(live_bar)` | `pullback_4h(bars, zone_edge, zone_height, respected_at, buy)` |
| stop anchors to | the 4H zone's distal + 6 pips | the pullback's own extreme + 15 pips |

**THE PULLBACK IS ANCHORED TO THE ZONE, AND THAT IS THE WHOLE DESIGN.** It takes `zone_edge`,
`zone_height` and `respected_at` because all three questions it asks are relative to the zone:

1. **move away** — since `respected_at`, price travelled `_PB_MIN_MOVE` (1.0) zone-heights from the
   near edge. Deliberately the same multiple as `bx_sd_registry.REACT_MULT`, so "price really left"
   has ONE definition platform-wide.
2. **it turned** — the move's extreme is inside `_PB_LOOKBACK_H4` (12) closed bars, and a bar has
   printed after it.
3. **retracement** — price came back 0.236–1.0 **of that move**. At 1.0 it is exactly at the zone
   edge; beyond that it is a retap or a break, which is the other branch.

**Proximity is structural, not a separate check.** Because the move is measured from the zone and
the retrace is a fraction of it, a zone price never left cannot produce a pullback. That matters
because the previous version had no zone at all, and a forgotten proximity check is precisely how it
sold an 82-day-old zone 28 pips away.

**The gate is `respected AND (retap OR pullback)`.** `tests/bx_sd/test_pullback_4h.py` writes that
out as a truth table precisely so a future edit that collapses it back to one branch fails loudly.

> **THE 2026-08-01 FIGURES ON THIS SECTION ARE VOID.** They read "retap only 59 (17%) · 4H pullback
> 255 (74%) · both 29 (8%)" and were quoted as a property of the market. They were measuring a
> broken detector: `pullback_4h` fired on 85% of random walks and returned True for a pure one-way
> move. A 74% pullback share was evidence of the bug, not of the market. Numbers below are from the
> rebuilt detector.

**Measured, real broker H4** (600 sampled bars, 400-bar context, EUR/USD + GBP/USD + GBP/JPY):
**240 active setups (40.0% of sampled bars)** — **retap only 88 · 4H pullback 151 · both 1**.
Rejected: no entry event 145, counter-trend 130, badly priced 85. The "no entry event" count rose
from 23 to 145 against the old detector, which is the gate actually doing its job.

**Full path, through `BXStrategy.analyze` with real M1 bars** — 160 calls, EUR/USD + GBP/USD, **0
exceptions**, every entry at `rr = 3.0`. Real entry→SL **median 17.8 (EUR/USD) / 58.9 (GBP/USD)
pips**, max 47.0 / 130.2. The wide tail is defect 7 below and remains the number to watch.

**Do not quote an H4-close proxy for the stop.** Measured that way the tail reads 349.9 pips on
GBP/JPY; the full path never produces it, because the entry is the entry-TF confirming close, which
fires at the pullback's turn. Only full-path figures belong in this doc.

The "retap before price ever left the zone" case needs no extra test: `respected` already demands a
close a full zone-height clear, so a zone price never left is never respected and simply waits —
which is the rule *"in case the retap happens before the price leaves the zone, we wait for the
pullback in 4HR"*.

**Three wrong readings, recorded so none returns:**

1. **Retap only.** Missed every pullback that never came back to the zone — most of them. This was
   the state for weeks.
2. **"Price on the working side of the zone".** Dropped the retap entirely and admitted any bar in
   the move away as if it were a pullback. Shipped and corrected the same day. It also read the
   pullback off the **entry TF** (24 bars = 24 minutes on 1M), which is a wiggle inside a pullback,
   not a pullback, and produced 15-pip stops with no structure behind them.
3. **A bare 12-bar window with no zone** (2026-08-01 → 03). Took the window's extreme and called
   everything after it the pullback. Measured: **True for a pure one-way collapse, True for a pure
   rally, and 1704/2000 = 85.2% of random walks** — approximately "the window extreme is not the
   newest bar". It shipped a live GBP/USD SELL off a 13 May zone price never came within 27.7 pips
   of, describing a **+174 pip four-day RALLY** as the pullback and hanging the stop off its high.
   **The user caught it from one chart.** `tests/bx_sd/test_aug03_regression.py` holds the real
   cTrader bars and asserts it can never fire again.

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
6. ~~**The RETEST card carries no zone strength or mitigation note.**~~ **CLOSED** — the RETEST path was
   deleted 2026-08-01 (it became a strict subset of the cascade), and `bx_sd_retest.py` was deleted
   with it: `bx_sd_reports` was its only importer. (This entry first claimed `bx_sd_watch` still used
   it. It does not — the audit caught that, which is the entire argument for running one.)
7. **The wide-stop tail — RE-MEASURED 2026-08-03 after the detector was rebuilt.** Full path, real
   M1: median **17.8 (EUR/USD) / 58.9 (GBP/USD)** pips, max **47.0 / 130.2**. GBP/USD widened
   (114.9 → 130.2) because the stop now sits behind the *real* retracement instead of a window
   extreme — more correct, not tighter. **GBP/JPY is still unmeasured on the full path** (no M1
   history that deep) and is the one to watch. Not capped: the rule is "15 pips behind the
   pullback" with no bound, and `details.risk_pips` is on every card. **Never quote an H4-close
   proxy for this** — measured that way the tail reads 349.9 pips, which the full path never
   produces, because the entry is the confirming close at the pullback's turn.
8. **Telegram signals carry NO CHART, and have not for some time.** `charting/chart_generator.py`
   defines `generate_chart()` and **nothing calls it**; `Signal.chart_path` is declared on the type
   and read by `notifications/dispatcher._send_photo`, but **nothing ever sets it**, so every card
   takes the text fallback. Platform-wide (not BX-specific) and **pre-existing** — it was found by
   the 2026-08-01 audit, not caused by it. Left as-is because restoring charts is a behaviour change
   the user has not asked for. `CLAUDE.md` listed chart generation as step 6 of the scan loop and has
   been corrected.
9. **`_RESPECT_BUFFER` is close to vacuous on the pullback path.** It requires the confirming close to
   sit 25% of zone height inside the 4H zone, off the distal — a test written when the entry WAS at
   the zone. On a pullback entry that never returns to the zone, the close is outside it entirely and
   the check passes trivially. It still does real work on the retap path. Not removed, because it is
   the only thing standing between a retap entry and a zone being ground through.

> **THE TAP IS LIVE, THE ZONE IS CLOSED-BAR — and the PULLBACK is closed-bar too.** The registry marks
> and ages zones from CLOSED bars (a level must come from a closed candle), and `pullback_4h` reads
> closed bars for the same reason: where a move turned is a LEVEL. But "is price at this zone?" is
> asked of the **FORMING** bar, because a tap is an EVENT. The cascade therefore pairs a closed-bar
> state (`respected`) with a live-bar trigger (the retap). Requiring a *mitigated* state AND a live tap
> in the same instant is impossible — the forming bar's tap is not in the book yet, and by the time the
> state flips at bar close the live bar has moved on. **That combination silences the strategy; it was
> caught in review, do not reintroduce it.**

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

In the repo: `tests/bx_sd/test_zones.py` (28, lifecycle) ·
`tests/bx_sd/test_marking.py` (19, band geometry + the 29 Jul regression, on REAL cTrader bars) ·
`tests/bx_sd/test_visits.py` (25, retap-as-visit, `live_visit()` dedup, strength HTF wiring, card) ·
`tests/bx_sd/test_pullback_4h.py` (26, the zone-anchored pullback + the gate as a truth table) ·
**`tests/bx_sd/test_aug03_regression.py` (12, REAL cTrader bars — the signal that must never fire
again)** · `tests/bx_sd/test_regime.py` (the 4H-only regime gate) ·
`tests/test_no_book_citations.py` (14 modules).

> **A test that passes is not a test that works.** `test_pullback_4h.py` contained a case named
> *"an unbroken run with no retracement is NOT a pullback"* which passed for weeks against a
> detector that returned True for exactly that — the fixture put the extreme on the last bar, the
> only shape the broken code rejected. **Build the fixture to break the code, not to pass it**, and
> where the bug came from live data, pin the live data (`test_aug03_regression.py`).

Scratchpad: `bx_registry_test.py` (invariants + determinism + the 27 Jul case) · `bx_walkforward.py`
(setups/month) · `bx_winrate.py` (full cascade win rate) · `bx_control_test.py` · `bx_e2e.py`.

**Measure walk-forward or the number is fiction** — `map_structure()` returns the FINAL state, so
filtering whole history in one pass applies today's structure to the past. That mistake produced a
1.2/month figure that was wrong by 4×.
