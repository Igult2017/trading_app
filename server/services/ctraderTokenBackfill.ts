/**
 * GIVE THE ACCOUNTS THAT ALREADY EXIST A SHARED TOKEN RECORD.
 *
 * Every cTrader account connected before 25 Oct 2026 carries its own COPY of a token, and accounts
 * that came from the same sign-in carry the IDENTICAL copy. That is what makes the grouping exact
 * rather than a guess: **the same stored refresh ticket IS the same sign-in.** No heuristic, no
 * matching on owner or broker or time.
 *
 * ⚠ ACCOUNTS THAT CANNOT BE GROUPED ARE LEFT ALONE. An account whose login was already erased has
 * no ticket to group on; it joins a family at the next sign-in, which is the one re-authorisation
 * that cannot be avoided. Guessing which family it belonged to would risk handing it a token that
 * does not cover it — the precise error the signal platform's pin exists to prevent.
 *
 * Runs once per boot, before the first sync sweep. After the first run it matches nothing and
 * costs one indexed query.
 */
import { db } from '../db';
import { eq, isNull, and } from 'drizzle-orm';
import { brokerAccounts } from '../../shared/schema';
import { safeDecrypt } from '../lib/crypto';
import { createTokenRecord } from './ctraderTokenStore';

export async function backfillCtraderTokenRecords(): Promise<void> {
  let rows;
  try {
    rows = await db.select().from(brokerAccounts)
      .where(and(eq(brokerAccounts.platform, 'ctrader'), isNull(brokerAccounts.ctraderTokenId)));
  } catch (err: any) {
    // The column is added by docker-migrate.sql at boot. If that failed, say so plainly instead of
    // taking the sync sweep down with us — the old per-account path still works.
    console.error('[ctraderTokens] backfill skipped — could not read broker_accounts: '
                + (err?.message ?? err));
    return;
  }
  if (!rows.length) return;

  // key = owner + issuing app + the ticket itself. The ticket alone would be enough; owner and app
  // are in the key so a record can never span two users or two Open API apps.
  const families = new Map<string, { userId: string; app: string; tokens: any; ids: string[] }>();
  let skipped = 0;
  for (const acc of rows) {
    let creds: any;
    try { creds = JSON.parse(safeDecrypt(acc.passwordEnc) ?? '{}'); } catch { creds = null; }
    if (!creds?.accessToken || !creds?.refreshToken) { skipped++; continue; }
    const app = String(creds.app ?? 'legacy');
    const key = `${acc.userId}|${app}|${creds.refreshToken}`;
    const fam = families.get(key);
    if (fam) fam.ids.push(acc.id);
    else families.set(key, {
      userId: acc.userId, app, ids: [acc.id],
      tokens: { accessToken: creds.accessToken, refreshToken: creds.refreshToken,
                tokenExpiresAt: Number(creds.tokenExpiresAt ?? 0) },
    });
  }

  let made = 0, attached = 0;
  for (const fam of families.values()) {
    try {
      const id = await createTokenRecord(fam.userId, fam.app, fam.tokens, fam.ids);
      if (id) { made++; attached += fam.ids.length; }
    } catch (err: any) {
      console.error('[ctraderTokens] backfill could not create a record: ' + (err?.message ?? err));
    }
  }
  if (made) {
    console.log(`[ctraderTokens] backfill: ${made} sign-in(s) now own ${attached} account(s) — `
              + `renewing any one of them keeps the rest alive`);
  }
  if (skipped) {
    console.warn(`[ctraderTokens] backfill: ${skipped} cTrader account(s) hold no usable login and `
               + `need signing in again; they will join a record at that point`);
  }
}
