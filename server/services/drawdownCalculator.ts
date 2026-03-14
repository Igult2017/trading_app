/**
 * drawdownCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin Node.js bridge between the Express route layer and the Python drawdown
 * analysis engine (server/python/drawdown_calculator.py).
 *
 * RESPONSIBILITIES (and ONLY these):
 *   1. Accept raw trade rows + optional startingBalance from the route handler
 *   2. Serialise the payload to JSON and pipe it to the Python process via stdin
 *   3. Collect stdout, parse the JSON result, and return it to the caller
 *   4. Handle every failure mode (spawn error, timeout, bad JSON, non-zero exit)
 *      and resolve — never reject — with a typed DrawdownResult
 *
 * All drawdown computation logic lives exclusively in:
 *   server/python/drawdown_calculator.py       (orchestrator)
 *   server/python/drawdown_core.py             (peak/trough/recovery)
 *   server/python/drawdown_streaks.py          (consecutive loss streaks)
 *   server/python/drawdown_heatmap.py          (pair×strategy heatmap)
 *   server/python/drawdown_distribution.py     (size distribution histogram)
 *   server/python/drawdown_frequency.py        (frequency by attribute)
 *   server/python/drawdown_metrics.py          (KPI summary)
 *   server/python/drawdown_structural.py       (structural failure analysis)
 *   server/python/drawdown_sessions.py         (per-session comparison)
 * Do NOT add calculation logic here.
 *
 * USAGE:
 *   import { computeDrawdown } from './services/drawdownCalculator';
 *   const result = await computeDrawdown(trades, session.startingBalance);
 *
 * ROUTE THAT CALLS THIS:
 *   GET /api/drawdown/compute?sessionId=X
 *   Defined in server/routes.ts — fetches session trades from storage, then
 *   calls computeDrawdown() and returns the result as JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "drawdown_calculator.py"
);

const TIMEOUT_MS = 30_000;
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DrawdownResult {
  success: boolean;
  topStats?: {
    maxDrawdown: number;
    avgDrawdown: number;
    recoveryFactor: number;
    trendAlignment: number;
  };
  streaks?: Record<string, any>;
  heatmap?: any[];
  distribution?: Record<string, any>;
  frequency?: Record<string, any>;
  structural?: Record<string, any>;
  sessionComparison?: any[];
  error?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * computeDrawdown
 * ───────────────
 * Spawns the Python drawdown engine, feeds it the trade array via stdin, and
 * returns the parsed analysis result. Always resolves — never rejects.
 *
 * @param trades           Raw journal entry rows from the database
 * @param startingBalance  Optional account starting balance for recovery calculations
 */
export async function computeDrawdown(
  trades: any[],
  startingBalance?: number
): Promise<DrawdownResult> {
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
      resolve({ success: false, error: "Drawdown computation timed out (30s)" });
    }, TIMEOUT_MS);

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.error("[DrawdownCalculator] Python stderr:", stderr.slice(0, 500));
      }
      if (stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()) as DrawdownResult);
          return;
        } catch {
          console.error("[DrawdownCalculator] JSON parse error:", stdout.slice(0, 300));
        }
      }
      resolve({
        success: false,
        error: code !== 0 ? `Python exited with code ${code}: ${stderr}` : "No output from drawdown engine",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[DrawdownCalculator] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });
  });
}
