# VOCANT.1 — the Volume Strategy

Source: the "Volume Strategy" playbook (`VOCANT11.pdf`, 7pp, user's Desktop — not in the repo).
Pairs: **EUR/USD, GBP/USD**. Sessions: **London/NY**. Phase 1 = signals only (DM); Phase 2/3 pending.

---

## THE RULES — settled with the user, do not re-derive

Each of these was corrected at least once. If a change would contradict one, it is wrong.

### The 1HR does two jobs, and only two
Volume + trend confirmation, and it gives us **the lines**. Nothing else. The 1HR **never puts a
clock on the entry** — it can be ready for hours while the 1M is not. The wait is **open-ended**; a
bias flip ends a setup, a timer never does.

### The line is for CLARITY AND ACCURACY — not invalidation
> "The 1HR line consideration in 1M is just for accuracy during entry and to ensure we dont enter at
> the wrong point."

Price crossing back over the line does **NOT** mean the idea was wrong. (I assumed "line = where
we're wrong" twice and built on it twice. It isn't.)

### Two lines, separate jobs
| | Where | Job |
|---|---|---|
| **LINE 1** | 1st volume candle's **close** (== candle 2's open) | **gates the entry** — where an entry belongs |
| **LINE 2** | **inside the body**, the open wick's height off line 1 | **only adjusts the stop** — where an opposite move is expected to reverse |

> "Line 2 is only important as it can help us adjust our SL based on where we expect the price to reverse."

Line 2 **never gates**. With a small/no-wick candle it collapses onto line 1 — which is the ordinary
case, because small-or-no wicks **is** the volume-candle filter. Line 2 is inside the body by
construction: the 33% wick cap forces body ≥34% of range, so the open wick is always shorter than the
body (verified on 20k random volume candles, zero violations).

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
- A pullback may run several candles; **only the first matters** — it sits nearest the resumption. A
  doji is not a pullback.

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

### Levels closed, triggers live
A **level must stay put; a trigger must be live.**
- 1HR → `closed_only()`. A forming candle's close **is the current price**, so the line would track
  price. Proven: price 1.2686/1.2678/1.2670 → line 1.2686/1.2678/1.2670.
- 1M forming bar → **kept on purpose**. There, live price is the whole point.

### Nothing hardcoded where the market can say it
Thresholds come off the 1M's own recent candles or the volume candle itself. A real body is judged
against the 1M's **own average body** — what is a real body in London is noise in Tokyo.

---

## Fix log (newest first — `git log` has the full reasoning)

| commit | what |
|---|---|
| `54eff8d` | fractal = 1–4 candles (not Williams); **the LINE decides alignment**, `clear_trend` out of the 1M. 3/6 → **6/6** |
| `34ba9ca` | volume candle + line must come from a **CLOSED** 1HR candle. Was **70 of 82** prod log lines — VOCANT.1 idle ~85% of the time |
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
`vocant1.py` (orchestration) · `vocant1_bias.py` (1HR volume rules) · `vocant1_trend.py` (structure —
**1HR only**) · `vocant1_lines.py` (the two lines) · `vocant1_fractal.py` (1–4 candle fractal) ·
`vocant1_pullback.py` (the entry level) · `vocant1_entry.py` (assembly) · `vocant1_signal.py` ·
`vocant1_watch.py`

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

## Open / not done
- **GAP 1** — risk disconnected from the setup's own invalidation. **Needs restating**: my write-up
  assumed *line = invalidation*, which is wrong (see above), so the gap as I stated it may not exist.
- **`_MAX_SL_PIPS` GBP 20p vs EUR 15p** — my number, never the user's. User only ever said **15**.
- **`_MIN_SL_PIPS = 5`** — mine, never discussed.
- **`self._locked` is RAM-only** — a redeploy forgets a pending setup, so its invalidation alert is
  lost. The signal itself is safe (DB-persisted dedup).
- Phase 2 (2% pending stop orders) / Phase 3 (BE, partial, trail).
