/**
 * strategyAuditCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin Node.js bridge between the Express route layer and the Python strategy
 * audit engine (server/python/strategy_audit_calculator.py).
 *
 * RESPONSIBILITIES (and ONLY these):
 *   1. Accept raw trade rows + optional startingBalance from the route handler
 *   2. Serialise the payload and pipe it to the Python process via stdin
 *   3. Collect stdout, parse the JSON result, and return it to the caller
 *   4. Handle all failure modes and resolve — never reject — with StrategyAuditResult
 *
 * All strategy audit computation logic lives exclusively in:
 *   server/python/strategy_audit_calculator.py
 * Do NOT add calculation logic here.
 *
 * USAGE:
 *   import { computeStrategyAudit } from './services/strategyAuditCalculator';
 *   const result = await computeStrategyAudit(trades, session.startingBalance);
 *
 * ROUTE THAT CALLS THIS:
 *   GET /api/strategy-audit/compute?sessionId=X
 *   Defined in server/routes.ts — fetches session trades from storage, then
 *   calls computeStrategyAudit() and returns the result as JSON.
 *
 * The StrategyAudit component (client/src/components/StrategyAudit.tsx)
 * currently uses hardcoded mock data across all 4 audit levels. Once this
 * service and the route are wired in, the component should call
 * GET /api/strategy-audit/compute?sessionId=X via useQuery and replace the
 * static tradeData with real computed values from the response.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "strategy_audit_calculator.py"
);

const TIMEOUT_MS = 45_000;
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StrategyAuditResult {
  success: boolean;
  level1?: {
    edgeSummary: Record<string, any>;
    edgeDrivers: any[];
    monitorItems: string[];
    weaknesses: any[];
    winFactorCorrelation: Record<string, number[]>;
    lossFactorCorrelation: Record<string, number[]>;
    psychologyScore: number;
    disciplineScore: number;
    probabilisticEdge: number;
  };
  level2?: {
    variance: Record<string, any>;
    drawdown: Record<string, any>;
    equityVariance: Record<string, any>;
    tradeQuality: Record<string, any>;
    conditionalEdge: Record<string, any>;
    heatmapProfiles: any[];
  };
  level3?: {
    lossCluster: Record<string, any>;
    executionAsymmetry: Record<string, any>;
    regimeTransition: Record<string, any>;
    capitalHeat: Record<string, any>;
    automationRisk: Record<string, any>;
  };
  level4?: {
    aiPolicySuggestions: any[];
    guardrails: any[];
    edgeDecay: Record<string, any>;
    finalVerdict: Record<string, any>;
  };
  error?: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * computeStrategyAudit
 * ────────────────────
 * Spawns the Python strategy audit engine, feeds it the trade array via stdin,
 * and returns the parsed result. Always resolves — never rejects.
 *
 * NOTE: This computation is heavier than metrics or calendar (uses scipy for
 * statistical tests). The timeout is intentionally set to 45s.
 *
 * @param trades           Raw journal entry rows from the database
 * @param startingBalance  Optional account starting balance for risk calculations
 */
export async function computeStrategyAudit(
  trades: any[],
  startingBalance?: number
): Promise<StrategyAuditResult> {
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
      resolve({ success: false, error: "Strategy audit computation timed out (45s)" });
    }, TIMEOUT_MS);

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.error("[StrategyAuditCalculator] Python stderr:", stderr.slice(0, 500));
      }
      if (stdout.trim()) {
        try {
          resolve(JSON.parse(stdout.trim()) as StrategyAuditResult);
          return;
        } catch {
          console.error("[StrategyAuditCalculator] JSON parse error:", stdout.slice(0, 300));
        }
      }
      resolve({
        success: false,
        error: code !== 0 ? `Python exited with code ${code}: ${stderr}` : "No output from strategy audit engine",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error("[StrategyAuditCalculator] Spawn error:", err);
      resolve({ success: false, error: err.message });
    });
  });
}
