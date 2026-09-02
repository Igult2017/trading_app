/**
 * Auto-sync service — runs every 15 min for all API-connected broker accounts.
 * First sync fetches full 2-year history in a SINGLE WS connection to avoid rate limiting.
 * Subsequent syncs pull since lastSyncAt with a 2hr overlap.
 * cTrader tokens are refreshed reactively (on error) and proactively (near expiry).
 */
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { fetchTradesForAccount, API_PLATFORMS } from './brokerAdapters/index';
import { processIncomingTrades } from './brokerSyncService';
import { safeDecrypt, safeEncrypt } from '../lib/crypto';
import { refreshAccessToken, fetchCTraderBalance } from './brokerAdapters/ctrader';
import type { BrokerAccount } from '../../shared/schema';
import { storage } from '../storage';

const SYNC_INTERVAL_MS = 15 * 60 * 1_000;
const HISTORY_DAYS     = 730;   // 2 years
const OVERLAP_MS       = 2 * 3_600_000;
// A DEEPER SWEEP, PERIODICALLY, SO A MISSED TRADE CAN HEAL ITSELF.
//
// The incremental window only ever looks back `OVERLAP_MS` from the last successful sync. That is
// fine while every sync works — but a trade missed ONCE (the platform down at the moment it closed,
// a fetch that returned nothing, a write that failed) falls behind the window and is then NEVER
// looked at again. On 02 Sep a real GBP/USD position closed at 11:09 and no journal entry appeared;
// nothing in the design would ever have re-tried it.
//
// Recording is idempotent — `processIncomingTrades` de-duplicates on externalId + brokerAccountId —
// so looking further back costs a slightly larger fetch and can never double-record. Every
// DEEP_EVERY-th sync therefore reaches back DEEP_LOOKBACK_MS instead of the usual two hours.
const DEEP_LOOKBACK_MS = 7 * 24 * 3_600_000;   // one week
const DEEP_EVERY       = 4;                    // = once an hour on the 15-minute timer
const PROACTIVE_MS     = 5 * 60 * 1_000; // refresh if token expires within 5 min

async function getAllApiAccounts(): Promise<BrokerAccount[]> {
  return db.select().from(brokerAccounts).where(eq(brokerAccounts.connectionType, 'api'));
}

// Coalesce concurrent refreshes for the SAME account into ONE /apps/token call. cTrader
// rotates the refresh token on every use, so two overlapping refreshes (a manual sync and
// the health watchdog, or sync + balance fetch near expiry) race — the loser sends an
// already-rotated refresh token and fails, which surfaced as flaky "Sync failed". One shared
// in-flight promise also avoids the /apps/token 429 storm that the scanner hit before.
const _refreshInFlight = new Map<string, Promise<BrokerAccount | null>>();

export function refreshCTraderToken(account: BrokerAccount): Promise<BrokerAccount | null> {
  const inflight = _refreshInFlight.get(account.id);
  if (inflight) return inflight;
  const p = _refreshCTraderTokenInner(account).finally(() => _refreshInFlight.delete(account.id));
  _refreshInFlight.set(account.id, p);
  return p;
}

async function _refreshCTraderTokenInner(account: BrokerAccount): Promise<BrokerAccount | null> {
  try {
    const plain = safeDecrypt(account.passwordEnc);
    if (!plain) return null;
    const creds = JSON.parse(plain);
    if (!creds.refreshToken) return null;
    const tokens = await refreshAccessToken(creds.refreshToken, creds.app);   // issuing app's creds
    const newCreds = {
      ...creds,
      accessToken:    tokens.accessToken,
      refreshToken:   tokens.refreshToken,
      tokenExpiresAt: Date.now() + (tokens.expiresIn * 1000),
    };
    await db.update(brokerAccounts)
      .set({ passwordEnc: safeEncrypt(JSON.stringify(newCreds)) })
      .where(eq(brokerAccounts.id, account.id));
    const [fresh] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, account.id));
    return fresh ?? null;
  } catch { return null; }
}

async function doFetch(account: BrokerAccount, fromMs: number, toMs: number) {
  let current = account;

  // Proactive refresh: renew token before it expires
  if (current.platform.toLowerCase() === 'ctrader' && current.passwordEnc) {
    try {
      const creds = JSON.parse(safeDecrypt(current.passwordEnc) ?? '{}');
      if (creds.tokenExpiresAt && (creds.tokenExpiresAt - Date.now()) < PROACTIVE_MS) {
        const fresh = await refreshCTraderToken(current);
        if (fresh) current = fresh;
      }
    } catch { /* ignore parse errors */ }
  }

  try {
    return await fetchTradesForAccount(current, fromMs, toMs);
  } catch (err: any) {
    const msg        = String(err.message ?? '');
    const isTokenErr = current.platform.toLowerCase() === 'ctrader' && (
      msg.includes('401') ||
      msg.includes('ACCESS_TOKEN_INVALID') ||
      msg.includes('ACCESS_TOKEN_EXPIRED') ||
      msg.includes('AUTHENTICATION_FAILURE')
    );
    if (isTokenErr) {
      const fresh = await refreshCTraderToken(current);
      if (!fresh) throw err;
      return fetchTradesForAccount(fresh, fromMs, toMs);
    }
    throw err;
  }
}

// One retry on transient cTrader WS hiccups (connect/read timeouts, dropped sockets, rate
// limits) — common on cTrader's public WS, and otherwise they fail the entire sync. Real
// errors (auth, no account) are not retried; token errors are already handled inside doFetch.
async function fetchWithRetry(account: BrokerAccount, fromMs: number, toMs: number) {
  try {
    return await doFetch(account, fromMs, toMs);
  } catch (err: any) {
    const m = String(err?.message ?? '');
    if (/timeout|WS connect|ECONNRESET|ETIMEDOUT|socket hang|rate|429/i.test(m)) {
      await new Promise(r => setTimeout(r, 1500));
      return doFetch(account, fromMs, toMs);
    }
    throw err;
  }
}

async function updateCTraderBalance(account: BrokerAccount): Promise<void> {
  try {
    // Re-fetch from DB — token may have been refreshed during the preceding sync
    const [fresh] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, account.id));
    const creds = JSON.parse(safeDecrypt(fresh?.passwordEnc ?? account.passwordEnc) ?? '{}');
    if (!creds.accessToken || !creds.ctraderId) return;
    const isLive = (fresh ?? account).accountType?.toLowerCase() !== 'demo';
    const bal = await fetchCTraderBalance(creds.accessToken, creds.ctraderId, isLive, creds.app);
    if (bal !== null) {
      await db.update(brokerAccounts)
        .set({ balance: String(bal.balance), currency: bal.currency || (fresh ?? account).currency })
        .where(eq(brokerAccounts.id, account.id));
      // ...and into the account's session, if it never got a starting balance. This is the path
      // that fixes accounts connected BEFORE the seeding existed: the next sync fills them in.
      await storage.seedSessionStartingBalance(account.id, bal.balance);
    }
  } catch { /* balance update is best-effort */ }
}

// How many times each account has synced this process — drives the periodic deep sweep above.
const _syncCount = new Map<string, number>();

/** What one sync did — so the manual button can report it instead of saying "started". */
export interface SyncOutcome {
  ok: boolean;
  skipped?: string;                 // why nothing was attempted
  fetched?: number;                 // closed trades the broker returned
  created?: number; duplicates?: number; journaled?: number;
  healed?: number;                  // stored before, but had no journal entry until now
  backfilled?: number;              // fields filled in that the live feed could not supply
  error?: string;
}

export async function syncAccount(account: BrokerAccount,
                                  opts: { deep?: boolean } = {}): Promise<SyncOutcome> {
  const tag = `${account.platform}(${account.id.slice(0, 8)})`;
  // THESE TWO SKIPS WERE SILENT, and silence is why this could go a day without anyone noticing
  // the sync had recorded nothing: a skipped account looked exactly like a working one.
  if (!API_PLATFORMS.has(account.platform.toLowerCase())) {
    console.log(`[AutoSync] ${tag}: skipped — no API adapter for this platform`);
    return { ok: false, skipped: `no API adapter for ${account.platform}` };
  }
  if (account.loginId?.startsWith('pending_')) {
    console.log(`[AutoSync] ${tag}: skipped — OAuth never completed (loginId still 'pending_')`);
    return { ok: false, skipped: 'this account never finished connecting (OAuth incomplete)' };
  }

  await db.update(brokerAccounts).set({ syncStatus: 'syncing' }).where(eq(brokerAccounts.id, account.id));

  try {
    const now   = Date.now();
    const isNew = !account.lastSyncAt;

    // EVERY SYNC NOW SAYS WHAT IT DID. None of this used to be logged — not the window, not how
    // many deals came back, not how many trades were recorded — so a sync that silently found
    // nothing was indistinguishable from one that worked. That is why "it has not autorecorded
    // anything" could not be answered from the log at all, and it is fixed first because every
    // other diagnosis depends on being able to see this.
    const n = (_syncCount.get(account.id) ?? 0) + 1;
    _syncCount.set(account.id, n);
    const deep = opts.deep === true || (n % DEEP_EVERY === 1);

    const fromMs = isNew
      ? now - HISTORY_DAYS * 86_400_000                      // first ever sync: the full history
      : Math.max(account.lastSyncAt!.getTime() - (deep ? DEEP_LOOKBACK_MS : OVERLAP_MS), 0);
    const window = isNew ? 'first sync, 2y'
                         : `${deep ? 'DEEP 7d' : '2h'} back from the last sync`;
    console.log(`[AutoSync] ${tag}: fetching ${new Date(fromMs).toISOString()} -> `
                + `${new Date(now).toISOString()} (${window})`);

    const raw = await fetchWithRetry(account, fromMs, now);
    let counts = { created: 0, duplicates: 0, journaled: 0, healed: 0, backfilled: 0 };
    if (raw.length) {
      counts = await processIncomingTrades(account.id, account.userId, raw);
      console.log(`[AutoSync] ${tag}: ${raw.length} closed trade(s) from the broker -> `
                  + `${counts.created} recorded, ${counts.duplicates} already had, `
                  + `${counts.journaled} journaled`
                  + (counts.healed ? `, ${counts.healed} HEALED (stored before, but had no journal `
                                     + `entry until now)` : '')
                  // "backfilled" counts the open time, the risk as placed AND the order type now.
                  // It used to say "given the open time", which was true when that was the only one
                  // and became a lie the moment a second was added — exactly the kind of log line
                  // that sends a future diagnosis the wrong way.
                  + (counts.backfilled ? `, ${counts.backfilled} field(s) filled in that the live `
                                         + `feed could not supply` : ''));
    } else {
      console.log(`[AutoSync] ${tag}: the broker returned no closed trades in that window`);
    }

    await db.update(brokerAccounts)
      .set({ syncStatus: 'ok', lastSyncAt: new Date(), lastSyncError: null as any })
      .where(eq(brokerAccounts.id, account.id));

    // Refresh balance after sync — delay 3s so cTrader's rate-limit window clears
    if (account.platform.toLowerCase() === 'ctrader') {
      setTimeout(() => updateCTraderBalance(account).catch(() => {}), 3000);
    }
    return { ok: true, fetched: raw.length, ...counts };
  } catch (err: any) {
    await db.update(brokerAccounts)
      .set({ syncStatus: 'error', lastSyncError: (err.message ?? 'Sync failed').slice(0, 255) })
      .where(eq(brokerAccounts.id, account.id));
    console.error(`[AutoSync] ${account.platform}(${account.id}): ${err.message}`);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function syncAllAccounts(): Promise<void> {
  const accounts = await getAllApiAccounts();
  // WITHOUT THIS LINE THERE IS NO PROOF THE SWEEP EVER RAN. "[AutoSync] Starting" appeared once at
  // boot and then 2h44m of production log held not one further word about syncing — so "the sweep
  // is running and finding nothing" and "the sweep died at the first line" looked identical.
  console.log(`[AutoSync] sweep: ${accounts.length} API-connected account(s) to check`);
  for (const account of accounts) {
    // cTRADER IS INCLUDED AGAIN (31 Aug 2026), and this is the SAFETY NET under trade recording.
    //
    // It used to be skipped here — "cTrader has strict WS rate limits, only sync on connect or
    // manual trigger, never on timer" — which left the live push feed as the ONLY ongoing way a
    // cTrader trade was ever recorded. That is fine while the feed is up and silently lossy when it
    // is not: a dropped socket, a deploy, a restart, and any trade that closes in the gap is never
    // recorded at all. His ask was *"make sure that all trades that are autotraded are recorded"*,
    // and autotrade's own trades close on exactly this path.
    //
    // The rate-limit reason is genuinely handled now rather than argued away: every cTrader socket
    // Node opens takes a lease from `ctraderConnPool` (cap 8, feeds outrank tasks), so these syncs
    // queue instead of storming the broker — which is also why the un-awaited loop below is safe.
    // A sync here is CHEAP: with `lastSyncAt` set it asks only for the window since the last one.
    //
    // Recording twice is impossible: `processIncomingTrades` de-duplicates on
    // externalId + brokerAccountId, so the feed and this sync cannot both file the same deal.
    // THE ERROR IS LOGGED, NOT SWALLOWED. `.catch(() => {})` meant anything that threw before
    // syncAccount's own try/except vanished without trace.
    syncAccount(account).catch(err =>
      console.error(`[AutoSync] ${account.platform}(${account.id.slice(0, 8)}) sweep failed: `
                    + (err?.message ?? err)));
  }
}

/**
 * REPAIR ACCOUNTS THAT ARE API-CONNECTED BUT NOT FILED AS SUCH — and start their live feed.
 *
 * `connection_type` defaults to 'webhook', and until today nothing in the cTrader OAuth flow ever
 * set it to 'api'. An account could therefore hold working OAuth tokens and still be invisible to
 * all three things that test for exactly 'api': this sweep, the live push feed, and the feed's
 * boot-time subscriber list. Fixing the two OAuth writes stops it happening again; it does nothing
 * for a row already sitting in the database with the wrong value, and that row is the live account.
 *
 * THE TEST IS THE CREDENTIALS, NOT THE LABEL. An account with a cTrader access token and account id
 * IS API-connected — that is what the word means — so the label is corrected to match the fact
 * rather than the other way round. Accounts without tokens are left exactly as they are, so a
 * genuine webhook/EA account is never touched.
 *
 * Runs once per boot, before the first sweep. It is idempotent: after the first run it matches
 * nothing and costs one indexed query.
 */
async function repairApiConnectionType(): Promise<void> {
  const rows = await db.select().from(brokerAccounts)
    .where(eq(brokerAccounts.platform, 'ctrader'));
  const broken = rows.filter(a => a.connectionType !== 'api' && !a.loginId?.startsWith('pending_'))
    .filter(a => {
      try {
        const c = JSON.parse(safeDecrypt(a.passwordEnc) ?? '{}');
        return Boolean(c.accessToken && c.ctraderId);   // real OAuth credentials = API-connected
      } catch { return false; }
    });
  if (!broken.length) return;

  for (const a of broken) {
    await db.update(brokerAccounts).set({ connectionType: 'api' }).where(eq(brokerAccounts.id, a.id));
    console.log(`[AutoSync] REPAIRED ${a.platform}(${a.id.slice(0, 8)}): connectionType `
                + `'${a.connectionType}' -> 'api' — it holds cTrader OAuth credentials, so the sync `
                + `sweep and the live trade feed were both skipping it`);
  }
  // ...and start the live feed they were being denied. Imported dynamically: ctraderRealtime
  // imports this module, so a static import here would be a cycle.
  try {
    const { addCTraderAccount } = await import('./ctraderRealtime');
    for (const a of broken) addCTraderAccount(a.id);
  } catch (err: any) {
    console.error('[AutoSync] repaired the accounts but could not start their live feed: '
                  + (err?.message ?? err));
  }
}

export function startAutoSync(): void {
  console.log('[AutoSync] Starting — 15-min interval for all API-connected accounts');
  // THE OUTERMOST SWALLOW, AND THE WORST OF THEM. `.catch(() => {})` here covers
  // `getAllApiAccounts()` — one failed database read and the entire sweep stops for ever, on the
  // boot run AND on every 15-minute tick after it, without a single character in the log.
  const sweep = () => syncAllAccounts().catch(err =>
    console.error('[AutoSync] SWEEP FAILED — no account was synced this round: '
                  + (err?.message ?? err)));
  // The repair runs FIRST, so the boot sweep already sees any account it just corrected.
  repairApiConnectionType()
    .catch(err => console.error('[AutoSync] connectionType repair failed: ' + (err?.message ?? err)))
    .finally(sweep);
  setInterval(sweep, SYNC_INTERVAL_MS);
}
