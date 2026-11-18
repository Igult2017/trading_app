# PIX — architecture (the SHAPE). The rules, in his words, are in [pix.md](pix.md).

## Files — all PIX's own; NO strategy logic shared with any other strategy
| file | job |
|---|---|
| `strategies/pix.py` | the strategy class: declares timeframes / pairs, feeds candles + the live quote to the skeleton, turns a `Plan` into a `Signal`, dedups on delivery |
| `strategies/pix_skeleton.py` | his skeleton as pure functions: `zone_plan` (trend path), `range_plan` (ranging path), `respected_5m`, `entry_1m` |
| `strategies/pix_bigzones.py` | which zones count: REAL (price travelled from it to another zone), unbroken, near the money, the wanted side (`big_zones`, `travelled_to`, `daily_atr`) |
| `strategies/pix_trend.py` | the 4H read: +1 / −1 / 0 (`regime`) — PIX's own copy, lead of 2, equal = neither |
| `strategies/pix_swings.py` | swing highs / lows and their labels (HH/LH/EH, HL/LL/EL) — PIX's own copy |
| `strategies/pix_candles.py` | "has this candle finished?" (`closed_only`) — PIX's own copy |
| `strategies/pix_zones.py` | marks every zone: the candle before a 3-candle gap, wick / engulfed / institutional (`find_fvgs`, `find_zones`, `break_index`) |

Allowed imports (enforced by `tests/pix/test_independence.py`): PIX's own modules, the standard library, and plumbing —
`core.*` (strategy base, types, ledger, stage log), `storage` (observability), `shared.pip` (price decimals),
`notifications` (card titles), `charting` (card colours). Anything else fails the test.

## Flow, one scan per instrument
```
H4 (500) ── regime ──┬── trending ── big_zones(H4) + big_zones(H1)  [D1 ATR = "near"; travelled to another zone]
                     │                  └─ nearest first → respected_5m(M5) → entry_1m(M1, live ask/bid) → 3R
                     └── ranging / no zone plan ── range_plan(M5 swing levels, 2nd respect, ≥2R room) → entry_1m
Plan → build_signal → dispatcher → CHANNEL (dm_only_exempt). autotrade: refused (not in autotrade_strategies).
```
Dedup key: `{symbol}_pix_{path}_{tf}_{level time}_{tap time}` — one signal per zone visit, committed on delivery; the
platform also holds back a repeat while one is open (one active signal per strategy + pair + direction).

## Invariants (each pinned by a test)
- Levels from CLOSED candles only; the live quote is used only as a trigger (near-the-money, stop not already through).
- Buy: stop < entry < target; sell mirrored; stop on a sell includes the spread.
- A zone closed through is never traded; a touched one may be. A zone counts only if price travelled from it to
  another zone that was still standing when reached.
- A 4H trend never trades its opposite side, in either path. A flat range reads ranging wherever the window ends.
- No PIX file imports another strategy's file or any shared logic module.

## Known open defects
- Rule 5 is an interim test until the order-flow tools are built; rule 7 (his management) is not built.
- Tall zones make wide stops (gold 13-17 Nov: a ~$79 zone → ~$68 stop from a 1M entry) — what the rule says; reported.
