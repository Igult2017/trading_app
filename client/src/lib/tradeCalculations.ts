/**
 * tradeCalculations.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure, stateless calculation functions that convert a session's running
 * balance + a risk percentage into all the monetary values needed by the
 * JournalForm and the Dashboard.
 *
 * WHY THIS FILE EXISTS:
 *   The JournalForm currently requires the trader to manually type in
 *   profitLoss, accountBalance, etc.  This file provides the math so those
 *   fields can be AUTO-FILLED the moment the trader types a Risk % and
 *   selects an outcome/R:R ratio.
 *
 * HOW IT FITS INTO THE FLOW:
 *   1. Trader creates a session with a startingBalance (e.g. $10,000).
 *   2. useSessionBalance hook (client/src/hooks/useSessionBalance.ts) fetches
 *      the session and all existing trades, then calls computeRunningBalance()
 *      to get the current balance after previous trades.
 *   3. JournalForm receives the currentBalance from that hook.
 *   4. When the trader types riskPercent = "1" into the Risk % field, the
 *      form calls calcDollarRisk() to show the dollar amount at risk.
 *   5. When the trader picks an outcome (Win/Loss/BE) and a R:R ratio, the
 *      form calls calcPnL() to auto-fill the P&L Amount field.
 *   6. calcNewBalance() gives the updated account balance after the trade,
 *      which auto-fills the Account Balance field.
 *   7. The completed form values are saved to the DB with real monetary data,
 *      so metrics_calculator.py can compute accurate equity curves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */


/**
 * calcDollarRisk
 * ──────────────
 * Converts a risk percentage into the dollar amount being risked on a trade.
 *
 * Formula:
 *   dollarRisk = currentBalance × (riskPercent / 100)
 *
 * Example:
 *   currentBalance = 10000, riskPercent = 1  →  dollarRisk = 100
 *   currentBalance = 9800,  riskPercent = 0.5 →  dollarRisk = 49
 *
 * @param currentBalance  The account balance BEFORE this trade (not starting balance)
 * @param riskPercent     e.g. 1.0 means 1%
 * @returns               Dollar amount at risk (always positive)
 *
 * TODO: implement
 *   return parseFloat(((currentBalance * riskPercent) / 100).toFixed(2));
 */
export function calcDollarRisk(currentBalance: number, riskPercent: number): number {
  // TODO: implement
  return 0;
}


/**
 * calcPnL
 * ───────
 * Calculates the actual dollar P&L for a trade given the dollar risk,
 * the risk:reward ratio, and the trade outcome.
 *
 * Formula:
 *   Win:       pnl = +dollarRisk × rrRatio
 *   Loss:      pnl = -dollarRisk
 *   Breakeven: pnl = 0
 *
 * Example:
 *   dollarRisk = 100, rrRatio = 2, outcome = "Win"  →  pnl = +200
 *   dollarRisk = 100, rrRatio = 2, outcome = "Loss" →  pnl = -100
 *   dollarRisk = 100, rrRatio = 2, outcome = "BE"   →  pnl =    0
 *
 * @param dollarRisk  Dollar amount risked (output of calcDollarRisk)
 * @param rrRatio     Risk:Reward ratio as a number (e.g. 2 means 1:2)
 * @param outcome     "Win" | "Loss" | "BE"
 * @returns           Signed dollar P&L
 *
 * TODO: implement the three outcome branches
 */
export function calcPnL(dollarRisk: number, rrRatio: number, outcome: "Win" | "Loss" | "BE"): number {
  // TODO: implement
  return 0;
}


/**
 * calcNewBalance
 * ──────────────
 * Returns the account balance after a trade's P&L has been applied.
 *
 * Formula:
 *   newBalance = currentBalance + pnl
 *
 * @param currentBalance  Balance before the trade
 * @param pnl             Signed P&L (from calcPnL)
 * @returns               Balance after the trade, rounded to 2 dp
 *
 * TODO: implement
 *   return parseFloat((currentBalance + pnl).toFixed(2));
 */
export function calcNewBalance(currentBalance: number, pnl: number): number {
  // TODO: implement
  return 0;
}


/**
 * calcRiskPercent
 * ───────────────
 * Reverse calculation: given a dollar risk amount and a balance, returns
 * the equivalent risk percentage. Useful if the trader types a dollar amount
 * and wants to see what % that represents.
 *
 * Formula:
 *   riskPercent = (dollarRisk / currentBalance) × 100
 *
 * @param dollarRisk      Dollar amount at risk
 * @param currentBalance  Account balance before the trade
 * @returns               Risk as a percentage (e.g. 1.0 means 1%), rounded to 2 dp
 *
 * TODO: implement — guard against division by zero (return 0 if balance is 0)
 */
export function calcRiskPercent(dollarRisk: number, currentBalance: number): number {
  // TODO: implement
  return 0;
}


/**
 * computeRunningBalance
 * ──────────────────────
 * Given a session's starting balance and an ordered list of existing trade
 * P&L values, returns the current account balance after all those trades.
 *
 * This is the function that answers "what is my balance RIGHT NOW before I
 * log this next trade?"
 *
 * Formula:
 *   currentBalance = startingBalance + sum(profitLoss for each existing trade)
 *
 * @param startingBalance   The balance the session was opened with
 * @param existingTradePnLs Array of profitLoss values from all previous trades
 *                          in the session (in chronological order)
 * @returns                 Current running balance, rounded to 2 dp
 *
 * TODO: implement
 *   const total = existingTradePnLs.reduce((sum, pnl) => sum + pnl, 0);
 *   return parseFloat((startingBalance + total).toFixed(2));
 */
export function computeRunningBalance(startingBalance: number, existingTradePnLs: number[]): number {
  // TODO: implement
  return startingBalance;
}


/**
 * calcAllTradeValues
 * ──────────────────
 * Convenience wrapper that computes ALL monetary values for a new trade in
 * one call. Returns an object ready to be spread into the JournalForm state.
 *
 * Usage in JournalForm:
 *   const values = calcAllTradeValues(currentBalance, riskPercent, rrRatio, outcome);
 *   setForm(f => ({ ...f, ...values }));
 *
 * @param currentBalance  Running balance before this trade (from computeRunningBalance)
 * @param riskPercent     e.g. "1.0" (from form input — will be parsed to float)
 * @param rrRatio         e.g. "2.0" (from form input — will be parsed to float)
 * @param outcome         "Win" | "Loss" | "BE"
 * @returns               { dollarRisk, profitLoss, accountBalance } as strings
 *                        (matching JournalForm field types which are all strings)
 *
 * TODO: implement by calling calcDollarRisk, calcPnL, calcNewBalance in sequence
 */
export function calcAllTradeValues(
  currentBalance: number,
  riskPercent: string,
  rrRatio: string,
  outcome: "Win" | "Loss" | "BE"
): { dollarRisk: string; profitLoss: string; accountBalance: string } {
  // TODO: implement
  return { dollarRisk: "0.00", profitLoss: "0.00", accountBalance: "0.00" };
}
