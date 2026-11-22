/**
 * SYNC ALL, ON THE SERVER — one click, every account, one after another (22 Nov 2026, sync plan step 7).
 *
 * His words: *"users should also be able to sync all their accounts at once not one at a time. They just
 * click then they will be synced one at a time without him leaving the page again to sync another account."*
 *
 * WHAT WAS WRONG. Sync All ran in the BROWSER, every account at once (`AccountsPage.tsx`, a `Promise.all`),
 * each request held up to 30 s — so all of a user's accounts hit cTrader together, and closing the page
 * abandoned the replies. Now the server owns the run:
 *  * ONE RUN PER USER, NEVER TWO. A second click while one is going returns the run already going.
 *  * ONE ACCOUNT AT A TIME, each exactly as if he had pressed its own Sync (`deep`, `manual` — a trade whose
 *    journal entry he deleted is rebuilt, his 06 Sep rule for a sync he asked for).
 *  * EVERY CHANGE IS PUSHED to his open tabs (`journalPush`), and the last run is kept for 10 minutes, so
 *    the page can be closed and opened again and still show where it is.
 *  * A STEP IS CAPPED AT 5 MINUTES, so one slow broker can never stall the rest; that account keeps going
 *    in the background and the run says so.
 * The run lives in this process — production is one Node process (`journalPush.ts` header says the same).
 */
import type { BrokerAccount } from '../../shared/schema';
import { storage } from '../storage';
import { syncAccount, type SyncOutcome } from './autoSyncService';
import { pushToUser } from './journalPush';
import { API_PLATFORMS } from './brokerAdapters/index';
import { DISCONNECTED } from '../lib/accountFilters';

export type ItemStatus = 'queued' | 'syncing' | 'done' | 'error' | 'skipped' | 'still-running';

export interface SyncAllItem {
  accountId: string;
  label:     string;
  status:    ItemStatus;
  message?:  string;
  created?:  number;
  fetched?:  number;
}

export interface SyncAllRun {
  startedAt:   string;
  finishedAt?: string;
  items:       SyncAllItem[];
}

let STEP_CAP_MS = 5 * 60_000;
export function _setStepCapForTests(ms: number): void { STEP_CAP_MS = ms; }
const KEEP_FINISHED_MS = 10 * 60_000;

const runs = new Map<string, SyncAllRun>();

/** Tests only: the sync each account runs. */
let runOne: (a: BrokerAccount) => Promise<SyncOutcome> = (a) => syncAccount(a, { deep: true, manual: true });
export function _setRunnerForTests(fn: typeof runOne): void { runOne = fn; }

/** Why an account cannot be synced by asking its broker — or null when it can. */
function whyNot(a: BrokerAccount): string | null {
  if (a.connectionType === 'webhook') return 'sends its trades through the EA on its own';
  if (!API_PLATFORMS.has(String(a.platform).toLowerCase())) return `no API for ${a.platform}`;
  if (a.isActive === false || a.syncStatus === DISCONNECTED) return 'logged out — reconnect it first';
  return null;
}

function tell(userId: string, run: SyncAllRun): void {
  pushToUser(userId, { type: 'sync-all', run });
}

/** The run in progress or just finished for this user, or null. */
export function syncAllStatus(userId: string): SyncAllRun | null {
  return runs.get(userId) ?? null;
}

/**
 * Start Sync All for this user, or return the run already going. Never throws: every account's failure is
 * recorded on its own line, so one bad account cannot stop the others.
 */
export async function startSyncAll(userId: string): Promise<{ run: SyncAllRun; alreadyRunning: boolean }> {
  const existing = runs.get(userId);
  if (existing && !existing.finishedAt) return { run: existing, alreadyRunning: true };

  const accounts = await storage.getBrokerAccounts(userId);
  const run: SyncAllRun = {
    startedAt: new Date().toISOString(),
    items: accounts.map((a) => {
      const why = whyNot(a);
      return { accountId: a.id, label: a.brokerName || a.name, status: why ? 'skipped' : 'queued',
               ...(why ? { message: why } : {}) } as SyncAllItem;
    }),
  };
  runs.set(userId, run);
  tell(userId, run);
  void work(userId, run, accounts);
  return { run, alreadyRunning: false };
}

async function work(userId: string, run: SyncAllRun, accounts: BrokerAccount[]): Promise<void> {
  for (const item of run.items) {
    if (item.status !== 'queued') continue;
    const account = accounts.find((a) => a.id === item.accountId)!;
    item.status = 'syncing';
    tell(userId, run);
    try {
      const out = await Promise.race([
        runOne(account),
        new Promise<null>((r) => setTimeout(() => r(null), STEP_CAP_MS)),
      ]);
      if (out === null) {
        item.status = 'still-running';
        item.message = 'taking longer than 5 minutes — it carries on in the background';
      } else if (out.skipped) {
        item.status = 'skipped'; item.message = out.skipped;
      } else if (!out.ok) {
        item.status = 'error'; item.message = out.error ?? 'sync failed';
      } else {
        item.status = 'done';
        item.fetched = out.fetched ?? 0;
        item.created = out.created ?? 0;
        item.message = out.fetched
          ? `${out.fetched} closed trade(s) found — ${out.created ?? 0} newly recorded`
          : 'no closed trades in the last 7 days';
      }
    } catch (err: any) {
      item.status = 'error';
      item.message = String(err?.message ?? err).slice(0, 200);
    }
    tell(userId, run);
  }
  run.finishedAt = new Date().toISOString();
  tell(userId, run);
  console.log(`[SyncAll] user ${userId.slice(0, 8)}: ${run.items.map((i) => i.status).join(', ')}`);
  setTimeout(() => { if (runs.get(userId) === run) runs.delete(userId); }, KEEP_FINISHED_MS).unref?.();
}
