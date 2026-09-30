import { db, pool } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { openPositionIds, isAttached } from './ctraderHub';
import { syncAccount } from './autoSyncService';
import { record } from './autoJournal';

/**
 * ASK cTRADER WHAT IT IS HOLDING, AND NOTICE WHAT QUIETLY WENT AWAY.
 *
 * THIS IS THE LAYER THAT MAKES EVENTS TRUSTWORTHY. Events carry speed, and they carry nothing at all
 * when one fails to arrive — cTrader documents no sequence numbers, no acknowledgements and no replay,
 * so there is no way to ask "what did I miss?" directly. What CAN be asked is "what are you holding
 * right now", and that answers the question sideways: a position we knew was open, which the broker no
 * longer lists, has closed. If no trade was recorded for it, its close was missed.
 *
 * WHY IT MATTERS MORE THAN THE SWEEP. The 15-minute sweep used to be the only thing that recovered a
 * missed trade, which is why it ran for every account whether they traded or not. This finds the same
 * thing in FIVE MINUTES and then asks for history only for the account that actually lost something —
 * instead of asking every account, on a timer, for ever.
 *
 * ⚠ AND IT IS CHEAP, WHICH IS THE WHOLE POINT. `ProtoOAReconcileReq` is NOT one of the three history
 * requests cTrader rates at 5 per second — it is on the 50-per-second budget. At 250 accounts every five
 * minutes that is under one request a second, against a limit fifty times higher. The expensive request
 * (deal history, the scarce budget) is now made only when something is actually found missing.
 *
 * WHAT IT STILL CANNOT SEE, stated so nobody assumes otherwise: a position opened AND closed between two
 * checks, whose events were both missed. The broker's list never held it, so its absence cannot be
 * noticed. That single case is the only reason a periodic sweep still exists at all.
 */

/** Five minutes — his ruling, 2026-09-29. Short enough that a missed close is found while it still
 *  matters, and cheap enough at 250 accounts to be irrelevant against a 50-per-second budget. */
const CHECK_MS = 5 * 60_000;

/** What the broker last told us it was holding, per account. Memory only: on a restart the catch-up
 *  covers the gap, so there is nothing worth persisting and nothing to keep in step. */
const lastSeen = new Map<string, Set<string>>();

/** Has a trade been recorded for this broker position? The join the whole check turns on. */
async function haveTradeFor(accountId: string, positionId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM synced_trades WHERE broker_account_id = $1 AND position_id = $2 LIMIT 1`,
    [accountId, positionId]);
  return rows.length > 0;
}

async function checkAccount(accountId: string): Promise<void> {
  const now = await openPositionIds(accountId);
  if (now === null) return;                       // no feed attached — nothing to ask on
  const current = new Set(now);
  const before = lastSeen.get(accountId);
  lastSeen.set(accountId, current);
  if (!before) return;                            // first look: nothing to compare against yet

  // Gone from the broker's list = closed. That is the only thing this check is looking for.
  const vanished = [...before].filter(id => !current.has(id));
  if (!vanished.length) return;

  const missed: string[] = [];
  for (const positionId of vanished) {
    if (!(await haveTradeFor(accountId, positionId))) missed.push(positionId);
  }
  if (!missed.length) return;                     // closed AND recorded — the live feed did its job

  // ONE SYNC FOR THE ACCOUNT, not one per position. `syncAccount` asks for the window since the last
  // recorded moment, so a single call recovers every position missed in that window — and it already
  // lands behind the uniqueness rule, so nothing it re-fetches can be written twice.
  await record({ brokerAccountId: accountId, stage: 'missed-close',
                 detail: `${missed.length} position(s) closed at the broker with no trade recorded `
                         + `(${missed.join(', ')}) — the live feed missed them; fetching now` });
  console.warn(`[MissedClose] account ${accountId.slice(0, 8)}: ${missed.length} closed position(s) `
             + `never recorded (${missed.join(', ')}) — recovering`);
  // THE WHOLE ACCOUNT ROW, not just its id: `syncAccount` reads the platform, the last-sync time and
  // the stored credentials off it, so handing it a bare id would fail on the first field it touched.
  const [full] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, accountId));
  if (!full) return;
  const r = await syncAccount(full).catch((err: any) => {
    console.error(`[MissedClose] recovery sync failed for ${accountId.slice(0, 8)}: ${err?.message ?? err}`);
    return null;
  });
  if (r?.ok) {
    console.log(`[MissedClose] recovered ${r.created ?? 0} trade(s) for ${accountId.slice(0, 8)}`);
  }
}

async function tick(): Promise<void> {
  try {
    const accounts = await db.select().from(brokerAccounts)
      .where(eq(brokerAccounts.connectionType, 'api'));
    for (const a of accounts) {
      if (a.platform.toLowerCase() !== 'ctrader' || !isAttached(a.id)) continue;
      // One account at a time, on purpose: this runs every five minutes and has all the time it needs,
      // and asking serially keeps it from competing with the live feeds it depends on.
      await checkAccount(a.id).catch(err =>
        console.error(`[MissedClose] check failed for ${a.id.slice(0, 8)}: ${err?.message ?? err}`));
    }
  } catch (err: any) {
    console.error(`[MissedClose] tick failed: ${err?.message ?? err}`);
  }
}

/** Forget an account's remembered positions — used when its feed goes away, so a reconnect starts clean
 *  rather than reporting every position as vanished. */
export function forgetAccount(accountId: string): void { lastSeen.delete(accountId); }

export function startMissedCloseWatch(): void {
  console.log(`[MissedClose] Starting — asking the broker what it holds every ${CHECK_MS / 60_000} min, `
              + `so a close the live feed missed is found in minutes rather than on the daily sweep`);
  // The first tick only records a baseline, so there is no value in rushing it, and letting the feeds
  // attach first means the first real comparison has something to ask on.
  setTimeout(() => { void tick(); setInterval(() => void tick(), CHECK_MS); }, 60_000);
}
