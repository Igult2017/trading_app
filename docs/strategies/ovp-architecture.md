# OVP — architecture (the SHAPE). The rules, in his words, are in [ovp.md](ovp.md).

## Files (all OVP's own; shared platform resources only)
| file | job |
|---|---|
| `strategies/ovp.py` | the strategy class: declares timeframes / pairs, feeds candles + the live quote to the skeleton, turns a `Plan` into a `Signal`, dedups on delivery |
| `strategies/ovp_skeleton.py` | his skeleton as pure functions: `zone_plan` (trend path), `range_plan` (ranging path), `respected_5m`, `entry_1m` |
| `strategies/ovp_bigzones.py` | which zones count: BIG, unbroken, near the money, the wanted side (`big_zones`, `run_length`, `is_big`, `daily_atr`) |
| `strategies/ovp_trend.py` | the 4H read: +1 / −1 / 0 (`regime`, over `shared/trend_detector.detect`) |
| `strategies/ovp_zones.py` | marks every zone: the candle before a 3-candle gap, wick / engulfed / institutional (`find_fvgs`, `find_zones`, `break_index`) |

## Flow, one scan per instrument
```
H4 (500) ── regime ──┬── trending ── big_zones(H4) + big_zones(H1)  [D1 ATR = "near"]
                     │                  └─ nearest first → respected_5m(M5) → entry_1m(M1, live ask/bid) → 3R
                     └── ranging / no zone plan ── range_plan(M5 swing levels, 2nd respect, ≥2R room) → entry_1m
Plan → build_signal → dispatcher → CHANNEL (dm_only_exempt). autotrade: refused (not in autotrade_strategies).
```
Dedup key: `{symbol}_ovp_{path}_{tf}_{level time}_{tap time}` — one signal per zone visit, committed on delivery.

## Invariants (each pinned by a test)
- Levels from CLOSED candles only; the live quote is used only as a trigger (near-the-money, stop not already through).
- Buy: stop < entry < target; sell mirrored; stop on a sell includes the spread.
- A zone closed through is never traded; a touched one may be.
- A 4H trend never trades its opposite side, in either path.
- No OVP file imports a BX-S/D module.

## Known open defects
- **The 4H trend read flickers in a range** (`shared/trend_detector.py:33-36`, labels in `shared/swing_points.py:46,52`):
  a surplus of ONE higher-high over lower-high calls a trend, and EQUAL highs/lows are labelled lower — so one flat
  range read down / ranging / up depending only on where the 50-candle window ended. Shared code (BX-S/D and the
  platform's trend pre-filter read it too), so the fix is his decision — `docs/OPEN.md` F1.
- Rule 5 is an interim test until the order-flow tools are built; rule 7 (his management) is not built.
