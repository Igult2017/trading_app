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


## 5. THE ENTRY RULE — his hybrid beats today's on all three

**Does a pullback always appear?** His claim, tested:

| a pullback candle appears within… | EUR/USD (13,188 crosses) | XAU/USD (1,916) |
|---|---|---|
| **1 candle** (what the old code waited for) | **45.7%** | **39.4%** |
| 3 candles | 82.8% | 78.7% |
| 5 candles | 94.6% | 92.3% |
| **20 candles** | **100.0%** | **100.0%** |
| never | **0.0%** | **0.0%** |

**It is always there.** Price also comes back and physically touches the line within 20 candles 79%
of the time on EUR/USD and 82% on gold.

**Head to head**, R per opportunity, floor and ceiling applied, identical setups:

| rule | EUR/USD | GBP/USD | XAU/USD |
|---|---|---|---|
| A — wait 1 candle, then chase (old) | −0.0032 | −0.0194 | +0.0000 |
| B — return-to-line only | −0.0017 | −0.0119 | −0.0093 |
| **D — pullback 1-3, else return, else skip (his)** | **+0.0026** | **−0.0094** | **+0.0044** |

**Not the "trades less" artefact:** B skips 21% and is WORSE than D, which skips 9%. The ordering is
not explained by trade count. Across three time periods D wins **6 of 9** (GBP/USD 3/3, EUR/USD 2/3,
gold 1/3 — gold swings ±0.08 per period on the OLD rule too, so it cannot separate them).

**A fourth rule was tested and REJECTED:** "wait up to 5 candles for a pullback" was the *worst* of
all (EUR/USD −0.0101), because it anchors the entry on the furthest point reached across those five
candles — it chases hardest and produces the biggest stops.

## 6. THE FRACTAL ROUTE'S STALENESS

When the 1M runs against the bias and its fractal later breaks, the old code reused the FIRST cross
since the momentum candle:

| | EUR/USD | XAU/USD |
|---|---|---|
| fractal-break entries | 7,263 | 1,085 |
| age of the cross reused | median **24 candles**, p90 48 | median 23, p90 49 |
| that level's distance from price now | median **3.7p**, p90 10.5p | median **53p**, p90 131p |

Against median stops of ~3.0p and ~42p, the order rested about **1R** from the market and **3R** at
the p90.

## THE FINDING UNDERNEATH ALL OF IT

**Across every experiment on every instrument, the win rate barely moves — 25% to 34% — whatever the
stop size, the chase, the room or (on currencies) the chop. What changes is the FILL RATE and the
TIME TO TARGET.**

For a stop entry, stop size does not buy better odds; it buys how often you get in and how long you
wait. That is why 0.5× is the peak, and why sizing the stop from the space ahead cannot work — it
tunes a lever that is not connected to the outcome.


---

# 7. THE REAL CODE, ONE YEAR, REAL BARS

**This section is different from every one above it.** Sections 1-6 measure the MECHANIC on generic
entries. This drives the **SHIPPED FUNCTIONS** — `vix1_bias.detect_bias`, `vix1_entry.m1_signals`
and `monitor.rungs` — over one year of real EUR/USD bars, at his instruction (2026-09-02: *"Run in
real 1M data... one year is enough"*). Harness: `trading_app_data/tools/vix1_replay_year.py`.

**Window 2025-07-17 to 2026-07-17, EUR/USD.**

**WHAT IT STILL CANNOT REPRODUCE, so no number here is a live P&L:** the spread is a constant 1.2p
(live it is read per scan); there is no historical bid/ask, so the alignment read and the
"already through the market" refusal both fall back to the newest closed close; and the news, session
and correlation gates are not applied.

## What the year produced

| | |
|---|---|
| setups found by the real bias | **152** |
| entries produced by the real entry | **123** (80.9% of setups) |
| entry flavour | pullback 90 - fractal_pullback 23 - **returned 7** - fractal_returned 3 |
| never filled (stop side went first) | **63** - by design: *"if it goes the pullback direction without filling us we are safe too"* |
| filled | 60 |
| stop size | median **4.2 pips**, p90 7.2p |

**Only 10 of 123 entries (8%) used the new return-to-line path** - the rest found a pullback inside
1-3 candles, which matches the 82.8% measured in section 5.

## THE LADDER - his change, A/B on identical fills

Same entries, same stops, same bars; only what happens after the fill differs.

| ladder | total R | losing trades |
|---|---|---|
| **his: 0.4R breakeven + locks at 2.0R / 2.5R** | **-9.0** | **21** |
| old: 1R breakeven + locks at 2/3/4R | -16.0 | 33 |
| no management at all | -14.0 | 50 |

**His change is worth +7R over the year and cuts losing trades from 33 to 21.**

**And it exposes something about the OLD ladder: it was WORSE THAN DOING NOTHING** (-16.0 against
-14.0). Breakeven at 1R scratched trades that would have recovered without buying enough protection
to pay for it. His 0.4R does not have that problem, because 0.4R sits just under where trades
actually turn.

## HOW FAR TRADES ACTUALLY GO - and why 0.4R is well chosen

Peak R reached, 58 filled trades: median **0.56R**, p75 0.98R, p90 2.19R, max 4.33R.

| reached | of 58 |
|---|---|
| **0.4R** | **39 (67%)** |
| 1.0R | 14 (24%) |
| 2.0R | 6 (10%) |
| 2.5R | 4 (7%) |
| **4.0R** | **1 (2%)** |

**His 0.4R sits just below the median peak of 0.56R.** That is why it converts so many losses into
scratches - two thirds of filled trades reach it. It was chosen by instinct and it lands where the
data says it should.

## THREE ISSUES THIS FOUND

**1. The 4R take profit is very nearly decorative - 1 trade in 58 reached it all year.** The ladder
performs essentially every exit. Lowering the target does NOT fix it, and that is the surprising
part: total R is -9.0 at a 4R target, -9.0 at 2.5R, -9.0 at 2.0R, and -8.0 at 3R. The locks already
capture those moves, so the target has almost nothing left to do. **The card still advertises 4R.**

**2. The upper rungs are nearly inert** - 2.0R fires on 10% of trades and 2.5R on 7%, against 0.4R
at 67%. Whether the locks should sit lower is HIS decision, not one to make from a single instrument.

**3. The whole year is net negative - -9.0R over 123 orders.** With the caveats above, and on one
instrument, one year, 21 losses against 6 wins. **This is not a verdict on VIX.1** - the news,
session and correlation gates that live trading applies are absent here, and so is the real spread.

## A FLAW IN THE HARNESS, FOUND AND FIXED

The first run printed *"reached 4.0R: 0 of 58"* while the outcomes line on the same page said one
trade hit the 4R target. `peak` was updated AFTER the target check, so breaking out on a win left it
holding the previous bar's value. One trade here - but a report whose two numbers contradict each
other is not publishable, and the same bug would have understated every winner's peak.

## WHAT IS STILL NOT MEASURED

* **VIX.1's OWN filtered setups.** Everything here is the generic population. A rule that does
  nothing generically can still work on filtered setups, and vice versa. The replay harness that
  applies the bias, regime and momentum gates is the honest next step and has not been built.
* **USD/JPY and GBP/JPY** — no M1 history exists. Nothing here applies to them.
* **Gold before 2026-05-01** — the pull covers four months.

---

## THE APPROVED BACKTEST — 2026-09-14, EUR/USD, his parameters only

He approved it in one word after being told what it would measure. **Every parameter is read from
the live code**: the real gate chain (`vix1_bias.detect_bias`), the real 1-minute stop entry and stop
rule (`vix1_entry.m1_signals`), the 4R target (`vix1.py` `_TP_R`, his instruction 2026-08-21) and his
ladder (`monitor/rungs`: breakeven 0.4R, lock +1R at 1.5R, then trail 0.1R behind).

**Window: 22 May 2024 – 17 Jul 2026 (26 months), EUR/USD only** — that is the extent of the minute
bars on this machine. Inside any one minute the WORSE ordering is assumed (stop before target), a
flat 0.9-pip spread is used, and slippage is not modelled. So these are pessimistic figures.

### THE RESULT

    426 orders placed
    220 filled, 206 never filled (48%)   — an unfilled stop order is CANCELLED, never a loss
    156 of 220 won (71%)
    total +19.9R, average +0.090R per filled trade, median +0.20R

    full stop (-1R)      64   29%
    small win (<1R)     127   58%
    1R to 4R             28   13%
    reached the 4R target 1    0%

**THE BIGGEST FINDING HAS NOTHING TO DO WITH CHOP: the ladder converts almost every winner into a
small one.** 58% of filled trades end under +1R and **exactly one trade in 220 ever reached 4R**,
while every loser pays the full -1R. Winners average +0.54R against losers at -1.00R. The strategy
survives on a 71% strike rate, not on the size of its wins.

### HIS CIRCLED MARKETS — NOT ENOUGH TRADES TO JUDGE

    02 Mar     2 orders, 1 filled, 1 won, +0.3R        10 Dec    4 orders, 2 filled, 1 won, -0.8R
    16 Dec     3 orders, 0 filled                      04 Dec a  1 order,  1 filled, 1 won, +0.3R
    04 Dec b   1 order,  0 filled                      TOTAL    11 orders, 4 filled, 3 won, -0.2R
    Guarantee  1 order,  0 filled                      elsewhere 216 filled, +20.0R, +0.09R avg

**FOUR TRADES. Nothing can be concluded from four trades** — -0.05R against +0.09R is noise at that
size. It does show VIX.1 was already quiet in those markets (11 orders across ~200 hours), which is
worth knowing on its own.

### DO ANY CHOP READINGS SEPARATE WINNERS FROM LOSERS? — scored on money, 220 trades

    rule                          removes            keeps      average kept vs +0.090R overall
    big-next-to-small >= 15       96 (44%)  +3.3R    124  +16.6R    +0.134R   best
    ended > 35 from a band edge   48 (22%)  -0.2R    172  +20.1R    +0.117R
    ended > 25 from a band edge   73 (33%)  +2.7R    147  +17.2R    +0.117R
    came back > 10 (4-day band)   39 (18%)  +3.6R    181  +16.3R    +0.090R   no change
    body share < 48%              65 (30%)  +9.1R    155  +10.8R    +0.070R   worse
    came back > 8                 64 (29%)  +9.8R    156  +10.1R    +0.065R   worse
    fewer than 3 of 3 signs      105 (48%) +14.9R    115   +5.0R    +0.044R   much worse
    fewer than 2 of 3 signs       40 (18%) +15.5R    180   +4.3R    +0.024R   WORST

**NOTHING HERE IS AN EDGE, AND THE BEST-LOOKING ROW MUST NOT BE SHIPPED.** The spread of R per trade
is about 0.7, so over ~124 trades one standard error is ±0.06R — the whole "improvement" from
+0.090R to +0.134R is smaller than that. **Eight cuts were tried and the best picked afterwards**,
which is precisely how a fitted number is manufactured. `docs/OPEN.md` D42 stays open.

**THE ONE CLEAR RESULT IS NEGATIVE AND IT IS ABOUT HIS OWN RULE.** Refusing markets showing fewer
than 2 of his 3 signs (`vix1_chop`) removes 40 trades worth **+15.5R out of a +19.9R total** — it
would have deleted most of the profit. That is far larger than any of the positive effects and it
confirms the module must stay unwired.

### "IS IT WORKING?" — the direct answer, 2026-09-14

**PROFITABLE BUT NOT PROVEN.** +19.9R over 26 months, 220 filled trades, EUR/USD.

    average +0.0904R per trade, spread 0.936R, one standard error 0.0631R
    -> the average is 1.4 standard errors above zero
    -> roughly a 7.6% chance of being luck if there were no edge at all

**IT LIVES ON TWO QUARTERS.** 2025 Q1 (+10.3R) and 2025 Q3 (+11.2R) are +21.5R of the +19.9R total.
Strip those two and the other seven quarters are slightly NEGATIVE.

    2024 Q2  +6.5R   2024 Q3  -1.5R   2024 Q4  +2.0R   2025 Q1 +10.3R   2025 Q2  -3.8R
    2025 Q3 +11.2R   2025 Q4  -2.7R   2026 Q1  +2.0R   2026 Q2  -5.4R   2026 Q3  +1.4R

**THE MOST RECENT FULL QUARTER IS ITS WORST: 2026 Q2, -5.4R on a 48% strike rate** — the only
quarter under 50%. Biggest fall from a high point across the whole run: **-9.9R**.

**THE MARGIN IS THIN BY CONSTRUCTION.** Winners average +0.54R, losers -1.00R, so it needs **65%**
just to break even and it achieves 71%. Six points of strike rate is the whole edge.

### ⚠ THE LADDER IS THE EDGE — the same replay with it switched off

    WITH his ladder      220 filled   +19.9R   won 71%   winners +0.54R   worst fall  -9.9R
    WITHOUT the ladder   220 filled   -20.0R   won 18%   winners +4.00R   worst fall -60.0R

**The identical setups, taken to 4R against the original stop, LOSE 20R.** The 4R target is reached
40 times in 220 (18%), and 18% at 4R against 82% at -1R is -20R almost exactly.

**SO THE SETUP SELECTION HAS NO DEMONSTRABLE EDGE. THE TRADE MANAGEMENT IS THE WHOLE RESULT** —
breakeven at 0.4R and the +1R lock at 1.5R. VIX.1 makes money by cutting losses quickly, not by
choosing better moments to enter.

**THIS CORRECTS WHAT I WROTE AN HOUR EARLIER.** I reported "one trade in 220 reached 4R" as if the
ladder were clipping winners harmfully. **The opposite is true** — without the ladder the strategy
is a 20R loser. The clipping is what makes it work.

### HIS QUESTION, 2026-09-14: "does run → pullback → entry from the beginning of the trend remove the need for chop and range logic?"

**HALF OF IT IS ALREADY LIVE.** The run-then-pullback rule is `vix1_tradeable.trend_reproven`,
enforced at `vix1_bias.py:405`, and it ran on every trade in the backtest. **The new half — take
only the FIRST entry after the trend begins — does not exist anywhere in VIX.1** and was measured
here for the first time.

**IT IS THE WORST GROUP, NOT THE BEST:**

    entry #1 of the trend    72 trades   + 1.4R   avg +0.019R   won 67%   full stops 33%
    entry #2                 40 trades   + 1.1R   avg +0.027R   won 72%   full stops 28%
    entry #3                 30 trades   + 7.6R   avg +0.254R   won 70%   full stops 30%
    entry #4 or later        78 trades   + 9.8R   avg +0.126R   won 74%   full stops 26%

    FIRST ONLY (his rule)    72 trades   + 1.4R   avg +0.019R   won 67%   full stops 33%
    everything else         148 trades   +18.5R   avg +0.125R   won 73%   full stops 27%
    all of them (today)     220 trades   +19.9R   avg +0.090R   won 71%   full stops 29%

**Taking only the first entry keeps +1.4R of the +19.9R — it would throw away 93% of the result**,
and it carries the HIGHEST rate of full -1R losses of any group (33%).

**AND TREND AGE POINTS THE SAME WAY — older is not worse:**

    under 12h   27 trades  +2.9R  22% full stops      2-4 days    40 trades  +5.5R  32% full stops
    12-24h      26 trades  +3.2R  35% full stops      over 4 days 77 trades  +8.4R  23% full stops
    1-2 days    30 trades  +0.7R  30% full stops

The oldest trends give the most R and among the fewest full losses. There is no "get in early" edge.

**THE LIKELY REASON, and it is already on record:** the 1HR trend reverses about 90 times a year
with a median run of 1.6 days (`project-vix1-trend-churn`). So "the first entry of a new trend" is
very often the first entry of a trend that is not real yet. A trend that has already survived two or
three pullbacks has proved something the fresh one has not.

**SO IT WOULD NOT REPLACE A CHOP RULE — IT WOULD POINT THE WRONG WAY.** A choppy market is where the
trend flips most often, so it manufactures "first entries". His rule would concentrate trading into
exactly the markets he wants excluded.

**WHAT IS STILL TRUE:** run-then-pullback is live and his five circled markets still produced 11
orders and 4 fills, so it does NOT fully exclude them — but four trades cannot say whether that
costs anything. D42 stays open.
