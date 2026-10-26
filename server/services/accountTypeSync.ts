/**
 * ASK cTRADER WHETHER THE ACCOUNT IS DEMO OR LIVE, AND BELIEVE THE ANSWER.
 *
 * His instruction, 2026-10-26: *"When syncing accounts request ctrader for account status as Demo
 * or Live. This will prevent users from editing but display real status."*
 *
 * ⚠ THIS IS NOT A LABEL — IT DECIDES WHICH SERVER EVERY LATER CALL GOES TO. The stored value
 * chooses the live or the demo endpoint on every connection the app makes
 * (`brokerAdapters/ctrader.ts:311`, `:816`), and the autotrade demo-only guard reads it as the
 * account's environment (`routes.ts:2757-2765`). A wrong value there is a safety guard reading a
 * fiction, which is why it should never have been something a person could type.
 *
 * ⚠ IT WAS SET ONCE AND NEVER CHECKED AGAIN. `routes.ts:5158` and `:5300` take it from cTrader at
 * sign-in — correctly — and nothing has ever re-read it since. Meanwhile the edit route accepted
 * whatever was sent (`routes.ts:4616`). So the one authoritative reading happened at sign-in and
 * could then be overwritten by hand.
 *
 * ⚠ ONE CALL PER SIGN-IN, NOT PER ACCOUNT. cTrader hands back EVERY account under the token in a
 * single reply, so a sweep of four accounts that share one sign-in costs one lookup rather than
 * four. The cache below is what makes that true, and it is deliberately short: it exists to
 * collapse one sweep, not to hold an answer across them.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { getCTraderAccounts } from './brokerAdapters/ctrader';
import type { BrokerAccount } from '../../shared/schema';

/** Long enough to cover one sweep of every account, short enough that it is never a stale answer
 *  carried into the next one. The sweep runs every 15 minutes. */
const CACHE_MS = 60_000;

type Reading = { byCtid: Map<string, boolean>; at: number };
const _cache = new Map<string, Reading>();

/** Ask cTrader, or reuse the answer from a moment ago if this sweep already asked. */
async function readFromBroker(accessToken: string, app?: string): Promise<Map<string, boolean>> {
  const hit = _cache.get(accessToken);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.byCtid;
  const accounts = await getCTraderAccounts(accessToken, app);
  const byCtid = new Map(accounts.map(a => [String(a.ctidTraderAccountId), !!a.isLive]));
  _cache.set(accessToken, { byCtid, at: Date.now() });
  return byCtid;
}

/**
 * Bring the stored Demo/Live in line with what cTrader says.
 *
 * Returns the account as it should now be read, so the caller carries on with the corrected value
 * rather than the one it was handed. A failure returns the account untouched and says so: not
 * being able to ask is not a reason to guess, and it must never stop a sync.
 */
export async function refreshAccountType(
  account: BrokerAccount, creds: { accessToken?: string; ctraderId?: string; app?: string },
): Promise<BrokerAccount> {
  if (account.platform.toLowerCase() !== 'ctrader') return account;
  if (!creds?.accessToken || !creds?.ctraderId) return account;

  try {
    const byCtid = await readFromBroker(creds.accessToken, creds.app);
    const isLive = byCtid.get(String(creds.ctraderId));
    // NOT IN THE REPLY = DO NOT TOUCH IT. cTrader not listing the account is a reason to leave the
    // stored value alone, not to decide it is a demo — defaulting here would silently move a live
    // account onto the demo endpoint and look like a connection fault.
    if (isLive === undefined) {
      console.warn(`[AccountType] ${account.id.slice(0, 8)}: cTrader did not list this account — `
                 + `keeping the stored '${account.accountType}'`);
      return account;
    }

    const actual = isLive ? 'live' : 'demo';
    if ((account.accountType ?? '').toLowerCase() === actual) return account;

    // ⚠ LOUD, BECAUSE OF WHAT IT CHANGES. Every later call now goes to a different cTrader server,
    // and the autotrade demo-only guard reads this as the account's environment. A quiet change
    // here would look like the broker behaving differently for no reason.
    console.warn(`[AccountType] ${account.id.slice(0, 8)} (${account.name}): cTrader says this is `
               + `a ${actual.toUpperCase()} account, stored as '${account.accountType}'. Correcting `
               + `it — this changes which cTrader server every later call uses.`);
    await db.update(brokerAccounts)
      .set({ accountType: actual, updatedAt: new Date() })
      .where(eq(brokerAccounts.id, account.id));
    return { ...account, accountType: actual };
  } catch (err: any) {
    // NEVER FATAL. Not being able to ask is a worse reason to stop a sync than carrying on with
    // the value we already had.
    console.warn(`[AccountType] ${account.id.slice(0, 8)}: could not ask cTrader (`
               + `${err?.message ?? err}) — keeping the stored '${account.accountType}'`);
    return account;
  }
}
