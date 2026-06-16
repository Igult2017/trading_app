/**
 * tradeStats.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical journal stat helpers — the SINGLE client-side source of truth for
 * Win Rate, Profit Factor and R Expectancy. Mirrors the server engine
 * (server/python/metrics_calculator.py) exactly so every page shows the same
 * number for the same data:
 *
 *   • Win rate      = wins / (wins + losses) * 100   (break-evens EXCLUDED)
 *   • Profit factor = grossProfit / |grossLoss|, 999 (∞) sentinel when no losses
 *   • R expectancy  = mean( win → RR (default 1R), loss → −1R, break-even → 0R )
 *
 * Classification is outcome-label-first with a P&L-sign fallback when no label.
 */

export const PF_INFINITY = 999;

type AnyTrade = Record<string, any>;

const pnlOf = (t: AnyTrade): number => Number(t.pl ?? t.pnl ?? t.profitLoss ?? 0) || 0;
const rrOfDefault = (t: AnyTrade): number | null => {
  const v = Number(t.rr ?? t.riskReward ?? t.rrRatio ?? t.risk_reward);
  return Number.isFinite(v) && v > 0 ? v : null;
};

export type TradeClass = "win" | "loss" | "be" | "unknown";

/** Outcome label first (win/loss/breakeven), P&L sign as fallback when unlabelled. */
export function classifyOutcome(t: AnyTrade): TradeClass {
  const o = String(t.outcome ?? "").trim().toLowerCase();
  if (["win", "w", "profit"].includes(o)) return "win";
  if (["loss", "l"].includes(o)) return "loss";
  if (["breakeven", "be", "scratch", "break_even"].includes(o)) return "be";
  if (!o) {
    const p = pnlOf(t);
    return p > 0 ? "win" : p < 0 ? "loss" : "be";
  }
  return "unknown";
}

/** Win rate as a percentage (0–100, 1 dp). null when there are no decisive trades. */
export function winRate(trades: AnyTrade[]): number | null {
  let wins = 0, losses = 0;
  for (const t of trades) {
    const c = classifyOutcome(t);
    if (c === "win") wins++;
    else if (c === "loss") losses++;
  }
  const decisive = wins + losses;
  return decisive > 0 ? Math.round((wins / decisive) * 1000) / 10 : null;
}

/** Profit factor (3 dp). Returns PF_INFINITY (999) when there are wins but no losses; null when neither. */
export function profitFactor(trades: AnyTrade[]): number | null {
  let grossProfit = 0, grossLoss = 0;
  for (const t of trades) {
    const c = classifyOutcome(t);
    const p = pnlOf(t);
    if (c === "win") grossProfit += p;
    else if (c === "loss") grossLoss += Math.abs(p);
  }
  if (grossLoss > 0) return Math.round((grossProfit / grossLoss) * 1000) / 1000;
  return grossProfit > 0 ? PF_INFINITY : null;
}

/** R expectancy (R-multiples, 3 dp). null when there are no decided trades. */
export function rExpectancy(
  trades: AnyTrade[],
  rrOf: (t: AnyTrade) => number | null = rrOfDefault,
): number | null {
  const rs: number[] = [];
  for (const t of trades) {
    const c = classifyOutcome(t);
    if (c === "win") { const rr = rrOf(t); rs.push(rr && rr > 0 ? rr : 1); }
    else if (c === "loss") rs.push(-1);
    else if (c === "be") rs.push(0);
  }
  return rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 1000) / 1000 : null;
}

/** Format a profit factor for display, rendering the ∞ sentinel. */
export function formatProfitFactor(pf: number | null | undefined): string {
  if (pf == null) return "—";
  return pf >= PF_INFINITY ? "∞" : pf.toFixed(2);
}
