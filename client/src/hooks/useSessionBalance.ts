/**
 * useSessionBalance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that provides the CURRENT RUNNING BALANCE for a trading session,
 * ready to be used by JournalForm for automatic monetary value calculation.
 *
 * WHY THIS HOOK EXISTS:
 *   The JournalForm needs to know the account balance BEFORE the new trade
 *   being logged. This balance is:
 *     startingBalance (from the session) + sum of all previous trades' P&L
 *
 *   Without this hook the trader has to manually track and type their balance
 *   every time. With this hook it is automatic.
 *
 * HOW IT FITS INTO THE FLOW:
 *   1. JournalForm receives a sessionId prop (already done).
 *   2. JournalForm calls useSessionBalance(sessionId).
 *   3. This hook fetches:
 *        GET /api/sessions/:id       → session.startingBalance
 *        GET /api/journal/entries?sessionId=:id  → existing trades' profitLoss
 *   4. It calls computeRunningBalance() from tradeCalculations.ts.
 *   5. It returns { currentBalance, startingBalance, isLoading, error }.
 *   6. JournalForm passes currentBalance into calcAllTradeValues() whenever
 *      riskPercent, riskReward, or outcome fields change, and auto-fills
 *      the profitLoss and accountBalance fields.
 *
 * USAGE IN JournalForm.tsx:
 *   import { useSessionBalance } from '@/hooks/useSessionBalance';
 *
 *   const { currentBalance, isLoading } = useSessionBalance(sessionId);
 *
 *   // When risk% or outcome changes:
 *   useEffect(() => {
 *     if (!currentBalance || !form.riskPercent || !form.riskReward) return;
 *     const values = calcAllTradeValues(
 *       currentBalance,
 *       form.riskPercent,
 *       form.riskReward,
 *       form.outcome as "Win" | "Loss" | "BE"
 *     );
 *     setForm(f => ({ ...f, profitLoss: values.profitLoss, accountBalance: values.accountBalance }));
 *   }, [form.riskPercent, form.riskReward, form.outcome, currentBalance]);
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useQuery } from "@tanstack/react-query";
import { computeRunningBalance } from "@/lib/tradeCalculations";

// ── Return type ───────────────────────────────────────────────────────────────

export interface SessionBalanceResult {
  /** The balance the session was opened with */
  startingBalance: number;
  /**
   * The current running balance after all existing trades in the session.
   * This is what should be used as the base for the next trade's risk calculation.
   * Formula: startingBalance + sum(profitLoss of all existing trades)
   */
  currentBalance: number;
  /** Total P&L realised so far in this session */
  totalPnL: number;
  /** Number of trades already in the session */
  tradeCount: number;
  /** True while either fetch is in flight */
  isLoading: boolean;
  /** Error message if either fetch fails */
  error: string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useSessionBalance
 * ─────────────────
 * Fetches the session's startingBalance and all existing journal entries,
 * then computes and returns the current running balance.
 *
 * @param sessionId  The active session ID (from Journal.tsx's activeSessionId state)
 *                   Pass null/undefined to get a zeroed result with isLoading=false.
 *
 * TODO: implement the hook body:
 *   1. useQuery for GET /api/sessions/:sessionId
 *        queryKey: ["/api/sessions", sessionId]
 *        enabled: !!sessionId
 *
 *   2. useQuery for GET /api/journal/entries?sessionId=:sessionId
 *        queryKey: ["/api/journal/entries", sessionId]
 *        enabled: !!sessionId
 *
 *   3. Extract startingBalance from session response
 *        const startingBalance = parseFloat(session?.startingBalance ?? "0")
 *
 *   4. Extract P&L array from entries response
 *        const pnls = entries.map((e: any) => parseFloat(e.profitLoss ?? "0") || 0)
 *
 *   5. Call computeRunningBalance(startingBalance, pnls)
 *
 *   6. Return the SessionBalanceResult object
 */
export function useSessionBalance(sessionId: string | null | undefined): SessionBalanceResult {
  // TODO: implement — fetch session + entries, compute running balance

  const { data: session, isLoading: sessionLoading } = useQuery<any>({
    queryKey: ["/api/sessions", sessionId],
    queryFn: () => fetch(`/api/sessions/${sessionId}`).then(r => r.json()),
    enabled: !!sessionId,
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<any[]>({
    queryKey: ["/api/journal/entries", sessionId],
    queryFn: () => fetch(`/api/journal/entries?sessionId=${sessionId}`).then(r => r.json()),
    enabled: !!sessionId,
  });

  // TODO: replace these stub values with real computed values:
  // const startingBalance = parseFloat(session?.startingBalance ?? "0") || 0;
  // const pnls = entries.map((e: any) => parseFloat(e.profitLoss ?? "0") || 0);
  // const totalPnL = pnls.reduce((sum, p) => sum + p, 0);
  // const currentBalance = computeRunningBalance(startingBalance, pnls);

  const startingBalance = 0;
  const currentBalance = 0;
  const totalPnL = 0;

  return {
    startingBalance,
    currentBalance,
    totalPnL,
    tradeCount: (entries as any[]).length,
    isLoading: sessionLoading || entriesLoading,
    error: null,
  };
}
