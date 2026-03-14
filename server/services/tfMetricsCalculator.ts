/**
 * tfMetricsCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin Node.js bridge between the Express route layer and the Python timeframe
 * metrics engine (server/python/tf_metrics_calculator.py).
 *
 * RESPONSIBILITIES (and ONLY these):
 *   1. Accept raw trade rows + optional startingBalance from the route handler
 *   2. Serialise the payload and pipe it to the Python process via stdin
 *   3. Collect stdout, parse the JSON result, and return it to the caller
 *   4. Handle all failure modes and resolve — never reject — with TFMetricsResult
 *
 * All timeframe-specific metrics logic lives exclusively in:
 *   server/python/tf_metrics_calculator.py
 * Do NOT add calculation logic here.
 *
 * USAGE:
 *   import { computeTFMetrics } from './services/tfMetricsCalculator';
 *   const result = await computeTFMetrics(trades, session.startingBalance);
 *
 * ROUTE THAT CALLS THIS:
 *   GET /api/tf-metrics/compute?sessionId=X
 *   Defined in server/routes.ts — fetches session trades from storage, then
 *   calls computeTFMetrics() and returns the result as JSON.
 *
 * The TFMetricsPanel component (client/src/components/TFMetricsPanel.tsx)
 * currently uses hardcoded mock data. Once this service and the route are wired
 * in, the panel should be updated to call GET /api/tf-metrics/compute?sessionId=X
 * via useQuery and render real data from the response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "tf_metrics",
  "main.py"
);

const TIMEOUT_MS = 30_000;
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TFMetricsResult {
  success: boolean;
  timeframes?: string[];
  byTimeframe?: Record<string, {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    avgRR: number;
    profitFactor: number;
    netPnl: number;
    avgWin: number;
    avgLoss: number;
    expectancy: number;
    avgEntryQuality: number;
    equityCurve: number[];
    bestInstrument: string;
    worstInstrument: string;
    byInstrument: Record<string, any>;
    byDirection: Record<string, any>;
    bySession: Record<string, any>;
  }>;
  summary?: {
    bestTimeframe: string;
    worstTimeframe: string;
    mostTradedTimeframe: string;
    htfBiasAlignmentRate: number;
    mtfConfluenceWinBoost: number;
  };
  error?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * computeTFMetrics
 * ────────────────
 * Spawns the Python TF metrics engine, feeds it the trade array via stdin,
 * and returns the parsed result. Always resolves — never rejects.
 *
 * @param trades           Raw journal entry rows from the database
 * @param startingBalance  Optional account starting balance for equity curve per TF
 */
export async function computeTFMetrics(
  trades: any[],
  startingBalance?: number
): Promise<TFMetricsResult> {
  return new Promise((resolve) => {
    if (!Array.isArray(trades)) {
      resolve({ success: false, error: "trades must be an array" });
      return;
    }

    const payload = { trades, ...(startingBalance !== undefined && { startingBalance }) };

    const child: ChildProcess = spawn(PYTHON_BIN, [PYTHON_SCRIPT_PATH], {
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      resolve({ success: false, error: "TF metrics computation timed out (30s)" });
    }, TIMEOUT_MS);

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.error("[TFMetricsCalculator] Python stderr:", stderr.slice(0, 500));
      }
      if (stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()) as TFMetricsResult);
          return;
        } catch {
          console.error("[TFMetricsCalculator] JSON parse error:", stdout.slice(0, 300));
        }
      }
      resolve({
        success: false,
        error: code !== 0 ? `Python exited with code ${code}: ${stderr}` : "No output from TF metrics engine",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[TFMetricsCalculator] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });
  });
}
