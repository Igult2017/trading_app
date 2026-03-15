/**
 * metricsCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin bridge between the Express route layer and the Python metrics engine.
 *
 * Responsibilities (and ONLY these):
 *   1. Accept raw trade rows + optional startingBalance from the route handler
 *   2. Remap journalEntries DB column names to the camelCase keys expected by
 *      the Python calculator (profitLoss → pnl, entryTF → timeframe, etc.)
 *   3. Serialise the payload as { trades, startingBalance } and pipe to Python
 *   4. Collect stdout, parse it, and return the result verbatim
 *   5. Handle every failure mode (spawn error, timeout, bad JSON, non-zero exit)
 *      and resolve — never reject — with a typed MetricsResult
 *
 * All metric computation lives exclusively in server/python/metrics_calculator.py.
 * Do NOT add calculation logic here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "metrics_calculator.py"
);

const TIMEOUT_MS = 30_000;
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricsResult {
  success: boolean;
  tradeCount?: number;
  metrics?: Record<string, any>;
  error?: string;
}

interface PythonPayload {
  trades: any[];
  startingBalance?: number;
}

// ── Field remapper ────────────────────────────────────────────────────────────

/**
 * remapJournalEntry
 * ─────────────────
 * The journalEntries table uses column names that differ from the camelCase
 * API keys the Python engine was originally designed for.  This function adds
 * the canonical aliases so Python can resolve every field regardless of which
 * shape arrives.
 *
 * We ADD aliases rather than replacing keys so the original column names are
 * also preserved — Python's _get_field() will find whichever one is present.
 *
 * Mappings applied:
 *   profitLoss        → pnl
 *   riskReward        → rrRatio
 *   entryTF           → timeframe
 *   analysisTF        → analysisTimeframe
 *   contextTF         → contextTimeframe
 *   sessionName       → session  (when no "session" key exists)
 *   primaryExitReason → exitReason
 *   stopLossDistance  → slDistance
 *   takeProfitDistance→ tpDistance
 *   entryTime         → openedAt  (when no "openedAt" key exists)
 *   exitTime          → closedAt  (when no "closedAt" key exists)
 */
function remapJournalEntry(raw: Record<string, any>): Record<string, any> {
  const out = { ...raw };

  // P&L
  if (out.pnl == null && out.profitLoss != null) {
    out.pnl = out.profitLoss;
  }

  // R:R
  if (out.rrRatio == null && out.riskReward != null) {
    out.rrRatio = out.riskReward;
  }

  // Timeframes
  if (out.timeframe == null && out.entryTF != null) {
    out.timeframe = out.entryTF;
  }
  if (out.analysisTimeframe == null && out.analysisTF != null) {
    out.analysisTimeframe = out.analysisTF;
  }
  if (out.contextTimeframe == null && out.contextTF != null) {
    out.contextTimeframe = out.contextTF;
  }

  // Session
  if (out.session == null && out.sessionName != null) {
    out.session = out.sessionName;
  }

  // Exit reason
  if (out.exitReason == null && out.primaryExitReason != null) {
    out.exitReason = out.primaryExitReason;
  }

  // SL / TP distances
  if (out.slDistance == null && out.stopLossDistance != null) {
    out.slDistance = out.stopLossDistance;
  }
  if (out.tpDistance == null && out.takeProfitDistance != null) {
    out.tpDistance = out.takeProfitDistance;
  }

  // Timestamps
  if (out.openedAt == null) {
    out.openedAt = out.entryTime ?? out.entryTimeUTC ?? null;
  }
  if (out.closedAt == null) {
    out.closedAt = out.exitTime ?? null;
  }

  // Trade date fallback: use createdAt if nothing else is available
  if (out.tradeDate == null) {
    out.tradeDate = out.openedAt ?? out.createdAt ?? null;
  }

  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPayload(trades: any[], startingBalance?: number): PythonPayload {
  // Remap every trade row before sending to Python
  const remapped = trades.map((t) =>
    t && typeof t === "object" ? remapJournalEntry(t as Record<string, any>) : t
  );

  const payload: PythonPayload = { trades: remapped };
  if (startingBalance !== undefined && Number.isFinite(startingBalance)) {
    payload.startingBalance = startingBalance;
  }
  return payload;
}

function tryParseJSON(raw: string): MetricsResult | null {
  try {
    return JSON.parse(raw.trim()) as MetricsResult;
  } catch {
    console.error(
      "[MetricsCalculator] JSON parse error. First 300 chars of stdout:",
      raw.slice(0, 300)
    );
    return null;
  }
}

function killSilently(child: ChildProcess): void {
  try {
    child.kill("SIGTERM");
  } catch {
    // already gone
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * computeMetrics
 * ──────────────
 * Spawns the Python metrics engine, feeds it trades via stdin, and returns the
 * parsed result.  Always resolves — never rejects.
 *
 * @param trades           Raw trade rows from the database (journalEntries shape)
 * @param startingBalance  Optional account starting balance for equity-curve growth %
 */
export async function computeMetrics(
  trades: any[],
  startingBalance?: number
): Promise<MetricsResult> {
  return new Promise((resolve) => {
    if (!Array.isArray(trades)) {
      console.error("[MetricsCalculator] trades must be an array, got:", typeof trades);
      resolve({ success: false, error: "trades must be an array" });
      return;
    }

    let child: ChildProcess;
    try {
      child = spawn(PYTHON_BIN, [PYTHON_SCRIPT_PATH], {
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (spawnErr: any) {
      console.error("[MetricsCalculator] Failed to spawn Python:", spawnErr);
      resolve({ success: false, error: spawnErr?.message ?? "Failed to spawn Python" });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const settle = (result: MetricsResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.error(`[MetricsCalculator] Timed out after ${TIMEOUT_MS}ms`);
      killSilently(child);
      settle({ success: false, error: `Metrics computation timed out (${TIMEOUT_MS / 1000}s)` });
    }, TIMEOUT_MS);

    child.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err: Error) => {
      console.error("[MetricsCalculator] Spawn error:", err);
      settle({ success: false, error: err.message });
    });

    child.on("close", (code: number | null) => {
      if (stdout.trim()) {
        const parsed = tryParseJSON(stdout);
        if (parsed) {
          if (!parsed.success) {
            console.error("[MetricsCalculator] Python reported failure:", parsed.error);
          }
          settle(parsed);
          return;
        }
      }

      if (code !== 0 || stderr.trim()) {
        const msg = stderr.trim() || `Python exited with code ${code}`;
        console.error("[MetricsCalculator] Python error:", msg);
        settle({ success: false, error: msg });
        return;
      }

      settle({ success: false, error: "No output from metrics computation" });
    });

    try {
      const payload = buildPayload(trades, startingBalance);
      child.stdin!.write(JSON.stringify(payload), (writeErr) => {
        if (writeErr) {
          console.error("[MetricsCalculator] stdin write error:", writeErr);
        }
        child.stdin!.end();
      });
    } catch (serializeErr: any) {
      console.error("[MetricsCalculator] JSON serialisation error:", serializeErr);
      killSilently(child);
      settle({ success: false, error: `Could not serialise payload: ${serializeErr?.message}` });
    }
  });
}
