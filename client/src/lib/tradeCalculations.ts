/**
 * tradeCalculations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, stateless calculation functions that convert a session's running
 * balance + a risk percentage into all the monetary values needed by the
 * JournalForm and the Dashboard.
 */

/**
 * calcDollarRisk
 * Converts a risk percentage into the dollar amount being risked on a trade.
 * Formula: dollarRisk = currentBalance × (riskPercent / 100)
 */
export function calcDollarRisk(currentBalance: number, riskPercent: number): number {
  return parseFloat(((currentBalance * riskPercent) / 100).toFixed(2));
}

/**
 * calcPnL
 * Calculates the actual dollar P&L for a trade.
 *   Win:       pnl = +dollarRisk × rrRatio
 *   Loss:      pnl = -dollarRisk
 *   Breakeven: pnl = 0
 */
export function calcPnL(dollarRisk: number, rrRatio: number, outcome: "Win" | "Loss" | "BE"): number {
  if (outcome === "Win")  return parseFloat((dollarRisk * rrRatio).toFixed(2));
  if (outcome === "Loss") return parseFloat((-dollarRisk).toFixed(2));
  return 0; // BE
}

/**
 * deriveAchievedRR
 * The R multiple a trade ACTUALLY reached, from the three prices that define it.
 *
 *   R = |exit − entry| / |entry − stop|
 *
 * WHY THIS EXISTS (2026-08-21). Nothing in the app worked out the achieved R. It could only ever be
 * typed by hand, read off a screenshot, or — the default — SILENTLY COPIED FROM THE PLANNED R:R.
 * So a trade planned to a 3R target that actually ran to 6R recorded 3R of profit. That is the
 * reported "P&L is not accurate above 3R": 3R is not a ceiling, it is where the planned targets sat.
 *
 * Returned UNSIGNED. The sign of the money comes from the outcome, never from this number — a
 * negative R multiplied by a negative outcome is how a loss becomes a profit.
 *
 * Returns null rather than 0 when it cannot be computed, so a caller can tell "no answer" from
 * "an answer of zero" (a break-even). Zero risk returns null: dividing by it is not a big R, it is
 * a missing stop.
 */
export function deriveAchievedRR(
  entry: number | string | null | undefined,
  stop:  number | string | null | undefined,
  exit:  number | string | null | undefined,
): number | null {
  const e = typeof entry === "number" ? entry : parseFloat(String(entry ?? ""));
  const s = typeof stop  === "number" ? stop  : parseFloat(String(stop  ?? ""));
  const x = typeof exit  === "number" ? exit  : parseFloat(String(exit  ?? ""));
  if (![e, s, x].every(n => typeof n === "number" && isFinite(n))) return null;
  const risk = Math.abs(e - s);
  if (risk === 0) return null;
  return parseFloat((Math.abs(x - e) / risk).toFixed(2));
}

/**
 * outcomeFromPrices
 * Which side of the entry the trade closed on — Win, Loss, or BE.
 *
 * `bullish` is needed because the same exit price is a win on a buy and a loss on a sell. BE is a
 * band, not a point: a close within 2% of the risk distance is flat, which stops a one-tick drift
 * being recorded as a win or a loss.
 *
 * Returns null when it cannot be decided, and null must stay null — this feeds the outcome field,
 * and guessing there is what put losses in as wins.
 */
export function outcomeFromPrices(
  entry: number | string | null | undefined,
  stop:  number | string | null | undefined,
  exit:  number | string | null | undefined,
  bullish: boolean,
): "Win" | "Loss" | "BE" | null {
  const e = typeof entry === "number" ? entry : parseFloat(String(entry ?? ""));
  const s = typeof stop  === "number" ? stop  : parseFloat(String(stop  ?? ""));
  const x = typeof exit  === "number" ? exit  : parseFloat(String(exit  ?? ""));
  if (![e, s, x].every(n => typeof n === "number" && isFinite(n))) return null;
  const risk = Math.abs(e - s);
  if (risk === 0) return null;
  const moved = bullish ? x - e : e - x;      // positive = in the trade's favour
  if (Math.abs(moved) <= risk * 0.02) return "BE";
  return moved > 0 ? "Win" : "Loss";
}

/**
 * calcNewBalance
 * Returns the account balance after a trade's P&L has been applied.
 * Formula: newBalance = currentBalance + pnl
 */
export function calcNewBalance(currentBalance: number, pnl: number): number {
  return parseFloat((currentBalance + pnl).toFixed(2));
}

/**
 * calcRiskPercent
 * Reverse calculation: given a dollar risk amount and a balance, returns
 * the equivalent risk percentage.
 * Formula: riskPercent = (dollarRisk / currentBalance) × 100
 */
export function calcRiskPercent(dollarRisk: number, currentBalance: number): number {
  if (currentBalance === 0) return 0;
  return parseFloat(((dollarRisk / currentBalance) * 100).toFixed(2));
}

/**
 * computeRunningBalance
 * Given a session's starting balance and an ordered list of existing trade
 * P&L values, returns the current account balance after all those trades.
 * Formula: currentBalance = startingBalance + sum(profitLoss for each existing trade)
 */
export function computeRunningBalance(startingBalance: number, existingTradePnLs: number[]): number {
  const total = existingTradePnLs.reduce((sum, pnl) => sum + pnl, 0);
  return parseFloat((startingBalance + total).toFixed(2));
}

/**
 * computeMonthlyCurrentBalance
 * Monthly compounding model with profit-withdrawal / deficit carry-over:
 *   • Month ends above startingBalance → profits are WITHDRAWN → next month resets to startingBalance
 *   • Month ends below startingBalance → deficit is CARRIED   → next month starts at startingBalance − deficit
 *
 * Returns the running balance for the CURRENT calendar month:
 *   effectiveMonthStart + Σ(PnLs of trades already logged in this month)
 *
 * This is used as the base for all risk calculations so that risk %
 * is applied to the monthly balance, not the cumulative session balance.
 */
export function computeMonthlyCurrentBalance(
  startingBalance: number,
  entries: Array<{
    profitLoss?: string | number | null;
    entryTime?:  string | null;
    exitTime?:   string | null;
    createdAt?:  string | null;
  }>
): number {
  const sb = startingBalance > 0 ? startingBalance : 0;
  if (sb === 0) return 0;

  const parseDate = (raw: string | null | undefined): Date | null => {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  const toKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const nowKey = toKey(new Date());

  // Group PnLs by month — skip future-dated entries
  const monthMap = new Map<string, number[]>();
  for (const e of entries) {
    const d = parseDate(e.entryTime ?? e.exitTime ?? e.createdAt);
    if (!d) continue;
    const key = toKey(d);
    if (key > nowKey) continue;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(parseFloat(String(e.profitLoss ?? "0")) || 0);
  }

  const sortedKeys = Array.from(monthMap.keys()).sort();

  // Walk every COMPLETED month (before the current calendar month)
  // to arrive at the carried deficit entering this month
  let carriedDeficit = 0;
  for (const key of sortedKeys) {
    if (key >= nowKey) break; // stop at or beyond current month
    const effectiveStart = sb - carriedDeficit;
    const monthPnL = monthMap.get(key)!.reduce((s, p) => s + p, 0);
    const effectiveEnd = effectiveStart + monthPnL;
    // Positive month: profits withdrawn → reset deficit to 0
    // Negative month: carry the shortfall into next month
    carriedDeficit = effectiveEnd < sb ? sb - effectiveEnd : 0;
  }

  // Effective start for this calendar month + trades already logged this month
  const currentEffectiveStart = sb - carriedDeficit;
  const currentMonthPnL = (monthMap.get(nowKey) ?? []).reduce((s, p) => s + p, 0);

  return parseFloat((currentEffectiveStart + currentMonthPnL).toFixed(2));
}

/**
 * calcAllTradeValues
 * Convenience wrapper that computes ALL monetary values for a new trade in
 * one call. Returns strings matching JournalForm field types.
 */
export function calcAllTradeValues(
  currentBalance: number,
  riskPercent: string,
  rrRatio: string,
  outcome: "Win" | "Loss" | "BE"
): { dollarRisk: string; profitLoss: string; accountBalance: string } {
  const risk    = parseFloat(riskPercent) || 0;
  const rr      = parseFloat(rrRatio)     || 0;

  const dollarRisk      = calcDollarRisk(currentBalance, risk);
  const profitLoss      = calcPnL(dollarRisk, rr, outcome);
  const accountBalance  = calcNewBalance(currentBalance, profitLoss);

  return {
    dollarRisk:     dollarRisk.toFixed(2),
    profitLoss:     profitLoss.toFixed(2),
    accountBalance: accountBalance.toFixed(2),
  };
}
