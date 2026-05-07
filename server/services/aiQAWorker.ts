/**
 * server/services/aiQAWorker.ts
 * ──────────────────────────────
 * Long-running Python worker for Trader-AI chat (QA mode).
 *
 * Why this exists:
 *   The default `computeAIQuery` spawns a fresh Python process for every
 *   message. Each spawn pays ~2-4s of module-import startup before even
 *   touching Gemini. This worker keeps one Python process warm and feeds
 *   it newline-delimited JSON requests, so chat replies feel instant.
 *
 * Protocol:
 *   request : {"id":"<uuid>", "trades":[...], "question":"...", ... }\n
 *   response: {"id":"<uuid>", "ok":true, "answer":"..."}\n
 *           | {"id":"<uuid>", "ok":false, "error":"..."}\n
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { randomUUID } from "crypto";
import { PYTHON_BIN } from "../lib/pythonBin";

const PYTHON_DIR     = path.join(process.cwd(), "server", "python");
const WORKER_MODULE  = "ai_engine.qa_worker";
const REQUEST_TIMEOUT_MS = 60_000;

type Pending = {
  resolve: (answer: string) => void;
  reject:  (err: Error) => void;
  timer:   NodeJS.Timeout;
};

class QAWorker {
  private child: ChildProcess | null = null;
  private buffer = "";
  private pending = new Map<string, Pending>();
  private restartScheduled = false;

  private ensureRunning(): ChildProcess {
    if (this.child && !this.child.killed && this.child.exitCode === null) {
      return this.child;
    }

    const child = spawn(PYTHON_BIN, ["-u", "-m", WORKER_MODULE], {
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      cwd: PYTHON_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.error(`[AIQAWorker] ${msg}`);
    });
    child.on("exit", (code, signal) => {
      console.error(`[AIQAWorker] Worker exited code=${code} signal=${signal}`);
      // Reject every in-flight request so callers don't hang.
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error("AI worker exited unexpectedly"));
        this.pending.delete(id);
      }
      this.child = null;
      // Lazy: don't auto-restart here; the next call will spawn a fresh one.
    });
    child.on("error", (err) => {
      console.error(`[AIQAWorker] Spawn error:`, err);
    });

    this.child  = child;
    this.buffer = "";
    return child;
  }

  private onStdout(chunk: Buffer): void {
    this.buffer += chunk.toString();
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as { id?: string; ok: boolean; answer?: string; error?: string };
        const id = msg.id;
        if (!id) continue;
        const p = this.pending.get(id);
        if (!p) continue;
        clearTimeout(p.timer);
        this.pending.delete(id);
        if (msg.ok) p.resolve(msg.answer || "");
        else        p.reject(new Error(msg.error || "AI worker failed"));
      } catch (e) {
        console.error(`[AIQAWorker] Failed to parse worker output: ${line.slice(0, 200)}`);
      }
    }
  }

  ask(payload: {
    trades:           any[];
    question:         string;
    messages?:        Array<{ role: string; content: string }>;
    metrics_context?: Record<string, any>;
    model?:           string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.ensureRunning();
      const id    = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("AI worker timed out (60s)"));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });

      const req = JSON.stringify({ id, ...payload }) + "\n";
      try {
        child.stdin?.write(req);
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Failed to write to AI worker: ${err.message}`));
      }
    });
  }
}

const worker = new QAWorker();

export async function askTraderAI(payload: {
  trades:            any[];
  question:          string;
  messages?:         Array<{ role: string; content: string }>;
  metrics_context?:  Record<string, any>;
  drawdown_context?: Record<string, any>;
  audit_context?:    Record<string, any>;
  model?:            string;
}): Promise<string> {
  return worker.ask(payload);
}
