# PIX — architecture (the SHAPE). The rules, in his words, are in [pix.md](pix.md).

## Files — all PIX's own; NO strategy logic shared with any other strategy
| file | job |
|---|---|
| `strategies/pix.py` | the strategy class: declares timeframes / pairs, feeds candles + the live quote to the skeleton, turns a `Plan` into a `Signal`, dedups on delivery |
| `strategies/pix_skeleton.py` | his skeleton as pure functions: `zone_plan` (trend path), `range_plan` (ranging path); both prove the zone on 1M (`_proved`) and ask the order-flow check |
| `strategies/pix_bigzones.py` | which zones count: REAL (price travelled from it to another zone), unbroken, near the money, the wanted side (`big_zones`, `travelled_to`, `daily_atr`, `candidates` — the 5M → 1H/4H order) |
| `strategies/pix_trend.py` | the trend: `regime` (+1 / −1 / 0, lead of 2, equal = neither) and `direction` (4H, else 1H) — PIX's own copy |
| `strategies/pix_swings.py` | swing highs / lows and their labels (HH/LH/EH, HL/LL/EL) — PIX's own copy |
| `strategies/pix_candles.py` | "has this candle finished?" (`closed_only`) — PIX's own copy |
| `strategies/pix_flow.py` | order flow: `absorbed` (the one refusal), `confirm` (1M divergence + reaction delta + reaction volume → the card's agree / disagree line), `cvd_state` |
| `strategies/pix_btcflow.py` | Bitcoin buy / sell per 5M / 1M candle from Binance (futures, then the spot mirror) |
| `strategies/pix_tickflow.py` | buy / sell ESTIMATE for every broker-streamed market (gold, forex), PER SYMBOL: up / down price ticks counted live from our stream |
| `strategies/pix_profile.py` | volume profile: POC, VAH, VAL, the POC's role, which levels touch a zone |
| `strategies/pix_footprint.py` | footprint: buy / sell per price inside a candle, diagonal imbalances, stacks |
| `strategies/pix_entry.py` | `reaction_entry`: the 1M touch → 2+ candles our way → pullback → stop order off it, stop behind the pullback |
| `strategies/pix_zones.py` | marks every zone: the candle before a 3-candle gap, wick / engulfed / institutional (`find_fvgs`, `find_zones`, `break_index`) |

Allowed imports (enforced by `tests/pix/test_independence.py`): PIX's own modules, the standard library, and plumbing —
`core.*` (strategy base, types, ledger, stage log), `storage` (observability), `shared.pip` (price decimals),
`notifications` (card titles), `charting` (card colours), `data.tick_listeners` (the live-tick list), `httpx` (web).
Anything else fails the test.

## Flow, one scan per instrument
```
H4 + H1 ── direction ┬── trending ── candidates: 5M inside 1H/4H → 1H/4H → lone 5M  [D1 ATR = "near"; real zones]
                     │                  └─ in that order → reaction_entry(M1: touch, 2+ our way, pullback = newest
                     │                     closed candle; live ask/bid) + no 5M close through → ORDER FLOW: absorption
                     │                     (5M/1M) refuses; divergence + delta (1M) → card line → 3R
                     └── ranging / no zone plan ── range_plan(M5 swing levels; 2nd respect = the same 1M proof; ≥2R)
Plan → build_signal → dispatcher → CHANNEL (dm_only_exempt). autotrade: refused (not in autotrade_strategies).
```
Dedup key: `{symbol}_pix_{path}_{tf}_{level time}_{pullback candle time}` — one signal per proven pullback, committed on delivery; the
platform also holds back a repeat while one is open (one active signal per strategy + pair + direction).

## Invariants (each pinned by a test)
- Levels from CLOSED candles only; the live quote is used only as a trigger (near-the-money, stop not already through).
- Buy: stop < entry < target; sell mirrored; stop on a sell includes the spread.
- No 1M reaction (2+ candles our way, then one opposite) = no plan = no signal. The pullback is always the newest
  closed 1M candle. Order flow never blocks a signal except absorption; the card says whether it agrees.
- A zone closed through is never traded; a touched one may be. A zone counts only if price travelled from it to
  another zone that was still standing when reached.
- A 4H trend never trades its opposite side, in either path. A flat range reads ranging wherever the window ends.
- No PIX file imports another strategy's file or any shared logic module.

## Known open defects
- Rule 7 (his management) is not built. Gold's order flow is an ESTIMATE (price ticks, not money) and has no figures
  for about an hour after every restart — the card then says "not available yet" (it no longer blocks the signal).
- The 1M entry was backtested over 2 years on his request (`pix-backtest-1m-entry.md`): BTC 18.2%, gold 22.8%,
  EUR/USD 16.6% wins, all under the 25% a 3R target needs. The stop behind the pullback is only ~3x the spread on BTC
  and EUR/USD (`OPEN.md` F10, his decision).
