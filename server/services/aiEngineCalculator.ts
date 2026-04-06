/**
 * server/services/aiEngineCalculator.ts
 * ──────────────────────────────────────
 * Spawns the Python ai_engine package and returns structured AI results.
 * Follows the same pattern as drawdownCalculator.ts / strategyAuditCalculator.ts.
 *
 * Modes:
 *   "analysis" → trader archetype, findings, win/loss profiles, checklist
 *   "strategy" → entry conditions, avoidance conditions, risk rules
 *
 * Protocol: JSON on stdin → JSON on stdout (same as every other Python engine).
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";

// ── Constants ─────────────────────────────────────────────────────────────────

// ai_engine is a package so we invoke it with -m, not a script path
const AI_ENGINE_MODULE = "ai_engine.main";
const PYTHON_DIR = path.join(process.cwd(), "server", "python");
const TIMEOUT_MS = 60_000; // Gemini call can take a few seconds

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIAnalysisResult {
  success: boolean;
  mode: string;
  trader_archetype?: string;
  health_score?: string;
  headline?: string;
  win_profile?: { label: string; conditions: string[]; probability: string } | null;
  loss_profile?: { label: string; conditions: string[]; probability: string } | null;
  findings?: Array<{
    finding: string;
    sample_size: number;
    win_rate: number;
    baseline_wr: number;
    deviation: number;
    confidence: string;
  }>;
  pre_trade_checklist?: string[];
  risk_alert?: string | null;
  error?: string;
}

export interface AIStrategyResult {
  success: boolean;
  mode: string;
  name?: string;
  entry_conditions?: Array<{ label: string; win_rate: number; sample_size: number; confidence: string }>;
  avoid_conditions?: Array<{ label: string; win_rate: number; sample_size: number; confidence: string }>;
  risk_rules?: Record<string, string>;
  projected_edge?: { finding: string; win_rate: number; sample_size: number; confidence: string } | null;
  data_warnings?: string[];
  narrative?: string;
  error?: string;
}

// ── Shared spawn helper ───────────────────────────────────────────────────────

function spawnAIEngine<T extends { error?: string }>(
  payload: object,
  tag: string
): Promise<T & { success: boolean }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(
      PYTHON_BIN,
      ["-m", AI_ENGINE_MODULE],
      { env: { ...process.env }, cwd: PYTHON_DIR }
    );

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      resolve({ success: false, error: "AI engine timed out (60s)" } as any);
    }, TIMEOUT_MS);

    child.stdin?.write(JSON.stringify(payload));
    child.stdin?.end();

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.error(`[AIEngine/${tag}] Python stderr:`, stderr.slice(0, 500));
      }
      if (stdout.trim()) {
        try {
          resolve({ success: true, ...(JSON.parse(stdout.trim()) as T) });
          return;
        } catch {
          console.error(`[AIEngine/${tag}] JSON parse error:`, stdout.slice(0, 300));
        }
      }
      resolve({
        success: false,
        error: code !== 0
          ? `Python exited with code ${code}: ${stderr.slice(0, 200)}`
          : "No output from AI engine",
      } as any);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      console.error(`[AIEngine/${tag}] Spawn error:`, err);
      resolve({ success: false, error: err.message } as any);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function computeAIAnalysis(trades: any[]): Promise<AIAnalysisResult> {
  return spawnAIEngine<AIAnalysisResult>(
    { mode: "analysis", trades },
    "analysis"
  );
}

export async function computeAIStrategy(trades: any[]): Promise<AIStrategyResult> {
  return spawnAIEngine<AIStrategyResult>(
    { mode: "strategy", trades },
    "strategy"
  );
}
