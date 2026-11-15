# VIX.1 — Liquidity voids and news: test report (15 Nov 2026) — **INTERIM**

> **INTERIM.** The money result (did the changed trades win or lose?) is still being worked out:
> about 33 of the 283 trades that differ have been followed to the end so far. Everything else below
> is final. This page will be updated when the scoring finishes.

## The short answer so far

| question | answer |
|---|---|
| Do voids out of a quiet market behave differently? | **No.** They fill about as often as any other void (84% vs 81%). |
| Do voids around news behave differently? | **No.** They are bigger (26 vs 16 pips), but fill about as often (78% vs 82%). |
| How much would the new definition change? | **Most voids would stop counting.** Only 98 of 1,213 voids (8%) come out of a quiet market. |
| Does adding "news" on top change anything? | **Almost nothing.** Trades with and without the news condition differ by 0 to 2 per pair. |
| Your 10 Nov volume candles | **Today's rule calls them voids; the new definition does not.** |
| Does the new definition make money? | **Not known yet.** The scoring is still running. |

**Recommendation so far: do not change the void rule yet.** The new definition does not pick out
voids that behave differently, which was the reason for it. Wait for the money result before
deciding. If those trades turn out to be winners, the rule could be loosened. But it would be loosened
because today's rule blocks good trades, not because "quiet" or "news" identifies the real voids.

## What was tested

- **Today's void rule** (`vix1_void.py`):
  - a void is a stretch of price that fast candles crossed, each more than 5× a normal candle
    (`vix1_void.py:110-117`);
  - the band is at least as tall as a normal hour's range (1× ATR, `vix1_void.py:147-152`);
  - VIX.1 looks back 48 hours for one;
  - while price is going back into the void, VIX.1 does not trade that way. It waits for the fill to
    finish, then for 2 momentum candles.
- **The new definition (B):** the same, plus the market was quiet before it, meaning no momentum candle
  in either direction in the 24 hours before the void's first candle. It is the same test VIX.1
  already uses for a quiet market (`vix1_tradeable.py:178-188`).
- **B with news (BN):** B, plus a high-impact release for the pair's currencies in the void's first
  candle or the hour before it.
- **Pairs and dates:** GBP/USD, EUR/USD and GBP/JPY, 1 Feb 2020 to 7 Apr 2025. That is where the news
  data and the price data overlap.

## The news data, and how its problems were fixed

- **Source:** the free ForexFactory calendar copy on Hugging Face (your choice). It had two faults:
  1. **From 2023, summer times are exactly 1 hour early.** For example, the US rate decision of
     12 Jun 2024 is listed at 17:00 UTC, but it came out at 18:00. Up to 2022 every time checked is
     right. Fixed by adding 1 hour to those rows.
  2. **About half the important releases have no time at all**: 47% in 2021-2025. They include the US
     jobs report, US inflation and the Bank of England rate. They were filled in, in this order of trust:
     - the time of their partner release on the same day (ForexFactory prints the time once for a
       group that comes out together, which is why the rest were blank);
     - otherwise the release's published fixed time: US data 08:30 New York, the US rate decision 14:00
       New York, the Bank of England 12:00 London, the European rate decision 13:45, then 14:15
       Frankfurt from 21 Jul 2022;
     - otherwise the time the same release had on its other dates that year.
- **Checks:**
  - the filled-in times agree with the times the file does record for the same releases **100%**
    (944 of 944);
  - 20 releases whose real time I know were checked one by one. All are right, including the March
    2020 emergency rate cuts.
  - 180 of 2,549 releases in 2020-2025 have no fixed time, mostly speeches, so they were left out.
- Tool: `trading_app_data/tools/news_table.py`. Clean table: `trading_app_data/news/high_impact_utc.csv`.

## Step 2 — the voids themselves (final)

All three pairs, 1,213 voids under today's rule. "Filled" = price went all the way back through the
band within 240 trading hours.

| kind of void | count | half-filled | fully filled | middle time to fill | middle size |
|---|---|---|---|---|---|
| all (today's rule) | 1,213 | 87% | 81% | 22 h | 18.2 pips |
| out of a quiet market (B) | 98 | 90% | 84% | 26 h | 19.5 pips |
| not out of a quiet market | 1,115 | 87% | 81% | 22 h | 18.2 pips |
| with news | 391 | 85% | 78% | 24 h | 26.1 pips |
| without news | 822 | 88% | 82% | 22 h | 15.7 pips |
| quiet market and news (BN) | 41 | 88% | 80% | 26 h | 32.8 pips |

**What this means:**
- Whatever kind of void it is, price goes back to fill it about 4 times in 5. Being out of a quiet
  market, or around news, does not change that.
- So neither condition separates the voids that fill from the ones that don't.
- Per-pair numbers are in `trading_app_data/void_news/voids_*.json`.

## Step 3 — trades on the real strategy (INTERIM)

The real VIX.1 code was run with only the void check swapped (`find_void`, called once, at
`vix1_void.py:177`).

| pair | today | B | B adds | B removes | BN | to score | scored so far |
|---|---|---|---|---|---|---|---|
| GBP/USD | 590 | 642 | 67 | 15 | 640 | 84 | in progress |
| EUR/USD | 566 | 622 | 80 | 24 | 622 | 106 | in progress |
| GBP/JPY | 566 | 617 | 70 | 19 | 619 | 93 | in progress |

- Counted as one setup per momentum candle, as VIX.1 does live.
- **B adds trades** because fewer moves count as voids, so fewer trades are blocked.
- **It also removes some.** I have not checked why yet. The likely reason is that taking an earlier
  trade changes which later candle VIX.1 trades. It will be checked before the final report.
- Every differing trade is followed on 1-minute prices with VIX.1's own entry, its stop, its move to
  breakeven and a 4R target.

## Why the numbers can be trusted

- **Switching the swap off gives exactly today's trades, on all three pairs** (version "AOFF").
- **Your 10 Nov GBP/USD volume candles (16:00-18:00 your clock)** are voids under today's rule. They
  are not voids under the new definition.
- **The news times line up:** the checks above.
- **The price data is the same checked 7-year data** used for the quiet and thin tests.

## A fault found along the way (not part of this test)

- **The GBP/JPY void size is printed 10 times too small** in VIX.1's refusal message.
  - `vix1_void.py:153` uses 0.1 as a pip for any price over 100, but a GBP/JPY pip is 0.01.
  - It changes no decision, only the number in the message.
- This test was not allowed to change the strategy, so it is logged in `docs/OPEN.md` to fix next.

## Still unknown
- The money result (scoring in progress).
- Why B removes some trades.
