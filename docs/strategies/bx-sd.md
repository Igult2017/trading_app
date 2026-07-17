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

### Levels closed, taps and price live
A **level must stay put; an event is live.**
- `find_zones` → IFCs from `closed_only()`; **mitigation reads the FULL series** (a tap is happening now)
- `map_structure` → **closed only**. Its own rule is "by body CLOSE, never wicks" — a forming bar has
  no close, so its "close" is just live price, and a BOS could confirm then un-confirm.
- `detect_setup`'s `price = h4[-1].close` and `_first_tap` → **LIVE, untouched**

Proven before fixing: the same zone appeared/vanished purely from the forming H4 bar's low
(1.2860 EXISTS → 1.2844 GONE). On the 4H that flicker lasts **hours**.

Safe because `closed_only` drops **trailing** bars only (data is chronological), so an index into the
closed list stays valid in the full list — verified explicitly.

**`find_liquidity` deliberately NOT trimmed:** pools come from `find_swing_points`, which needs bars
either side, so a forming bar can never be a pivot; `_daily_pools` already skips "the current forming
day"; `is_swept` reads wicks, which are live facts. Nothing to fix.

**15M / D1 / W1 / MN** get it free — the trim sits inside the builders, not the callers. (A forming
**MN** bar is "forming" for a month.)

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
unswept opposing pool between entry and SL) · **4H confirms the setup and only the 4H** · ≥2R.

### Rate (measured, 2y real data, 3 pairs)
**~4.1 setups/month** combined (98 in 24 months) — roughly one a week. Valid-zone mitigations
(the DM heads-up rate): **~37/month ≈ 1.2/day**. The 4H gate passes ~11% of tapped valid zones; those
still face the 15M CHoCH and the 1M/5M ≥2R trigger, so **actual entries are fewer than 4/month**.

---

## Fix log (newest first)

| commit | what |
|---|---|
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

## Open / not done
- **`self._locked` is RAM-only** — a redeploy forgets a watched setup, losing its invalidation alert.
- Deliberately deferred (user's call): G2 latency (by design — it's the win-rate), G6 zone selection
  by strength, G7 counter-trend (out of scope).
- Phase 2: auto-execute (cTrader orders) + management.
- BX channel signals aren't DB-saved → no TP/SL close notification in the channel.
