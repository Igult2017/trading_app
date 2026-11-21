# Barchart daily buy/sell levels — ON HOLD until he answers 8 questions (20 Nov 2026)

**Status: ON HOLD — nothing built.** His order: *"Put that plan on hold and save as unresolved issue. Once i answer all
those questions you will go ahead and execute."* When he answers, write the plan from THIS file (do not re-derive), get
it approved, build, deploy. Tracked as `docs/OPEN.md` G2.

## What he asked for (his words, 20 Nov 2026)
*"We are not going to scrape data and then store, you will scrape the data then find what we need in this guide then
immediately discard that data. You do it once every market open. The data you use is one day ahead. If it is monday you
set barchart to tuesday if it is friday you set to monday. You choose the week of that day for example its week four
of the month and then you choose that month, set to near the money and then side by side. In that data you will be
looking for this then pick the strikes of interest that have either the qualifying qualities for sells or buys. Once
you have done that send the results to telegram channel as potential buy and sell levels of the day. You write the
strike and its actual level in the spot market."*

Context he gave: PIX is still a skeleton; the Barchart scraper was built and switched off (`docs/barchart.md`); the
strike → spot conversion is HELD in memory `reference-option-strike-to-spot` (spot = K × S ÷ F; 6J/6C/6S: S × F ÷ K).

## My understanding (to confirm in the plan)
At +10 min after each market open, open the Barchart volatility-greeks page ONCE (plain browser, no challenge solver —
Barchart's terms forbid robots; a challenge = BLOCKED, never bypassed). Options for the NEXT trading day's expiry, that
week and month, Near the Money, Side-by-Side. Apply the guide, convert each picked strike to spot with F (the option's
own underlying future, from the page) and S (live FIX quote at the same moment), post to the CHANNEL, discard the table.
Only a one-line run record is kept (so a slot cannot run twice).

## The 8 questions (asked 20 Nov 2026, NOT answered yet)
1. **Markets** — A: gold only. B: gold + currency options (which?).
2. **Delta for sells** ("Delta above -0.50") — A (my reading): stronger than -0.50 (-0.50 … -1.00), mirroring calls
   above +0.50, so both sides pick in-the-money strikes (buy levels below price, sell levels above). B: literally -0.49 … 0.
3. **Vega for sells contradicts itself** — section 2 says low Vega for sells; the Sell Setup table and checklist say High.
   A: High. B: Low.
4. **How a strike qualifies** (relative to its neighbours) — A (recommended): among near-the-money strikes on that side,
   IV in the lower half, Gamma / Theta / Vega in the upper half, Delta past ±0.50, the right skew sign (or nearest, per
   his note); ties → closest to spot. B: the single best on every measure (rarely finds anything). C: score and rank.
5. **Levels per side** — A: 1. B: up to 3. C: every qualifier.
6. **How often** — A: all three opens (Asia, London, NY) = 3 posts a day. B: London and New York only (the guide's checklist).
7. **The Asia open** (Monday's session opens Sunday evening) — A (recommended): counts as Monday → Tuesday's options.
   B: counts as Sunday → Monday's options.
8. **PIX** — A: channel only, PIX untouched. B: PIX should use these levels later.

## His guide, verbatim
Options Trading: Volatility, Greeks, IV Skew & Execution Rules

1. Barchart Options Greeks: Volatility and Greeks
Platform: Barchart – Options Greeks: Volatility and Greeks
Expiration & Strike Selection
- 1-Day Expiration (M–T): Select the next trading day's expiration.
  - Monday → Tuesday (same week).
  - Friday → Monday (following week).
- Strikes: These are the predefined price levels at which an option can be exercised.
- Spot Price: Get spot prices from TradingView if Investing.com is not being used.

Understanding Calls and Puts
- Calls = Buys (Bullish).
- Puts = Sells (Bearish).
- Negative Delta = Bearish/Selling pressure.

Volatility (IV) Guidelines
- High IV: Potential breakouts.
- Low IV: Potential reversals.
- Low IV is not 0.00 because 0.00 is an error. It must be low but not 0.00 because IV cannot be 0.00
- Low IV gives clean reversals
- Moderate IV means a fake breakout
- High IV means a potential breakout
- We measure the highness or lowness of a volatility by comparing with the numbers above and below it or the range of
  the numbers we have
- For example, if we have 18.40 ,17.20 ,18.70 the lower IV here is 17.20 and moderate is 18.40 while 18.70 is high IV

Buying and Selling Guidelines
For Buys:
- Look for low IV on the call side.
- Delta should be above +0.50 for maximum directional sensitivity.
For Sells:
- Look for low IV on the put side.

2. The Greeks & Key Metrics
Gamma (Γ) — Measures the rate of change in Delta.
- High Gamma: Dealers may need to hedge more aggressively.
- High Gamma: Can contribute to sharp price movements and potential reversals.
Theta (Θ) — Measures the rate at which an option loses value due to time decay.
- High Theta: Can favor reversals or consolidation.
- Remember that Theta is generally negative for option buyers.
- The more negative the Theta, the faster the option loses value over time.
- Example: Theta of -20 indicates faster time decay than Theta of -5. In other words the bigger the number next to the
  negative sign, the higher the Theta.
Vega (ν) — Measures how sensitive an option's price is to changes in implied volatility.
- Low Vega: Associated with reversal setups.
- Low Vega: Can be considered when evaluating sell opportunities.
- High Vega: Can be considered when evaluating buy opportunities.

3. Implied Volatility (IV) Skew
IV Skew: The difference between call implied volatility and put implied volatility.
- High Call Skew: Indicates greater demand or fear of an upside breakout.
- High Put Skew: Indicates greater demand or fear of a downside breakout.
- Positive Call Skew: Calls are relatively more expensive.
- Negative Put Skew: Puts are relatively more expensive.
- Note: Never look or approve sells of IV skew is positive and never look for buys if IV skew is negative
IV Skew Trading Rules — For Buys: IV Skew should be positive. For Sells: IV Skew should be negative.

4. Strategy Rules: Buying vs. Selling
A. BUY SETUP — IV Low · Delta above +0.50 · Gamma High · Theta High (a negative with a higher number) · Vega High ·
IV Skew Positive. Important Theta Note: a more negative Theta (a theta with a higher negative number) represents greater
time decay. Example: -20 = higher time decay; -5 = lower time decay.
B. SELL SETUP — IV Low · Delta above -0.50 · Gamma High · Theta High · Vega High · IV Skew Negative.

5. Execution Notes
Trading Sessions — use these indicators and strategy rules during:
- London Market Open (10 minutes after market open)
- New York Market Open (10 minutes after market open)
- Asia market open (10 minutes after Sydney market open)
IV Skew Selection — If you cannot find a negative IV Skew: use the closest available IV Skew value. If the available
skew is positive, select the value nearest to your preferred negative skew.

6. Quick Reference: Trading Checklist
BUY CHECKLIST — Low IV · Call-side IV is low · Delta above +0.50 · High Gamma · High (more negative) Theta · High Vega ·
Positive IV Skew · Confirm during London or New York open
SELL CHECKLIST — Low IV · Put-side IV is low · Delta above -0.50 · High Gamma · High Theta · High Vega · Negative IV Skew
· Confirm during London or New York open

Note: In case you don't find negative skew, or positive skew, use the one that is nearest to either for buys or sells.
Also, when identifying qualified setups, pick the ones near the money which mean closest to the current spot price not
far away.

## His answers (21 Nov 2026) — BUILT the same day, see `docs/barchart.md`
1 **B — EUR/USD, GBP/USD and gold.** 2 **Delta past ±0.50 in size** ("-0.56, -0.57, -0.65 are above -0.5"). 3 **Vega LOW
for both buys and sells** ("Low Vega favors reversal for both put and calls … if Vega is high it means the reversal might
not happen"). 4 **Full qualifiers first; then those failing 1 or 2 measures, saying what failed and what it should be;
near the money only (5-minute trading); the sign rules as strict for sells as for buys; Vega must qualify.** 5 **C — every
qualifier.** 6 **All three opens.** 7 **Leave the Sunday Asian open out.** 8 **PIX later** (`docs/strategies/pix.md` item 4).
On blocking: *"disguise the browser and access it as we do with myfxbook"* — Barchart support told him the data may be
accessed for non-commercial use, for his personal use. My two choices (in the plan, not objected to): an Asia open uses
SYDNEY's day; an expiry Barchart does not list → the next listed one, said in the post.
