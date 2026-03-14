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
