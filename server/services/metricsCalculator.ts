/**
 * metricsCalculator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin bridge between the Express route layer and the Python metrics engine.
 *
 * Responsibilities (and ONLY these):
 *   1. Accept raw trade rows + optional startingBalance from the route handler
 *   2. Serialise the payload to JSON and pipe it to the Python process via stdin
 *   3. Collect stdout, parse it, and return the result verbatim
 *   4. Handle every failure mode (spawn error, timeout, bad JSON, non-zero exit)
 *      and resolve — never reject — with a typed MetricsResult
 *
 * All metric computation lives exclusively in server/python/metrics_calculator.py.
 * Do NOT add calculation logic here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Absolute path to the Python calculator, resolved once at module load time. */
const PYTHON_SCRIPT_PATH = path.join(
  process.cwd(),
  "server",
  "python",
  "metrics_calculator.py"
);

/**
 * Maximum ms to wait for Python to return results.
 * 30 s is generous for even very large sessions; raise only if profiling shows need.
 */
const TIMEOUT_MS = 30_000;

/** Python interpreter — prefer python3, fall back via env if needed. */
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MetricsResult {
  success: boolean;
  tradeCount?: number;
  metrics?: Record<string, any>;
  error?: string;
}

/** Shape of the JSON payload written to Python's stdin. */
interface PythonPayload {
  trades: any[];
  startingBalance?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the stdin payload.
 * Python's _main() accepts either a bare array or { trades, startingBalance }.
 * We always send the object form so Python can forward startingBalance into the
 * equity-curve calculation without guessing.
 */
function buildPayload(trades: any[], startingBalance?: number): PythonPayload {
  const payload: PythonPayload = { trades };
  if (startingBalance !== undefined && Number.isFinite(startingBalance)) {
    payload.startingBalance = startingBalance;
  }
  return payload;
}

/**
 * Try to parse the raw stdout string as JSON.
 * Returns null (and logs) on failure so the caller can decide what to do.
 */
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

/**
 * Kill the child process silently — it may already be dead.
 */
function killSilently(child: ChildProcess): void {
  try {
    child.kill("SIGTERM");
  } catch {
    // process already gone — fine
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * computeMetrics
 * ──────────────
 * Spawns the Python metrics engine, feeds it trades via stdin, and returns the
 * parsed result.  Always resolves — never rejects — so callers don't need a
 * try/catch around the await.
 *
 * @param trades           Raw trade rows from the database (camelCase keys)
 * @param startingBalance  Optional account starting balance for equity-curve growth %
 */
export async function computeMetrics(
  trades: any[],
  startingBalance?: number
): Promise<MetricsResult> {
  return new Promise((resolve) => {
    // ── Sanity-check input before touching Python ────────────────────────
    if (!Array.isArray(trades)) {
      console.error("[MetricsCalculator] trades must be an array, got:", typeof trades);
      resolve({ success: false, error: "trades must be an array" });
      return;
    }

    // ── Spawn ────────────────────────────────────────────────────────────
    let child: ChildProcess;
    try {
      child = spawn(PYTHON_BIN, [PYTHON_SCRIPT_PATH], {
        env: { ...process.env },
        // Pipe all three streams so we can read stdout/stderr and write stdin
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (spawnErr: any) {
      console.error("[MetricsCalculator] Failed to spawn Python:", spawnErr);
      resolve({ success: false, error: spawnErr?.message ?? "Failed to spawn Python" });
      return;
    }

    // ── State ────────────────────────────────────────────────────────────
    let stdout = "";
    let stderr = "";
    let settled = false; // guard: resolve only once

    const settle = (result: MetricsResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // ── Timeout guard ────────────────────────────────────────────────────
    const timer = setTimeout(() => {
      console.error(`[MetricsCalculator] Timed out after ${TIMEOUT_MS}ms`);
      killSilently(child);
      settle({ success: false, error: `Metrics computation timed out (${TIMEOUT_MS / 1000}s)` });
    }, TIMEOUT_MS);

    // ── Stream collectors ────────────────────────────────────────────────
    child.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    // ── Spawn-level error (e.g. python3 not found) ───────────────────────
    child.on("error", (err: Error) => {
      console.error("[MetricsCalculator] Spawn error:", err);
      settle({ success: false, error: err.message });
    });

    // ── Process exit ─────────────────────────────────────────────────────
    child.on("close", (code: number | null) => {
      // 1. Prefer stdout — even on non-zero exit Python may have written valid JSON
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

      // 2. Non-zero exit or stderr content → failure
      if (code !== 0 || stderr.trim()) {
        const msg = stderr.trim() || `Python exited with code ${code}`;
        console.error("[MetricsCalculator] Python error:", msg);
        settle({ success: false, error: msg });
        return;
      }

      // 3. Zero exit but no usable output
      settle({ success: false, error: "No output from metrics computation" });
    });

    // ── Write payload ────────────────────────────────────────────────────
    // Do this after attaching listeners so we can't miss the 'close' event
    // on a process that exits synchronously (unlikely but defensive).
    try {
      const payload = buildPayload(trades, startingBalance);
      child.stdin!.write(JSON.stringify(payload), (writeErr) => {
        if (writeErr) {
          console.error("[MetricsCalculator] stdin write error:", writeErr);
          // Don't settle here — close event will fire with code 1
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
