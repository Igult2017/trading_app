/**
 * backgroundServices.ts — the long-running work BOTH server entry points must start.
 *
 * WHY THIS FILE EXISTS. `server/index.ts` (development) started five background services; the file
 * the container actually runs, `server/index.prod.ts`, started two. So in production there was
 * **no periodic trade sync and no live cTrader feed — the only two things that record a broker
 * trade.** That is why a connected account's session sat at `Trades 0` forever.
 *
 * Proved from the boot log rather than by reading: the scraper and the health watchdog both logged
 * at boot, and `[AutoSync] Starting` — the line between them in `index.ts` — was absent from the
 * whole buffer.
 *
 * Everything started after `listen` now lives here, so a service added in future reaches production
 * by construction instead of by remembering to edit a second file.
 */
import fs from "fs";
import { scraperScheduler } from "../scrapers/scheduler";
import { startAutoSync } from "../services/autoSyncService";
import { startHealthWatchdog } from "../services/healthWatchdog";
import { startCTraderRealtime } from "../services/ctraderRealtime";
import { log } from "../static";

// In PM2 cluster mode each worker gets NODE_APP_INSTANCE = '0', '1', '2'…
// Background tasks that write to the DB or call external services must only run in one worker —
// otherwise every restart multiplies scraper load by core count.
export const isPrimaryWorker =
  !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

/**
 * Start every background service. Safe to call from any entry point; does nothing on a non-primary
 * cluster worker.
 *
 * THE TWO PYTHON CHILD PROCESSES ARE DELIBERATELY NOT HERE. In the container `start.sh` already
 * spawns the signal platform and the copy engine, each under its own restart watchdog.
 * `startSignalPlatform` guards itself with `SIGNAL_PLATFORM_MANAGED`, but `startCopyPlatform` has
 * **no equivalent guard** (`services/copyPlatformProcess.ts:19`) — calling it here would run a
 * SECOND copy engine alongside start.sh's and duplicate every copied trade. They stay in
 * `index.ts`, which Docker does not run.
 */
export function startBackgroundServices(): void {
  if (!isPrimaryWorker) return;

  scraperScheduler.start();
  startAutoSync();              // 15-min trade sync for every API-connected account
  startHealthWatchdog();        // coded health alerts (token / scanner / engine)
  startCTraderRealtime();       // instant cTrader trade recording

  mirrorSignalPlatformStatus();
}

/**
 * Mirror the Python signal platform's boot status into the Node log so it appears in Coolify.
 * Python writes the file; Node polls and re-logs it until it reports ok.
 *
 * This only ever runs when `SIGNAL_PLATFORM_MANAGED` is set — i.e. in the container — and it lived
 * in the DEVELOPMENT entry file, so it had never run anywhere. Moving it here is what finally makes
 * it do its job.
 */
function mirrorSignalPlatformStatus(): void {
  if (!process.env.SIGNAL_PLATFORM_MANAGED) return;

  const STATUS_FILE = "/app/.signal_platform_status.json";
  let lastStatus = "";
  const pollStatus = () => {
    try {
      const raw = fs.readFileSync(STATUS_FILE, "utf8");
      const s = JSON.parse(raw) as { status: string; error?: string; hint?: string; ts?: number };
      const line = s.status === "error"
        ? `[SignalPlatform] BOOT ERROR: ${s.error} | FIX: ${s.hint}`
        : `[SignalPlatform] status=${s.status}`;
      if (line !== lastStatus) { log(line); lastStatus = line; }
      if (s.status === "ok") clearInterval(interval);       // stop polling once running
    } catch { /* file not written yet — Python still starting */ }
  };
  setTimeout(pollStatus, 8_000);                            // first check after 8s
  const interval = setInterval(pollStatus, 15_000);         // then every 15s until ok
}
