/**
 * balanceTracker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side service that computes the current running account balance for a
 * trading session and derives monetary trade values from a risk percentage.
 *
 * ROUTE TO ADD IN server/routes.ts:
 *   GET /api/sessions/:id/balance  →  getCurrentBalance(req.params.id)
 *
 * WIRE-UP enrichTradeWithBalance in POST /api/journal/entries:
 *   const enriched = await enrichTradeWithBalance(sessionId, req.body);
 *   const entry = await storage.createJournalEntry(enriched);
 */

import { storage } from "../storage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BalanceSummary {
  startingBalance: number;
  currentBalance:  number;
  totalPnL:        number;
  tradeCount:      number;
}

export interface TradeMonetaryValues {
  dollarRisk:  number;
  profitLoss:  number;
  newBalance:  number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Round to 2 decimal places */
function r2(n: number): number {
  return parseFloat(n.toFixed(2));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * getCurrentBalance
 * ─────────────────
 * Fetches the session's startingBalance and all existing journal entries,
 * then computes the running balance.
 *
 * Powers: GET /api/sessions/:id/balance
 */
export async function getCurrentBalance(sessionId: string): Promise<BalanceSummary> {
  const session = await storage.getSessionById(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const entries = await storage.getJournalEntries(undefined, sessionId);

  const startingBalance = parseFloat(session.startingBalance) || 0;
  const pnls            = entries.map((e: any) => parseFloat(e.profitLoss ?? "0") || 0);
  const totalPnL        = pnls.reduce((sum: number, p: number) => sum + p, 0);
  const currentBalance  = r2(startingBalance + totalPnL);

  return {
    startingBalance: r2(startingBalance),
    currentBalance,
    totalPnL:        r2(totalPnL),
    tradeCount:      entries.length,
  };
}


/**
 * computeTradeMonetaryValues
 * ──────────────────────────
 * Server-side mirror of calcAllTradeValues() from tradeCalculations.ts.
 * Same math, used for server-side verification/completion when saving a
 * journal entry.
 */
export async function computeTradeMonetaryValues(
  sessionId: string,
  riskPercent: number,
  rrRatio: number,
  outcome: string
): Promise<TradeMonetaryValues> {
  const { currentBalance } = await getCurrentBalance(sessionId);

  const dollarRisk = r2((currentBalance * riskPercent) / 100);

  let profitLoss: number;
  const outcomeNorm = outcome.toLowerCase();

  if (outcomeNorm === "win") {
    profitLoss = r2(dollarRisk * rrRatio);
  } else if (outcomeNorm === "loss") {
    profitLoss = r2(-dollarRisk);
  } else {
    // BE / Breakeven
    profitLoss = 0;
  }

  const newBalance = r2(currentBalance + profitLoss);

  return { dollarRisk, profitLoss, newBalance };
}


/**
 * enrichTradeWithBalance
 * ──────────────────────
 * Called in POST /api/journal/entries BEFORE saving to DB.
 * If profitLoss or accountBalance are missing/zero, computes them from
 * riskPercent + outcome so the DB always has correct monetary data.
 *
 * This is the safety net — even if the frontend didn't auto-fill the values,
 * the server ensures accuracy.
 */
export async function enrichTradeWithBalance(
  sessionId: string,
  tradeData: Record<string, any>
): Promise<Record<string, any>> {
  // If profitLoss is already a meaningful non-zero value, trust it
  const existingPnL = parseFloat(tradeData.profitLoss ?? "0");
  if (existingPnL !== 0 && !isNaN(existingPnL)) {
    return tradeData;
  }

  // Need riskPercent to compute — if missing, can't enrich
  const riskPercent = parseFloat(tradeData.riskPercent ?? "0");
  if (!riskPercent || isNaN(riskPercent)) {
    return tradeData;
  }

  // outcome may be "Win", "Loss", "BE", or "Breakeven"
  const outcome  = tradeData.outcome ?? "BE";
  const rrRatio  = parseFloat(tradeData.riskReward ?? "1") || 1;

  const computed = await computeTradeMonetaryValues(sessionId, riskPercent, rrRatio, outcome);

  return {
    ...tradeData,
    profitLoss:     String(computed.profitLoss),
    accountBalance: String(computed.newBalance),
  };
}
