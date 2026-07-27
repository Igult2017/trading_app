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

## Module map — 13 files, ~1,600 lines

| file | owns |
|---|---|
| `vix1.py` | orchestrator: watch → bias → news gates → 1M signals → grade → build |
| `vix1_bias.py` | `detect_bias(h1, h4)` — trend on H4, momentum on H1 |
| `vix1_momentum.py` | momentum-candle detection + `momentum_grade` (A/B/C → confidence) |
| `vix1_trend.py` | `clear_trend` — HH+HL / LH+LL |
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

### Momentum-candle gates (`vix1_momentum.py`)
`_MIN_BODY_MULT 2.5` × the 100-bar median body · `_MIN_BODY_FRAC 0.50` of its own range ·
`_MIN_VS_PREV 1.0` (bigger than the previous body) · `_MAX_CWICK_FRAC 0.25` counter-wick.
A-grade: `_A_BODY_FRAC 0.75` + `_A_CWICK_FRAC 0.15` → `_A_CONF 0.85`.

**These were calibrated 2026-07-20/21 against his real candles. Do not re-tune them without his data.**

---

## KNOWN OPEN DEFECTS / GAPS — not fixed, do not assume otherwise

1. **PENDING REDESIGN, blocked on the user.** The code reproduced only **16% of his real trades** —
   detection is too strict (an earlier 4× threshold rejected 80% of his candles; now 2.5×). Blocked on
   him supplying ~20 trades with entry/SL/TP. Then: recalibrate detection, add *selection* (which setup
   to take when several qualify), and move the trend read 1HR → 4HR. **Do not "fix" this by guessing at
   thresholds.**
2. **The R ratchet is ADVICE ONLY.** `vix1_manage` decides what to TELL him ("+3R reached — move your
   stop to +2R"); `vix1_alerts` DMs it. **Nothing moves a broker stop** — the user manages the
   position himself. Whether VIX.1 should manage the stop programmatically is his call, not an
   oversight to silently fix.
3. **`ARM_R` imported but unused** in `monitor/vix1_alerts.py` — cosmetic, fixed 2026-07-27.
4. **No automated test suite in the repo.** The scratchpad harnesses are throwaway, so nothing
   guards VIX.1 against regressions and nothing exercises its real code paths on real data. This is
   the biggest structural gap.

## What is NOT a defect — checked 2026-07-27

- **VIX.1 cannot fire on a stale pullback.** `find_pullback` scans **backwards from the newest bar**
  and takes the most recent counter candle, and the M1 window is sized to `LOOKBACK + 2` hours — so a
  pullback from hours or days ago can never become an entry. Verified 2026-07-27.
- **Only one genuinely unused import** across all 13 files (AST-verified, not grep-guessed).
- **No dead functions**, no TODO/FIXME/HACK markers.

## Verification without a backtest

**Never run a backtest without explicit approval** (see `CLAUDE.md`). What needs no approval and
should be used instead: unit tests on the real functions, invariant checks over historical data (e.g.
"every signal's pullback candle is past the line", "no level is ever read from the forming bar"),
regression suites, module-import checks, and production log inspection.
