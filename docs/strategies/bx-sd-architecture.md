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

## BX publishes TWO moments — rewritten 2026-08-19 to HIS sequence

    liquidity swept -> price taps the EXTREME HTF unmitigated zone -> it is RESPECTED
    -> the CHoCH breaks the opposite zone -> price RETURNS to tap the zone that reaction created
    -> confirmed entry.        "This means the signal fires twice."

| | **SIGNAL 1 — the reaction** | **SIGNAL 2 — the confirmed entry** |
|---|---|---|
| fires when | the extreme zone is **RESPECTED** (price closed a full zone-height away) + a 5M/1M confirmation | price **returns** to the zone that reaction created, the CHoCH complete behind it |
| zone | the **parent** — the HTF extreme | the **child** — a different 4H zone |
| labelled | **UNCONFIRMED ENTRY** | **CONFIRMED ENTRY** |
| goes to | **the channel** | **the channel** |
| carries | no entry/stop/target — the reaction, not a trade | entry, stop, target |
| owned by | `bx_sd_reports` ① | `bx_sd_setup` + `bx_sd_confirm` |

**THE DIVIDER IS NO LONGER `respected` vs not-respected ON ONE ZONE.** It is **two different zones at
two different times**, and that is the whole correction. Previously signal 1 fired on a zone that was
*not* respected and signal 2 re-traded the *same* zone — so BX announced a setup before price had
reacted at all, then entered the zone it had just announced.

**BOTH CARDS GO TO THE CHANNEL** (his instruction, 2026-08-19). This supersedes the 2026-07-27
rule *"only send BX entry signals to the channel"* — the room now sees both halves of the
sequence. Signal 1 still carries no entry, stop or target, so it cannot be mistaken for a
trade. Delivering it required `on_setup_alert` to honour `DM_ONLY_EXEMPT`, which only the
confirmed path had done: production runs `SIGNALS_DM_ONLY=true`, so a `to_channel` alert was
being forced private no matter what the strategy asked for.

**HTF MEANS THE EXTREME ZONE, NOT A D/W/M CHART.** His correction: *"HTF is not D/W/Monthly, it only
means the extreme and sometimes it can be 4HR... D/W/M are a strong confluence supporting the HTF
zone."* `htf_backing` scores and grades; it must never gate.

**THE CHILD IS A 4H ZONE.** His correction after I misread the diagram's `1M Supply` label: *"The LTF
is for entry. The zone created is a 4HR zone."* `bx_sd_ltf.refine_zone` prices the entry INSIDE it,
exactly as before — the LTF never becomes the zone.

**THE LINK IS DERIVED, NOT REMEMBERED** (`bx_sd_lineage`). Both zones are already in the book; the
only thing missing was the sentence *"this zone was born of the reaction at that one"*. The first
design stored the child on `self._locked` at signal 1; deriving it survives restarts, replays
identically, and cannot disagree with the registry.

- `child_of(parent, zones)` — same side, marked at/after `parent.respected_at`, nearest in price
- `parent_of(child, zones)` — the inverse; **no parent means not an entry candidate**
- `choch_complete(child)` — `broke_through >= 1`. One is the rule, two is a bonus and never gates
- `is_entry_zone(mz, zones, live)` — signal 2: has a parent, CHoCH done, still loaded, tapped now

**MEASURED, 5.6 months, book windowed to 1000 H4 bars as production does:**

| | signal 1 | signal 2 |
|---|---|---|
| EUR/USD | 62 (**11.1/mo**) | 44 (**7.9/mo**) |
| GBP/USD | 61 (**11.0/mo**) | 37 (**6.6/mo**) |

Signal 2 is properly rarer than signal 1 — every entry follows a reaction, not every reaction earns a
return visit.

**A HARNESS BUG THAT READ 0 ENTRIES FIRST, recorded because it is the fifth of its family today:** the
replay added *every live zone* to its "already seen this visit" set instead of only the **tapped**
ones, so from the second bar onward nothing could ever count. The book was healthy throughout — 26 of
51 live zones were entry-eligible but for the tap. **Verify a 0 against the book before believing it.**

## SIGNAL 1 REBUILT — the pullback entry (2026-08-22)

His specification, given answer-by-answer and quoted here because it supersedes the version above:

| | |
|---|---|
| opens | price taps a zone that was **unmitigated AND extreme at that moment** |
| then | price **leaves the zone's band** — *not* `respected`. *"any pullback that comes after the price has left the extreme zone it tapped"* |
| fires | the **first pullback**, wherever it lands. No clock: *"we dont use time we just keep track of price action"* |
| requires | a **1H zone AND a 15M-or-30M zone** being tapped there. Asked directly whether this scores or refuses: *"These are a confluence for signal one and also a requirement. Without them the signal doesn't fire."* It **GATES** |
| confirms | a **1M/5M** entry, the same `reaction_on` the rest of the cascade uses |
| closes | price closes through the **first opposite zone** — *"this stops when the price has broken the first opposite zone which is the first qualification for signal 2 after CHOCH"* |
| carries | a real entry/stop/target, tagged **UNCONFIRMED / RISKY**: *"It should be a valid signal but carries unconfirmed/risky entry tag"* |
| 1H, not 2H | *"1HR is enough so lets use 1HR instead of 2HR"* — which also avoids gluing a timeframe the broker does not serve natively |

**EVERY CHECK IS ASKED OF THE MOMENT PRICE ARRIVED, NEVER OF NOW — and that is the whole design.**
Both labels his rule names are destroyed by the tap that triggers it: a tapped zone is no longer
`unmitigated`, and only an unmitigated zone may hold `extreme` (`classify_roles`, registry:304), so
it is relabelled `decisional` when the tapping bar closes. Ask either question at entry time and the
answer is always NO. **That is precisely the contradiction that has had signal 2 dead since 14 Aug**
(see the gate note below), and `bx_sd_signal1.was_extreme_at` exists so signal 1 cannot inherit it.
The reconstruction reads the registry's own transition stamps (`marked_at`, `mitigated_at`,
`respected_at`, `broken_at`) — no new state is stored.

**Entry, stop and target are signal 2's, unchanged.** `entry_trigger` is reused as-is, anchored on
the pullback zone instead of the 4H zone. Not a new pricing rule — his existing rules applied to a
different zone, which is the only change he asked for.

**The window close does NOT use `broke_through`.** That counter looks forward from a zone's
*creation* and stops at the first counter-side structure event, so on an extreme zone it measures the
original impulse that left the zone behind — possibly months before price came back to tap it. Right
for signal 2, where the child is created BY the reaction; wrong here. `broken_at` per zone answers
his question directly.

**One approximation, stated rather than hidden.** `was_extreme_at` reconstructs the group from
`z.group`, which the registry computes over zones live NOW. A zone that was live at the tap but has
since broken carries group -1 and is invisible, so in that narrow case this can say `extreme` where
the registry would have said `decisional`. Grouping is not re-derived here on purpose — a second copy
of that rule would drift from the registry's. Consequence: if the extreme zone itself later breaks,
the window closes.

**Performance contract.** `build_mtf_books` is called ONCE per scan. The first version built the
1H/30M/15M books inside `find_signal1`, which runs per zone — ~50 zones x 3 replays per instrument
per tick, on a tick that already takes ~12s. Measured after the fix: 48 ms once, then 8.8 ms for all
50 zones.

**Files:** `strategies/bx_sd_signal1.py` (new), wired in `strategies/bx_sd.py` before the signal-2
cascade. Tests: `tests/bx_sd/test_signal1_window.py` (33 checks).

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

## A ZONE IS MARKED WHEN ITS BREAK PRINTS, NOT BEFORE (fixed 2026-08-15)

**His rule:** *"zones dont form immediately but as its features develop along the way. For example BOS
is not instant so we cant make it instantly."*

`build` computes every structure event over the whole bar array once, then `_broke_structure` asked
`any(e.index > ifc_i)` — matching a break **anywhere later in the array**, including one that had not
printed at the bar being replayed. So a zone was promoted on the bar after its imbalance rather than
on the bar its break arrived.

| real broker H4, 3,500 bars | GBP/USD | EUR/USD |
|---|---|---|
| marked BEFORE their break printed | **247 of 720 (34%)** | **236 of 724 (33%)** |
| how early | median **10** bars, worst **111** (18.5 days) | median **10**, worst **104** |
| zone book after the fix | 720 → **569** | 724 → **575** |
| tradeable (`respected`) | 25 → **18** | 28 → **21** |
| surviving zones whose STATE changed | **1** | **0** |

`marked_at` starts the zone's clock, so a zone marked early is aged across bars on which it was not
yet a zone — taps, mitigations and `respected` all accrue from price that predates its existence, and
`respected` is exactly what the cascade selects on. ~150 zones per pair were being kept alive by a
break they had not earned; the survivors are almost unchanged, so this removes bad zones rather than
disturbing good ones.

**Replay determinism could not see it** — a short build and a long build both mark on the same early
bar, so N-vs-N+1 agreed. `test_zones.py` now checks the real property: a zone is never marked before
its qualifying break, on synthetic events and on both real pairs.

## ⚠ WHAT ACTUALLY REFUSES A SETUP (corrected 2026-08-19)

Only two things, in `bx_sd_setup.detect_setup`:

| gate | source | what it asks |
|---|---|---|
| **Unmitigated** | *"we are only trading unmitigated and extreme zones"* | `state == "unmitigated"` or wick-only (a wick leaves the orders unfilled) |
| **CHoCH — an OPPOSITE zone was broken** | *"the CHOCH will later be complete when it breaks through the opposite zone"* | `broke_through >= 1`. **One is the rule, two is the bonus** — two stays a strength input and must never gate |

**A third requirement lives upstream and always has:** `bx_sd_registry` will not MARK a zone unless
liquidity was swept before its imbalance (`swept_before` at the IFC). That is his *"there is no valid
CHOCH if no liquidity was swept on the way to tapping the HTF zone"* — enforced at formation, which
is the right moment.

**TWO GATES WERE ADDED AND REMOVED THE SAME DAY. Both were mine, not his:**

- **D1/W1/MN backing as a requirement.** His correction: *"HTF is not D/W/Monthly, it only means the
  extreme and sometimes it can be 4HR... D/W/Monthly are confluences and not rules. HTF can be 4HR
  so long as it qualifies."* `htf_backing` scores in `bx_sd_strength` and grades in `bx_sd_confirm`
  — **it must never refuse.** Cost while it did: 84 → 71 and 60 → 45 setups.
- **A second liquidity sweep at the RETURN tap.** The sweep belongs before price taps the HTF zone —
  the move that *births* the tradeable zone — not before the return visit that trades it. Re-asking
  it at the tap was a different, later question wearing the same name. Cost: 84 → 51 and 60 → 48.

**HIS SEQUENCE — the two errors above both came from blurring it. The HTF zone and the CHoCH are
different things:**

```
liquidity swept  →  price taps the HTF zone  →  it REACTS there, leaving an unmitigated zone
                 →  CHoCH completes when price breaks the opposite zone(s)
                 →  price RETURNS to that unmitigated zone  →  1M/5M confirmation  →  entry
```

**POSITION DOES NOT DECIDE THE EXTREME.** The cascade used to refuse on `role == "decisional"`
before any real criterion ran. The extreme is the zone made by the reaction at the HTF zone; the
decisional is one formed on a later rally that failed to reach it — position is the consequence, not
the test. Measured: EUR/USD 18 → 46, GBP/USD 16 → 39. `role` is still computed and REPORTED on the
tap card; it no longer refuses.

**QUALIFYING 4H TAPS (not signals): EUR/USD ~10/month, GBP/USD ~7/month.** The 1M/5M confirmation
downstream is what turns those into signals, and it is not counted here.

**Measuring this is harder than it looks — four wrong numbers preceded the right one**, every one a
harness fault: building the zone book from a window that INCLUDES the bar whose tap is under test
(the registry ages the zone to `mitigated` first — reported **0 setups**); feeding Daily only instead
of D1+W1+MN; counting distinct zones rather than per-visit; and sampling every 4th bar. **Tap records
are cached at `trading_app_data/bx_cache/`** so a variant is evaluated in seconds.

## EXTREME vs DECISIONAL — never trade the near zone (added 2026-08-15)

**Smart Risk, "3. Double Zone Break Out":** *"we cannot place any trades based on the decisional
supply zone because there is a high chance that the price will push higher to sweep the liquidity
accumulated above the double tops and trigger the stop-loss of traders who entered from the decisional
supply zone."* — *"Don't use the decisional zones, you will be a liquidity."*

`bx_sd_registry.classify_roles` labels every LIVE zone within its group; `bx_sd_setup` refuses
`decisional` outright.

- **A group** is same-side zones left by ONE move — it ends at the first structure event the other way.
- **The extreme** is the zone furthest from where price went (highest supply / lowest demand).
  **Order of formation does not decide it**; a later zone printing higher is still the extreme.
- **A zone alone in its group keeps role `""`** and trades normally — there is no decisional zone to
  be preferred over, so no distinction is claimed.
- **Broken zones are excluded**, or `extreme` could be handed to a corpse and demote the live one.

**NOTHING IS MINTED — this is labelling only.** He settled it: *"the qualities that make a zone are not
different from what the book we have been using says."* Measured over 3,500 H4 bars, the opposite zone
is **already in the book within 12 bars of a break 86% of the time** (median 1 bar, 43% same-bar), so
BX's existing formation rules already produce it. Do not add a second way to mint a zone.

Roles are read **once over the finished book**, not frozen per zone: a decisional zone becomes the
extreme the moment the one above it breaks. That is the market changing its mind, not a re-judgement
of the zone — boundaries, marking and lifecycle are untouched, so the formation invariant holds.

**`broke_through`** (`count_breakthroughs`) counts the opposite zones the move AFTER each zone closed
through — the document's criterion 3, *"break & close below or above the two successive supply or
demand zones along its path."* It looks **forward** from `marked_at` (a supply zone is marked at the
top; the demand zones it breaks are broken afterwards) and stops at the first opposite structure
event. A label and a strength input, **never a gate on its own**.

**Measured effect of the decisional refusal**, standing book at the end of ~2 years:

| | GBP/USD | EUR/USD |
|---|---|---|
| respected zones | 18 | 21 |
| tradeable after the refusal | **2** | **5** |
| live zones with a double break (2+) | 31 of 40 | 36 of 51 |

That is a deliberate, large cut. His instruction: *"I would prefer 4 signals the whole month but
quality."* Reported as an observation — **never tune toward a number.**

## THE ENTRY IS THE DOCUMENT'S (rewritten 2026-08-15) — tap, confirm, stop order

His instruction: *"Just build the CHOCH document entry model then we will do confirmation in LTF plus
we use stop orders. That is enough."*

| | before | now |
|---|---|---|
| which zone | any `respected` zone | **unmitigated + CHoCH** — `role` is reported, not a refusal, since 2026-08-19 |
| trigger | `respected` **and** (live retap **or** 4H pullback) | **the tap itself** |
| confirmation | 1M/5M `reaction_on` | **unchanged** |
| entry | the confirming CLOSE (a market fill) | **a STOP ORDER `_ENTRY_STOP_BUFFER_PIPS` beyond the confirming bar's extreme** |
| stop | 15 pips behind the 4H pullback's extreme | **`_SL_BUFFER_PIPS` beyond the 4H zone distal** — the document's *"a few pips above the highest point of the zone"* |
| target | 3R | **unchanged** |

**WHY THIS IS NOT A RETURN TO THE OLD FIRST-TOUCH BUG.** The 2026-08-01 note — *"entering on the
FIRST touch is gone; that path had no evidence the zone held and is where the losses came from"* —
was true of THAT model, where any respected zone qualified and nothing upstream filtered. The two
models put the evidence in different places: the old one waited for the zone to prove itself AFTER
forming; the document's is satisfied by the move that CREATED it (HTF mitigation, liquidity sweep,
double-zone break, extreme not decisional). **Only the last of those four is built** — see the open
defects. That is a knowing trade-off he scoped, not an oversight.

**DELETED WITH IT, not disabled:** `pullback_4h`, `SetupResult.pb_extreme`, `_PB_LOOKBACK_H4`,
`_PB_MIN_MOVE`, `_PB_MIN_RETRACE`, `_PB_MAX_RETRACE`, `_SL_BEHIND_PULLBACK_PIPS`, and
`tests/bx_sd/test_pullback_4h.py`. `test_choch_zones.py` asserts each name is **absent**, because a
behaviour-only test would pass if someone reintroduced the constants.

**A STOP ORDER CAN GO UNFILLED**, where the old market entry could not. Some signals will now never
become trades — that is the *"no trade, no risk"* property, deliberate. `bx_sd_watch` already owns
invalidation of a locked setup.

### THE CHEEKY CARD WAS UNREACHABLE FOR ITS ENTIRE LIFE (fixed 2026-08-15)

The user: *"the cheeky messages component has never worked because I have never received cheeky
messages."* He was right, and the cause was not frequency.

`dispatcher.on_setup_alert` chose the FORMAT and the DESTINATION with one condition:

```python
if signal.to_channel and not settings.signals_dm_only:
    caption = format_tap_alert(signal)      # the cheeky card
else:
    caption = format_setup_alert(signal)    # generic heads-up
```

Production runs **`SIGNALS_DM_ONLY=true`**, so the first branch could never execute and
`format_tap_alert` was dead code in practice. **Measured: the alert fired 334 times over ~2 years of
real bars** — it was never rare, it just never LOOKED like itself. A destination switch silently
disabled a card design.

**Fixed:** `to_channel` chooses the FORMAT, `signals_dm_only` chooses only WHERE. Pinned by a test
that reads the dispatcher's own source and fails if the two are ever re-coupled.

**Where the taps go** (2,199 tapped zones, real H4 + M1, GBP/USD):

| | count |
|---|---|
| no 1M reversal reaction (`REVERSAL_ONLY = True`) | **1,704 (77%)** |
| reaction found | 495 |
| would fire | **334** (~14/month) |

`REVERSAL_ONLY` is the big filter and it is doing its job — it drops the continuation arm, which at
an unproven zone is nearly no evidence.

### The card now WARNS instead of listing absences

His rule: *"for decisional, you can send a cheeky message when they are confirmed on LTF but warn
that it is a decisional zone. But for extreme zones, provide a complete signal."*

The card's two "why we wait" lines were stale — they described the `respected`/pullback model deleted
earlier the same day. Replaced with the document's own reason, and the headline carries it too, so a
skim-reader cannot miss it. The closing line was also corrected: *"we take this zone one step later"*
was true of the old model and is now false — a decisional zone is never taken.

**Caption length is a hard constraint, not a preference.** Telegram REJECTS a photo caption over 1024
chars, so a wordier warning does not degrade the card, it deletes it. Two drafts breached it (1040
and 1045) and the test caught both.

### The tap-alert divider moved from `respected` to `role`

`respected` was what guaranteed the tap alert and the entry could never fire on one zone at one
moment. The new trigger removed that requirement, so the guarantee was rebuilt on `role`:

| | takes |
|---|---|
| **ENTRY** (`bx_sd_setup`) | unmitigated + the CHoCH (an opposite zone broken). Sweep is enforced at FORMATION; D/W/M is confluence only (2026-08-19) |
| **TAP ALERT** (`bx_sd_reports` ③) | **`role == "decisional"` only** |

Disjoint by construction, and it makes the alert genuinely informative: it is now the card that says
*"price is at a zone, but it is the decisional one, so we are standing aside."* **Do not relax either
side without replacing the guarantee again.** Pinned in `test_tap_alert.py` — an extreme zone and a
lone zone must both produce nothing.

**Measured on real broker H4** (every 3rd bar, 25 months): GBP/USD **31 setups (1.3/month)**,
EUR/USD **26 (1.1/month)**; **0 decisional zones taken** and **0 stops not beyond the zone distal**
on either pair. Reported as an observation — his standing rule is that setup frequency is a market
output, never an acceptance criterion.

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

0a. ~~The document's quality criteria are not built~~ **CLOSED 2026-08-15 — all four are in, graded
   as the document grades them.** Only criterion 1 is absolute (*"valid only under one condition"*),
   and it holds **by construction**: BX only ever trades a tapped 4H zone. Criterion 2 (liquidity
   swept, `_W_SWEPT`) and criterion 3 (double-zone break, `_W_DOUBLE`) are **weights in
   `bx_sd_strength`**, matching the document's own *"additional confirmation"* / *"strong
   confluence"*. Extreme-vs-decisional is the one refusal added on top, and that is the document's
   *"we cannot place any trades based on the decisional zone"* — also absolute language.
   **DO NOT PROMOTE 2 OR 3 TO GATES.** Criterion 2 shipped as a gate for one day and refused 33-55%
   of taps; BX already requires the 4H zone AND a 1M/5M confirmation, so a third mandatory refusal
   stops the strategy trading. The user's rule: *"we still have double checks."*

0z. **SIGNAL 2 IS BLOCKED SHUT — two gates in one loop that cannot both be true (found 2026-08-22).**
   `bx_sd_setup` requires `mz.state == "respected"` (line ~230) and then, 47 lines later,
   `mz.state == "unmitigated" or mz.wick_only` (line ~277). `respected` is neither, so **no zone in
   any state passes both**. Verified across every state the registry can hold: unmitigated blocked by
   the first, wick/body blocked by both, respected blocked by the second, broken blocked by both.
   **Nothing has passed since 14 Aug 2026 12:57 UTC** — 18 confirmed entries in the 30 days before,
   zero in the 8 days after, and zero entry candidates even BUILT. Production, 21 Aug 20:59: EUR/USD
   14 zones tapped, GBP/USD 10, GBP/JPY 9, USD/JPY 6 — every one refused, all four pairs at once.
   **NOT FIXED — awaiting his ruling on which gate is the intruder.** The reading offered (his, not
   mine, to accept or reject): the parent must be `respected`, the child must be `unmitigated`, and
   the loop applies both to the same zone. `bx_sd_signal1.was_extreme_at` shows the shape of the fix.

0y. **`4c45cee` promoted the three CHoCH criteria to GATES**, which defect 0a below explicitly
   forbids — *"DO NOT PROMOTE 2 OR 3 TO GATES… a third mandatory refusal stops the strategy
   trading."* It postdates the 14 Aug stop so it is not the cause, but it will compound it. Untouched.

0. **The document's CHoCH definition is NOT built, and it is blocked on a design decision.** Smart
   Risk: a change of character is a close beyond the last major swing **AND through the latest
   opposite zone**. BX's `map_structure` breaks on the swing alone. **It cannot simply be made
   zone-aware: `bx_sd_registry.build` calls `map_structure` to BUILD the zone book (line ~189), so a
   zone-aware structure engine is circular.** The options are (a) apply the zone half only to the
   entry-side CHoCH in `bx_sd_ltf.find_ltf_choch`, which already requires the reversal to have tapped
   the 4H zone, or (b) a two-pass build — structure first without zones, then a zone-aware second
   pass. Flagged to the user rather than guessed. **Do not resolve this by inventing a rule.**
0b. ~~Criterion 2 — liquidity swept BEFORE the tap~~ **CLOSED 2026-08-15** — `swept_within` in
   `bx_sd_liquidity`, gated in the cascade. See below for why `swept_before` could not answer it.
0c. ~~The card does not show `role` or `broke_through`~~ **CLOSED 2026-08-15**.


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
