/**
 * ONE cTRADER SIGN-IN'S TOKEN, OWNED IN ONE PLACE.
 *
 * ⚠ THE DEFECT THIS EXISTS TO END. cTrader issues ONE token per sign-in, covering every trading
 * account under that cTID — not one per account. We were storing a separate COPY of it on every
 * `broker_accounts` row (`routes.ts:5035-5053` exchanges the code once, then copies the same pair
 * onto each account the sign-in returned). Renewing is SINGLE-USE: the new pair kills the old one
 * instantly (docs/ctrader-open-api-apps.md:88-89). So the first account to renew silently
 * invalidated every sibling's copy, each sibling's next renewal was refused, and — before the
 * guard added in the same change — each one erased its own login. On 25 Oct 2026 that cost four
 * accounts in a morning and crash-looped the signal platform 20 times.
 *
 * With one record behind all of them: renewing once keeps every account alive, and ONE sign-in
 * repairs the whole family.
 *
 * ⚠ NODE IS THE ONLY WRITER, and that is a standing rule, not an accident of this file
 * (docs/ctrader-open-api-apps.md:107). The scanner and the copy engine READ the current token; if
 * either ever minted its own, two writers would spend the same single-use ticket and the loser
 * would be locked out with no way back but a human sign-in.
 */
import { db } from '../db';
import { and, eq, sql } from 'drizzle-orm';
import { brokerAccounts, ctraderTokens, type CtraderToken } from '../../shared/schema';
import { safeDecrypt, safeEncrypt } from '../lib/crypto';
import { refreshAccessToken } from './brokerAdapters/ctrader';

export interface TokenSet { accessToken: string; refreshToken: string; tokenExpiresAt: number; }

/** The decrypted token plus the version it was read at — the version is what makes a safe write. */
export interface HeldToken extends TokenSet { id: string; app: string; version: number; }

/** Renew when the token has less than this left. cTrader's own TTL is ~30 days, so this is early
 *  by a wide margin — deliberately, because renewing REACTIVELY on a rejection is a dead end: by
 *  then the ticket may already be spent (docs/ctrader-open-api-apps.md:114). */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

function read(row: CtraderToken): HeldToken | null {
  try {
    const t = JSON.parse(safeDecrypt(row.tokensEnc) ?? '{}');
    if (!t?.accessToken) return null;
    return { id: row.id, app: row.app, version: row.version,
             accessToken: t.accessToken, refreshToken: t.refreshToken ?? '',
             tokenExpiresAt: Number(t.tokenExpiresAt ?? 0) };
  } catch { return null; }
}

/** Create the record for one sign-in and point the given accounts at it. */
export async function createTokenRecord(
  userId: string, app: string, tokens: TokenSet, accountIds: string[] = [],
): Promise<string | null> {
  // A record with no access token is the exact thing this whole change exists to prevent.
  if (!tokens?.accessToken) return null;
  const [row] = await db.insert(ctraderTokens).values({
    userId, app,
    tokensEnc: safeEncrypt(JSON.stringify(tokens)),
    expiresAt: tokens.tokenExpiresAt ? new Date(tokens.tokenExpiresAt) : null,
  }).returning();
  if (!row) return null;
  if (accountIds.length) await attachAccounts(row.id, accountIds);
  return row.id;
}

/**
 * Point accounts at a token record.
 *
 * CALLED WITH EVERY ACCOUNT THE SIGN-IN RETURNED, not just the one being connected — that is what
 * makes one sign-in repair the family. The sign-in already hands us the full list
 * (`routes.ts:5036`), so no extra call to cTrader is needed.
 */
export async function attachAccounts(tokenId: string, accountIds: string[]): Promise<void> {
  for (const id of accountIds) {
    if (!id) continue;
    await db.update(brokerAccounts).set({ ctraderTokenId: tokenId }).where(eq(brokerAccounts.id, id));
  }
}

/** The current token for a record, or null if it holds none. */
export async function readToken(tokenId: string): Promise<HeldToken | null> {
  const [row] = await db.select().from(ctraderTokens).where(eq(ctraderTokens.id, tokenId));
  return row ? read(row) : null;
}

/**
 * ⚠ SINGLE-FLIGHT KEYED BY THE RECORD, NOT THE ACCOUNT. The old code keyed its in-flight map by
 * `account.id`, so two accounts sharing one ticket could renew at the same moment — both would
 * spend the same single-use ticket and the loser would be holding a dead one with no way back but
 * a human sign-in. Keying on the record is what makes that impossible.
 */
const _inFlight = new Map<string, Promise<HeldToken | null>>();

export function renewToken(tokenId: string): Promise<HeldToken | null> {
  const running = _inFlight.get(tokenId);
  if (running) return running;
  const p = _renew(tokenId).finally(() => _inFlight.delete(tokenId));
  _inFlight.set(tokenId, p);
  return p;
}

async function _renew(tokenId: string): Promise<HeldToken | null> {
  const held = await readToken(tokenId);
  if (!held?.refreshToken) return null;
  let fresh;
  try {
    fresh = await refreshAccessToken(held.refreshToken, held.app);
  } catch (err: any) {
    // RECORDED, NOT SWALLOWED — a bare catch here is why 30 minutes of production logs could not
    // say why four accounts died. The record keeps its old token: the refusal may be a sibling
    // having rotated it, and a later read of the winner's write still rescues everyone.
    const why = String(err?.message ?? err);
    console.error(`[ctraderTokens] renewal FAILED for record ${tokenId.slice(0, 8)}: ${why}`);
    await db.update(ctraderTokens)
      .set({ lastError: why.slice(0, 500), lastErrorAt: new Date() })
      .where(eq(ctraderTokens.id, tokenId));
    return null;
  }
  const next: TokenSet = {
    accessToken:    fresh.accessToken,
    refreshToken:   fresh.refreshToken,
    tokenExpiresAt: Date.now() + fresh.expiresIn * 1000,
  };
  // ⚠ COMPARE-AND-SET. The write only lands if the version is still the one we read. Another
  // writer that got in first has already produced a NEWER ticket, and overwriting it with ours
  // would hand everybody a spent one.
  const updated = await db.update(ctraderTokens)
    .set({ tokensEnc: safeEncrypt(JSON.stringify(next)),
           expiresAt: new Date(next.tokenExpiresAt),
           version:   sql`${ctraderTokens.version} + 1`,
           lastError: null, lastErrorAt: null, updatedAt: new Date() })
    .where(and(eq(ctraderTokens.id, tokenId), eq(ctraderTokens.version, held.version)))
    .returning();
  if (!updated.length) {
    console.warn(`[ctraderTokens] record ${tokenId.slice(0, 8)} moved on while we renewed — `
               + `keeping the newer token rather than overwriting it`);
    return readToken(tokenId);
  }
  return read(updated[0]);
}

/** The token to use now: the stored one, renewed first if it is close to expiry. */
export async function currentToken(tokenId: string): Promise<HeldToken | null> {
  const held = await readToken(tokenId);
  if (!held) return null;
  if (held.tokenExpiresAt && held.tokenExpiresAt - Date.now() > RENEW_BEFORE_MS) return held;
  const fresh = await renewToken(tokenId);
  if (fresh) await mirrorToAccounts(tokenId, fresh);
  return fresh ?? held;
}

/**
 * ⚠ THIS IS THE LINE THAT STOPS HIM SIGNING IN FOUR TIMES. Copy the record's current token into
 * every account attached to it, so one renewal — by any one of them — repairs the whole family.
 *
 * WHY MIRROR INSTEAD OF MAKING EVERY READER GO THROUGH THE RECORD. A dozen places already read
 * `creds.accessToken` straight off the account (the credentials endpoint, the balance fetch, the
 * trade adapters, the live feed). Rewriting all of them at once would be a far larger change with
 * far more to get wrong, and leaving even ONE reading the stale copy would preserve the exact bug
 * being fixed. The record stays the single source of truth; each account keeps a cached copy of it
 * that is refreshed from the record and never renewed on its own.
 *
 * ⚠ IT NEVER CLEARS A FIELD IT DOES NOT SET. Each account's blob keeps its own `ctraderId`, `app`
 * and anything else it holds; only the three token fields are replaced.
 */
export async function mirrorToAccounts(tokenId: string, tokens: TokenSet): Promise<number> {
  if (!tokens?.accessToken) return 0;          // never write a blank login — the original defect
  const rows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ctraderTokenId, tokenId));
  let written = 0;
  for (const acc of rows) {
    try {
      const creds = JSON.parse(safeDecrypt(acc.passwordEnc) ?? '{}');
      const next = { ...creds, accessToken: tokens.accessToken,
                     refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.tokenExpiresAt };
      await db.update(brokerAccounts)
        .set({ passwordEnc: safeEncrypt(JSON.stringify(next)), syncStatus: 'ok', lastSyncError: null })
        .where(eq(brokerAccounts.id, acc.id));
      written++;
    } catch (err: any) {
      console.error(`[ctraderTokens] could not refresh the cached login on account `
                  + `${acc.id.slice(0, 8)}: ${err?.message ?? err}`);
    }
  }
  if (written > 1) {
    console.log(`[ctraderTokens] one renewal kept ${written} accounts alive — none of them needs `
              + `signing in again`);
  }
  return written;
}
