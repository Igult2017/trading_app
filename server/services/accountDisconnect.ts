/**
 * LOG AN ACCOUNT OUT WITHOUT THROWING ITS HISTORY AWAY — and let it pick up where it left off.
 *
 * His instruction, 2026-10-26: *"I want autosync to have a good memory such that when i logout
 * account, its data is not errased and when i log it back in it is not autosynced from scratch,
 * the data is restored from where we left and only new data or trades that were made when it was
 * logged out are journaled."*
 *
 * ⚠ UNTIL NOW THERE WAS NO WAY TO LOG AN ACCOUNT OUT. The only control was Delete
 * (`client/src/pages/AccountsPage.tsx:850`), and its warning was accurate — it really does take
 * everything:
 *
 *   the account row            `routes.ts:4637` -> `storage.ts:1051`
 *   every raw broker trade     the database cascades it (`shared/schema.ts:838`)
 *   every journal entry        `routes.ts:4657` -> `storage.ts:684`
 *
 * So "logging out and back in" meant deleting the history and re-importing two years of it under a
 * brand-new account id, which is exactly what he is asking to stop.
 *
 * ⚠ WHAT THIS KEEPS, AND WHY EACH ONE MATTERS. The row, the synced trades, the session and the
 * journal entries all stay — and so does `last_sync_at`, which is the part that makes the resume
 * work. `autoSyncService.ts:301-303` reads it: with a last sync it fetches from there to now, so
 * one sweep after reconnecting covers the whole logged-out stretch; without one it fetches the
 * full history and re-journals everything. Clearing that single timestamp would undo the feature
 * while every other row still looked intact.
 *
 * ⚠ THE TOKENS GO, DELIBERATELY — and that is the one thing that separates this from
 * `markNeedsReconnect` (`autoSyncService.ts:168`), which keeps them on purpose. That one handles a
 * REFUSAL, where the ticket may be alive on a sibling and recover by itself. This one is him
 * asking to be signed out, so holding his broker credentials afterwards would be wrong.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { removeCTraderAccount } from './ctraderRealtime';
import { DISCONNECTED, loggedOutFields } from '../lib/accountFilters';

export { DISCONNECTED, KEPT_BY_LOGOUT, loggedOutFields } from '../lib/accountFilters';

export interface DisconnectResult {
  ok: boolean;
  /** What was kept, so the caller can say it rather than promise it. */
  keptLastSyncAt: string | null;
}

/**
 * Log one account out. Everything it has recorded stays exactly where it is.
 *
 * The feed teardown runs FIRST and its failure is not fatal: a socket we could not close is a
 * nuisance, whereas a half-finished log-out that still holds live tokens is a real problem. The
 * periodic reconcile (`ctraderRealtime.reconcile`) drops it on the next pass regardless, because
 * it now skips accounts that are switched off.
 */
export async function disconnectAccount(accountId: string): Promise<DisconnectResult> {
  try { removeCTraderAccount(accountId); }
  catch (e: any) { console.error(`[disconnect] feed teardown failed (non-fatal): ${e?.message ?? e}`); }

  const [before] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, accountId));
  if (!before) return { ok: false, keptLastSyncAt: null };

  await db.update(brokerAccounts).set(loggedOutFields()).where(eq(brokerAccounts.id, accountId));

  console.log(`[disconnect] ${accountId.slice(0, 8)} logged out — history kept, last sync `
            + `${before.lastSyncAt ? before.lastSyncAt.toISOString() : 'never'} preserved for the resume`);
  return { ok: true, keptLastSyncAt: before.lastSyncAt ? before.lastSyncAt.toISOString() : null };
}

/**
 * Find the account a fresh sign-in should ADOPT rather than replace.
 *
 * ⚠ THIS IS THE HALF THAT MAKES THE RESUME POSSIBLE. Both sign-in paths write into a brand-new
 * placeholder row (`routes.ts:5098` and `:5212`); nothing has ever looked for an account this user
 * already had under the same login. A new row has no synced trades and no `last_sync_at`, so the
 * first sweep pulls the full history and journals all of it a second time.
 *
 * Matching is on the user, the platform and the broker's own login id — the three things that make
 * it the same trading account. A placeholder is never adopted (`pending_` is what an unfinished
 * sign-in is called, `autoSyncService.ts:281`), and neither is the row being signed in right now.
 */
export async function findAccountToAdopt(
  userId: string, platform: string, loginId: string, placeholderId: string,
): Promise<{ id: string; lastSyncAt: Date | null } | null> {
  if (!loginId || loginId.startsWith('pending_')) return null;
  const rows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.userId, userId));
  const match = rows.find(a =>
    a.id !== placeholderId
    && a.platform.toLowerCase() === platform.toLowerCase()
    && String(a.loginId) === String(loginId)
    && !String(a.loginId).startsWith('pending_'));
  return match ? { id: match.id, lastSyncAt: match.lastSyncAt ?? null } : null;
}
