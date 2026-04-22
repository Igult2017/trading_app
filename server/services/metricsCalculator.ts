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
import { PYTHON_BIN } from "../lib/pythonBin";
import { remapJournalEntry } from "../lib/remapJournalEntry";

// ── Constants ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "metrics_calculator.py"
);

const TIMEOUT_MS = 30_000;

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
  // First try parsing the whole output as-is
  try {
    return JSON.parse(raw.trim()) as MetricsResult;
  } catch {
    // scipy (and other Python libs) can print RuntimeWarnings to stdout,
    // corrupting the JSON. Extract the JSON object by finding the outermost
    // { ... } block so stray warning lines before/after are ignored.
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const extracted = raw.slice(start, end + 1);
        return JSON.parse(extracted) as MetricsResult;
      } catch {
        // fall through to error log
      }
    }
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

      if (code !== 0) {
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
