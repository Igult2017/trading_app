# Separate test — momentum candles after a quiet market, with / without CVD (18 Nov 2026) — INTERIM

**Not VIX.1.** His words: *"After a thin or no volume market, wait for the momentum candles … confirm … by waiting for
the first, second and third … If cvd aligns with the price, take a trade and if it diverges no trade."* INTERIM:
GBP/JPY is added when its 2-year 1-minute download completes.

## Rules (fixed before the run)
- Quiet = no momentum candle (his 2.5x rule) in the 24 hours before (his own definition, `vix1_tradeable.py:7`).
- The move starts with the first momentum candle after it; a momentum candle the other way ends it. Versions: trade the
  1st, 2nd or 3rd momentum candle of the move.
- CVD (an estimate — forex has no real buy/sell volume): a 1-minute candle closing up adds its tick volume, down
  subtracts it (the standard method in TradingView/LuxAlgo scripts). Aligned = over 12 hours, price and CVD both moved
  the trade's way.
- Entry and management as in `momentum-pullback-backtest.md`. Kit: `trading_app_data/tools/volume_after_quiet.py`.

## Why it can be trusted
18 hand-built proof cases (`test_volume_after_quiet.py`) with teeth; data checks as above; 5 random setups checked;
all 13 wins re-checked by separate code: 13 of 13 real.

## Findings — GBP/USD + EUR/USD, 18 Nov 2024 → 17 Nov 2026
| version | trades | a month | full loss | breakeven | 2R | total |
|---|---|---|---|---|---|---|
| 1st momentum candle | 80 | 3.3 | 28 | 45 | 7 | −15.39R |
| 1st + CVD | 55 | 2.3 | 21 | 30 | 4 | −13.91R |
| **2nd momentum candle** | 37 | 1.5 | 10 | 23 | 4 | **−2.54R** |
| 2nd + CVD | 32 | 1.3 | 10 | 18 | 4 | −2.54R |
| 3rd ⚠ / 3rd + CVD ⚠ | 17 / 16 | 0.7 | 7 / 6 | 9 / 9 | 1 / 1 | −5.32 / −4.24R |

## Recommendation
Not profitable as specified; waiting for the 2nd momentum candle is closest to break-even. CVD changes little. Same
breakeven pattern as the pullback test — test the breakeven next (needs his approval).
