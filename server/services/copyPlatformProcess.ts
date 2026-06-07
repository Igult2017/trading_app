/**
 * Spawns the Python copy platform as a child process.
 * Restarts automatically if it exits unexpectedly.
 * Only runs on the primary worker (not in every PM2 cluster instance).
 */
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { PYTHON_BIN } from "../lib/pythonBin";
import { log } from "../static";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PLATFORM_DIR = path.resolve(__dirname, "../../copy_platform");
let proc: ChildProcess | null = null;
let stopping = false;

export function startCopyPlatform(): void {
  if (!process.env.CTRADER_CLIENT_ID || !process.env.CTRADER_CLIENT_SECRET) {
    log("[CopyPlatform] CTRADER_CLIENT_ID / CLIENT_SECRET not set — skipping");
    return;
  }
  _spawn();
}

function _spawn(): void {
  if (stopping) return;
  const script = path.join(PLATFORM_DIR, "main.py");
  log(`[CopyPlatform] starting ${PYTHON_BIN} ${script}`);

  proc = spawn(PYTHON_BIN, [script], {
    cwd:   PLATFORM_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env:   { ...process.env },
  });

  proc.stdout?.on("data", (buf: Buffer) =>
    log(`[CopyPlatform] ${buf.toString().trim()}`)
  );
  proc.stderr?.on("data", (buf: Buffer) =>
    log(`[CopyPlatform] ERR: ${buf.toString().trim()}`)
  );
  proc.on("exit", (code, signal) => {
    if (stopping) return;
    log(`[CopyPlatform] exited (code=${code}, signal=${signal}) — restarting in 5 s`);
    setTimeout(_spawn, 5_000);
  });
}

export function stopCopyPlatform(): void {
  stopping = true;
  proc?.kill();
}
