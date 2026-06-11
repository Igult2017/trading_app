/**
 * Spawns the Python signal platform as a child process.
 * Only runs when SIGNAL_PLATFORM_MANAGED is not set (i.e. not in Docker,
 * where start.sh already started Python before Node).
 * Restarts automatically unless the process exits with code=1 (bad config).
 */
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import { PYTHON_BIN } from "../lib/pythonBin";
import { log } from "../static";

const PLATFORM_DIR = path.resolve(process.cwd(), "signal_platform");
let proc: ChildProcess | null = null;
let stopping = false;

export function startSignalPlatform(): void {
  if (process.env.SIGNAL_PLATFORM_MANAGED) {
    return; // Docker's start.sh already started it
  }

  const env = process.env;
  const configured = Boolean(
    env.CTRADER_CLIENT_ID && env.CTRADER_CLIENT_SECRET &&
    env.CTRADER_ACCOUNT_ID && env.CTRADER_ACCESS_TOKEN && env.CTRADER_REFRESH_TOKEN
  );

  if (!configured) {
    log("[SignalPlatform] cTrader env vars missing — signal platform NOT started");
    log("[SignalPlatform] Need: CTRADER_CLIENT_ID, CTRADER_CLIENT_SECRET, CTRADER_ACCOUNT_ID, CTRADER_ACCESS_TOKEN, CTRADER_REFRESH_TOKEN");
    return;
  }

  _spawn();
}

export function stopSignalPlatform(): void {
  stopping = true;
  proc?.kill();
}

function _spawn(): void {
  if (stopping) return;
  log(`[SignalPlatform] starting ${PYTHON_BIN} main.py (cwd: ${PLATFORM_DIR})`);

  proc = spawn(PYTHON_BIN, ["-u", "main.py"], {
    cwd: PLATFORM_DIR,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  proc.stdout?.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => log(`[SignalPlatform] ${line}`));
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => log(`[SignalPlatform] ${line}`));
  });

  proc.on("exit", (code) => {
    if (stopping) return;
    if (code === 1) {
      log("[SignalPlatform] exited code=1 — startup failed (check cTrader config). NOT restarting.");
    } else {
      log(`[SignalPlatform] exited (code=${code}) — restarting in 10 s`);
      setTimeout(_spawn, 10_000);
    }
  });
}
