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
