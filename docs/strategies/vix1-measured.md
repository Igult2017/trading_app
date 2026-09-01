# VIX.1 — MEASURED

**Read this before quoting any number about stop size, entry timing or market violence, and before
re-running a measurement that is already here.** Backtests were approved for this work by him on
2026-09-02: *"you can consult ctrader skills, research internet and also run backtest a little before
and after coding."*

---

## ⚠ WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT

Every sweep below is a **GENERIC stop entry on every bar** — a level, a cross, an order one tick
beyond the reach, a stop behind the level. **None of VIX.1's filters are applied**: no 1HR bias, no
regime gate, no momentum-candle grade, no session filter.

**So these measure the MECHANIC, not the strategy.** The generic population wins ~31% at 2R and its
expectancy is roughly zero — that is the noise floor VIX.1's filters exist to beat, not a verdict on
VIX.1. **Never quote a number here as VIX.1's win rate.** That is the exact mistake the
no-backtest-without-approval rule exists to prevent.

What they ARE good for: comparing one mechanical choice against another on identical data — which
stop gap, how far to chase, whether violence predicts anything.

## The data

| instrument | bars | span | source |
|---|---|---|---|
| EUR/USD | 800,000 M1 | 2024-05-22 → 2026-07-17 | pulled 2026-07-19 |
| GBP/USD | 800,000 M1 | 2024-05-22 → 2026-07-17 | pulled 2026-07-19 |
| **XAU/USD** | **120,013 M1** | **2026-05-01 → 2026-09-01** | **pulled 2026-09-02**, `trading_app_data/tools/pull_m1.py` |

Gold was pulled specifically for this work — it previously had **620 bars, one single day**, so every
gold claim before 2026-09-02 was a currency constant wearing a gold label. USD/JPY and GBP/JPY still
have **no M1 history**; nothing here applies to them.

**Gold data validated on arrival**: 0 bars violating low ≤ open/close ≤ high, 0 duplicate timestamps,
0 out-of-order, 0% missing volume, 8 zero-range bars in 120,013. Price range 3942.50–4773.53.

**Trades are only opened where the next 90 bars are contiguous minutes**, so a weekend gap can never
be read as a price move.

---

## 1. THE STOP GAP — 0.5× is the optimum, on all three

The gap is `0.5 × the 1M's recent average range` ([`vix1_entry.py:57`](../../signal_platform/strategies/vix1_entry.py#L57)).
Sweeping it, 2R target:

| gap | EUR/USD expectancy | XAU/USD expectancy | EUR/USD bars to 2R | XAU/USD bars to 2R |
|---|---|---|---|---|
| 0.25× | +0.019 | −0.039 | 7 | 7 |
| **0.50× (current)** | **+0.021** | **−0.035** | **10** | **10** |
| 0.75× | +0.016 | −0.038 | 13 | 14 |
| 1.00× | +0.002 | −0.051 | 17 | 18 |
| 2.00× | −0.078 | −0.143 | 31 | 33 |
| 3.00× | −0.178 | −0.255 | 42 | 42 |

**Both halves of his instinct are confirmed and quantified.** Too wide fills more often but takes
**4× longer to reach 2R** and expectancy collapses. Too tight (0.25×) drops the fill rate to 58.6% on
EUR/USD and 61.4% on gold — you simply miss trades. GBP/USD peaks at 0.50× as well.

**The relative rule travels across instruments; the absolute numbers do not.** Median stop at 0.50×:

| | EUR/USD | XAU/USD |
|---|---|---|
| median 1M range | ~2 pips | **18.7 pips** |
| median stop | 2.0 pips | **29.8 pips** |
| spread | 1.20 pips | 2.4 pips ($0.24) |
| **spread as a share of the stop** | **~60%** | **~8%** |

That last row matters: the spread term in the stop floor is decisive on a currency pair and nearly
irrelevant on gold. A constant expressed in pips would have been wrong by 15×; expressed as a
multiple of the market's own range, it is right on both.

## 2. CHASING PAST THE LINE — entering earliest is worst, on all three

How far the order sits past the line, in units of the 1M range:

| chase | EUR/USD win | GBP/USD win | XAU/USD win |
|---|---|---|---|
| **0–0.5×** | **27.4%** | **26.6%** | **25.0%** |
| 0.5–1.0× | 33.2% | 32.6% | 31.6% |
| 1.0–1.5× | 33.1% | 33.3% | 32.2% |
| 1.5–2.5× | 31.9% | 32.5% | 31.5% |
| 2.5×+ | 30.7% | 28.6% | 31.0% |

**Consistent on all three instruments: the smallest chase is the worst bucket**, and by a wide margin
(fill rate collapses to 29–32% and the win rate is the lowest of any bucket). The stop ends up inside
normal noise.

**This is a standing warning against "enter now, don't wait".** His case is narrower than this bucket
— *price already at the intended level and still travelling*, not *an order resting on the line* —
but any immediate-entry path must be tagged and measured against the wait before it becomes default.

## 3. VIOLENCE — it predicts on GOLD, and on neither currency pair

The measure is the codebase's own whipsaw test, and his own words (2026-07-22): *"so long as that
pullback is not volatility candle and not violent candle typical of market choppiness"* — implemented
as **range ≥ 2.5× the recent average body AND body < 60% of that range**
([`vix1_pullback.py:89`](../../signal_platform/strategies/vix1_pullback.py#L89)), counted over the
last 10 bars.

**CONTROLLED FOR STOP SIZE** — trades restricted to one narrow risk band, so a smaller stop cannot
masquerade as a violence effect. Median risk is constant down each column, which is what makes the
comparison honest:

| whipsaws in last 10 | **XAU/USD 30–45p** | XAU/USD 20–30p | EUR/USD 2.5–4p | GBP/USD 3–5p |
|---|---|---|---|---|
| 0 | **34.3%** | 31.9% | 32.4% | 31.9% |
| 1 | 31.9% | 32.1% | 33.6% | 32.7% |
| 2 | 30.1% | 30.8% | 32.5% | 34.0% |
| 4+ | **29.7%** | 29.4% | 32.5% | 32.6% |
| **effect** | **−4.6 pts, monotonic** | −2.5 pts | **flat** | **flat / reverses** |

n per cell: gold 1,600–4,319; EUR/USD 2,545–12,259; GBP/USD 3,404–14,737.

**So an abort-on-violence gate is justified on gold and NOT on the currency pairs.** About 10% of
EUR/USD bars are whipsaws, so gating there would refuse roughly one entry in ten **at random**.

This is exactly what his own rule predicts — *adding a symbol re-opens every constant tuned for the
old one* — and it is the first measurement in this set that came back positive for anything.

**Also tested and rejected:** volatility expansion (3-bar range ÷ 14-bar range) on the currency pairs
— 1–3 points, non-monotonic on GBP/USD, under 600 samples in the top bucket. Too weak to act on.

## 4. THE SPACE AHEAD — does not support a sizing rule

Room = the highest high of the last 2 hours above the entry, a proxy for the trend extreme.

**Test 1 — does room predict?** EUR/USD: 31.2% → 31.8% across room/risk 0–1× to 5×+. Flat.

**Test 2 — does sizing the stop FROM the room help?** 155,159 identical EUR/USD opportunities, R
counted per OPPORTUNITY so skipping is credited:

| rule | taken | med risk | fill% | win% | R/opportunity |
|---|---|---|---|---|---|
| A — fixed 0.5× | 155,159 | 1.6p | 46.8% | 31.5% | −0.0247 |
| B — skip if the target does not fit | 117,330 | 1.5p | 44.6% | 31.6% | −0.0171 |
| **C — size so 2R lands at the obstacle** | 155,159 | 2.6p | 59.8% | **31.6%** | **−0.0278** |

**Rule C moves the win rate by 0.1 of a point and makes R per opportunity slightly worse.**

**Rule B is a trap.** It looks better only because it takes fewer trades in a population that loses
slightly on average — its per-TRADE expectancy is unchanged (−0.054 → −0.051). On a
positive-expectancy population the same filter would remove profit. **Do not ship it off that number.**

**On gold the room gradient is confounded**: room/risk is high precisely when risk is small (median
risk 18.2p in the 5×+ bucket vs 29.9p in the 0–1× bucket), so the apparent decline is the stop-size
effect reappearing, not a room effect.

## THE FINDING UNDERNEATH ALL OF IT

**Across every experiment on every instrument, the win rate barely moves — 25% to 34% — whatever the
stop size, the chase, the room or (on currencies) the chop. What changes is the FILL RATE and the
TIME TO TARGET.**

For a stop entry, stop size does not buy better odds; it buys how often you get in and how long you
wait. That is why 0.5× is the peak, and why sizing the stop from the space ahead cannot work — it
tunes a lever that is not connected to the outcome.

## WHAT IS STILL NOT MEASURED

* **VIX.1's OWN filtered setups.** Everything here is the generic population. A rule that does
  nothing generically can still work on filtered setups, and vice versa. The replay harness that
  applies the bias, regime and momentum gates is the honest next step and has not been built.
* **USD/JPY and GBP/JPY** — no M1 history exists. Nothing here applies to them.
* **Gold before 2026-05-01** — the pull covers four months.
