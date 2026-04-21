/**
 * useSessionBalance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * React hook that provides the CURRENT RUNNING BALANCE for a trading session,
 * ready to be used by JournalForm for automatic monetary value calculation.
 *
 * USAGE IN JournalForm.tsx:
 *   const { currentBalance, isLoading } = useSessionBalance(sessionId);
 *
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
 */

import { useQuery } from "@tanstack/react-query";
import { computeRunningBalance } from "@/lib/tradeCalculations";
import { authFetch } from "@/lib/queryClient";

// ── Return type ───────────────────────────────────────────────────────────────

export interface SessionBalanceResult {
  /** The balance the session was opened with */
  startingBalance: number;
  /**
   * The current running balance after all existing trades in the session.
   * Use this as the base for the next trade's risk calculation.
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

export function useSessionBalance(sessionId: string | null | undefined): SessionBalanceResult {
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
  } = useQuery<any>({
    queryKey: ["/api/sessions", sessionId],
    queryFn: () => authFetch(`/api/sessions/${sessionId}`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch session: ${r.status}`);
      return r.json();
    }),
    enabled: !!sessionId,
  });

  const {
    data: entries = [],
    isLoading: entriesLoading,
    error: entriesError,
  } = useQuery<any[]>({
    queryKey: ["/api/journal/entries", sessionId],
    queryFn: () => authFetch(`/api/journal/entries?sessionId=${sessionId}`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch entries: ${r.status}`);
      return r.json();
    }),
    enabled: !!sessionId,
  });

  // Guard: if no sessionId, return zeroed result immediately
  if (!sessionId) {
    return {
      startingBalance: 0,
      currentBalance: 0,
      totalPnL: 0,
      tradeCount: 0,
      isLoading: false,
      error: null,
    };
  }

  const startingBalance = parseFloat(session?.startingBalance ?? "0") || 0;
  const pnls = (entries as any[]).map((e: any) => parseFloat(e.profitLoss ?? "0") || 0);
  const totalPnL = pnls.reduce((sum, p) => sum + p, 0);
  const currentBalance = computeRunningBalance(startingBalance, pnls);

  const error = sessionError
    ? (sessionError as Error).message
    : entriesError
    ? (entriesError as Error).message
    : null;

  return {
    startingBalance,
    currentBalance,
    totalPnL,
    tradeCount: (entries as any[]).length,
    isLoading: sessionLoading || entriesLoading,
    error,
  };
}
