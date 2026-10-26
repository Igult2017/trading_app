/**
 * Auto-sync service — runs every 15 min for all API-connected broker accounts.
 * First sync fetches full 2-year history in a SINGLE WS connection to avoid rate limiting.
 * Subsequent syncs pull since lastSyncAt with a 2hr overlap.
 * cTrader tokens are refreshed reactively (on error) and proactively (near expiry).
 */
import { db, pool } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { RUNNING_API_ACCOUNT } from '../lib/accountFilters';
import { refreshAccountType } from './accountTypeSync';
import { fetchTradesForAccount, API_PLATFORMS } from './brokerAdapters/index';
import { processIncomingTrades } from './brokerSyncService';
import { safeDecrypt, safeEncrypt } from '../lib/crypto';
import { refreshAccessToken, fetchCTraderBalance } from './brokerAdapters/ctrader';
import { currentToken, mirrorToAccounts } from './ctraderTokenStore';
import { backfillCtraderTokenRecords } from './ctraderTokenBackfill';
import type { BrokerAccount } from '../../shared/schema';
import { storage } from '../storage';

/** Read a whole number from the environment, clamped, with a fallback. */
function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * HOW OFTEN THE SWEEP RUNS, AND HOW FAR BACK IT LOOKS — AS ONE LINKED PAIR, NOT TWO NUMBERS.
 *
 * DROPPED FROM 15 MINUTES TO DAILY, 2026-09-30. The sweep used to be the ONLY thing that recovered a
 * trade the live feed missed, which is why it had to run every 15 minutes for every account whether they
 * had traded or not — at 250 accounts that is about 1,250 history requests an hour, forever, and almost
 * every one returns nothing. That is the single largest recurring cost in the platform at scale.
 *
 * WHAT MADE IT SAFE TO DROP. Three gaps used to be invisible until the next sweep, and all three now
 * close the moment they end, in seconds:
 *   * the process restarted (a deploy) — catch-up on boot;
 *   * a socket dropped — catch-up on reconnect;
 *   * one account's session died while its socket stayed healthy — detected, then catch-up
 *     (`ctraderRealtime.onAccountLost`, docs/OPEN.md D53 and D55).
 * What is LEFT for the sweep is the one case no detector can see: an event cTrader never sent and never
 * reported an error for. That is a daily job, not a quarter-hourly one.
 *
 * ⚠ WHY THE LOOK-BACK IS DERIVED AND NOT TYPED. Written as two independent numbers, someone changes the
 * interval and not the window, and that opens exactly the hole the sweep exists to close — the likeliest
 * way this gets broken later. So the look-back is COMPUTED from the interval at 1.5×, and cannot drift
 * from it. A daily sweep therefore looks back 36 hours; a 15-minute sweep would look back 22.5 minutes.
 * The floor keeps short intervals sane.
 */
const SYNC_INTERVAL_MS = envInt('SYNC_INTERVAL_MINUTES', 24 * 60, 5, 7 * 24 * 60) * 60_000;
const LOOKBACK_RATIO   = 1.5;
const OVERLAP_MS       = Math.max(2 * 3_600_000, SYNC_INTERVAL_MS * LOOKBACK_RATIO);
const HISTORY_DAYS     = 730;   // 2 years
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
const DEEP_EVERY       = 4;                    // every 4th sweep — every 4th day on the daily timer
const PROACTIVE_MS     = 5 * 60 * 1_000; // refresh if token expires within 5 min

async function getAllApiAccounts(): Promise<BrokerAccount[]> {
  // ⚠ AND SWITCHED ON. An account he has LOGGED OUT keeps its row, its trades and its journal on
  // purpose (`accountDisconnect.ts`) — so the only thing that stops the sweep picking it back up
  // is this line. Without it, logging out would clear the tokens and the sweep would keep trying
  // the account every 15 minutes and filing the failures as errors.
  //
  // `coalesce`, not `= true`: `is_active` has a default but older rows can hold NULL, and a plain
  // comparison against NULL is NULL — which would silently drop real accounts from the sweep.
  return db.select().from(brokerAccounts).where(RUNNING_API_ACCOUNT);
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

/**
 * ⚠ A REFUSED RENEWAL MUST LEAVE THE STORED LOGIN EXACTLY AS IT WAS.
 *
 * This function used to write whatever `refreshAccessToken` handed back, and `refreshAccessToken`
 * only checked the HTTP status — but cTrader refuses a spent ticket with HTTP **200** and an error
 * body (measured 2026-10-25; see `assertTokenResponse` in brokerAdapters/ctrader.ts). So a refusal
 * was written as `accessToken: undefined`, `JSON.stringify` silently dropped the key, and the
 * account was left with NO access token — permanently "not connected" until a human signed in.
 *
 * Two guards now, because one alone would not have been enough:
 *   1. `refreshAccessToken` THROWS on a refusal, so we never reach the write.
 *   2. The write itself refuses to store credentials without an access token, so no future caller
 *      can reintroduce the same destruction from a different direction.
 *
 * AND THE REASON IS RECORDED. This was a bare `catch { return null; }` — the one error that
 * explains a platform-down condition was thrown away, which is why nothing in 30 minutes of
 * production logs said why four accounts had died.
 */
async function _refreshCTraderTokenInner(account: BrokerAccount): Promise<BrokerAccount | null> {
  const tag = `${account.platform}(${account.id.slice(0, 8)})`;

  // ── THE SHARED RECORD RENEWS FOR EVERYONE ──────────────────────────────────────────────
  // When this account belongs to a sign-in record, renewal goes through that record: it is
  // single-flighted per RECORD (so two accounts cannot both spend the same single-use ticket),
  // written with a compare-and-set, and then mirrored onto every account attached to it. One
  // renewal therefore keeps the whole family alive instead of killing the siblings.
  if (account.ctraderTokenId) {
    const fresh = await currentToken(account.ctraderTokenId);
    if (fresh) {
      await mirrorToAccounts(account.ctraderTokenId, fresh);
      const [row] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, account.id));
      return row ?? null;
    }
    // The record could not produce a token. Fall through to the per-account path rather than
    // giving up: an account connected before the record existed may still hold a working ticket.
    console.warn(`[AutoSync] ${tag} sign-in record has no usable token — trying its own copy`);
  }

  try {
    const plain = safeDecrypt(account.passwordEnc);
    if (!plain) return null;
    const creds = JSON.parse(plain);
    if (!creds.refreshToken) return null;
    const tokens = await refreshAccessToken(creds.refreshToken, creds.app);   // issuing app's creds
    // THE SECOND GUARD. Belt and braces on the one write that can destroy a credential.
    if (!tokens?.accessToken) {
      console.error(`[AutoSync] ${tag} renewal returned no access token — stored login left `
                  + `untouched rather than overwritten with a blank one`);
      await markNeedsReconnect(account, 'cTrader returned no access token on renewal');
      return null;
    }
    const newCreds = {
      ...creds,
      accessToken:    tokens.accessToken,
      refreshToken:   tokens.refreshToken,
      tokenExpiresAt: Date.now() + (tokens.expiresIn * 1000),
    };
    await db.update(brokerAccounts)
      .set({ passwordEnc: safeEncrypt(JSON.stringify(newCreds)), syncStatus: 'ok', lastSyncError: null })
      .where(eq(brokerAccounts.id, account.id));
    const [fresh] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, account.id));
    return fresh ?? null;
  } catch (err: any) {
    const why = String(err?.message ?? err);
    console.error(`[AutoSync] ${tag} token renewal FAILED: ${why}`);
    await markNeedsReconnect(account, why);
    return null;
  }
}

/**
 * Say on the account itself that it needs signing in again, and why.
 *
 * ⚠ IT RECORDS, IT DOES NOT DELETE. The stored credentials are deliberately left alone: a refusal
 * may be this account's ticket having been rotated by a sibling, and the moment that sibling's
 * renewal is written back this account can recover without a human. Erasing is what made the
 * failure permanent.
 *
 * Its own failure is swallowed ON PURPOSE and loudly — a status update must never be the thing
 * that takes down a sync sweep.
 */
async function markNeedsReconnect(account: BrokerAccount, why: string): Promise<void> {
  try {
    await db.update(brokerAccounts)
      .set({ syncStatus: 'error', lastSyncError: `Reconnect needed — ${why}`.slice(0, 500) })
      .where(eq(brokerAccounts.id, account.id));
  } catch (err: any) {
    console.error(`[AutoSync] could not record the reconnect state for ${account.id.slice(0, 8)}: `
                + (err?.message ?? err));
  }
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
    // THROUGH THE cTRADER GATE. The pool caps how many CONNECTIONS exist; this caps how many broker
    // REQUESTS are in flight across all of them, which is the thing a rate limit actually counts.
    return await withCTraderSlot(() => fetchTradesForAccount(current, fromMs, toMs));
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
      return withCTraderSlot(() => fetchTradesForAccount(fresh, fromMs, toMs));
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
  corrected?: number;               // a WRONG value the broker's own deals disproved — see below
  // Trades whose journal entry HE deleted, so no automatic sync may write it again (2026-10-04).
  // Returned rather than only logged: a filter that stops real work and says nothing is how the
  // 02 Sep defect survived a whole day looking exactly like a working sync.
  skippedDeleted?: number;
  error?: string;
}

export async function syncAccount(account: BrokerAccount,
                                  // `manual` — HE pressed Sync, so a trade whose journal entry he
                                  // deleted is rebuilt rather than skipped (his 2026-09-06 rule).
                                  // Absent = a timer, which respects the deletion.
                                  // `full` — HE pressed "Re-sync everything", so the window is the
                                  // whole history rather than a step back from the last sync.
                                  opts: { deep?: boolean; manual?: boolean; full?: boolean } = {},
                                 ): Promise<SyncOutcome> {
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
  // ⚠ AND ONE HE HAS LOGGED OUT OF — THE LINE THAT PROTECTS THE LOG-OUT STATE ITSELF. The sweep
  // no longer offers such an account (`lib/accountFilters.RUNNING_API_ACCOUNT`), but this function
  // is also called directly: by the Sync button, by Sync All, and by the missed-close watcher.
  // Without this, pressing Sync on a logged-out account would run with no credentials, fail, and
  // write `sync_status = 'error'` over `'disconnected'` — so the row would stop saying it was
  // logged out and start claiming it was broken.
  if (account.isActive === false) {
    console.log(`[AutoSync] ${tag}: skipped — logged out; its trades and journal are kept and it `
              + `resumes from ${account.lastSyncAt ? account.lastSyncAt.toISOString() : 'the start'}`);
    return { ok: false, skipped: 'this account is logged out — reconnect it to resume syncing' };
  }

  await db.update(brokerAccounts).set({ syncStatus: 'syncing' }).where(eq(brokerAccounts.id, account.id));

  // ⚠ ASK THE BROKER WHETHER THIS IS DEMO OR LIVE, BEFORE USING THE ANSWER. His instruction,
  // 2026-10-26: *"When syncing accounts request ctrader for account status as Demo or Live."*
  // It has to happen HERE, before the fetch below, because the stored value is what picks which
  // cTrader server that fetch talks to — correcting it afterwards would mean this sync still ran
  // against the wrong one. Costs one lookup per sign-in per sweep, not one per account.
  if (account.platform.toLowerCase() === 'ctrader' && account.passwordEnc) {
    try {
      account = await refreshAccountType(account, JSON.parse(safeDecrypt(account.passwordEnc) ?? '{}'));
    } catch { /* unreadable credentials are the next step's problem, not this one's */ }
  }

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

    // ⚠ THE FULL HISTORY USED TO BE REACHABLE ONLY BY ACCIDENT (2026-10-26). It applied when an
    // account had never synced, and in no other case — so once an account had a last-sync mark
    // there was no way to say "fetch everything again". His ask: *"a functioning button that
    // enables one to sync the entire data from ctrader account again if for some reasons that is
    // required."* `full` is that button, and it ignores the mark rather than clearing it.
    const full   = opts.full === true || isNew;
    const fromMs = full
      ? now - HISTORY_DAYS * 86_400_000                      // the whole history
      : Math.max(account.lastSyncAt!.getTime() - (deep ? DEEP_LOOKBACK_MS : OVERLAP_MS), 0);
    // THE LABEL IS COMPUTED, NOT TYPED. It read a hardcoded '2h' while the window is
    // `OVERLAP_MS` — 36 hours on the daily timer (see the note on LOOKBACK_RATIO). A log line
    // that misreports the window is worse than none, because it is the line anyone diagnosing a
    // missing trade reads first.
    const incremental = `${Math.round(OVERLAP_MS / 3_600_000)}h back from the last sync`;
    const window = isNew ? 'first sync, FULL 2y'
                 : full  ? 'FULL 2y — re-sync everything'
                 : deep  ? 'DEEP 7d back from the last sync'
                         : incremental;
    console.log(`[AutoSync] ${tag}: fetching ${new Date(fromMs).toISOString()} -> `
                + `${new Date(now).toISOString()} (${window})`);

    const raw = await fetchWithRetry(account, fromMs, now);
    let counts = { created: 0, duplicates: 0, journaled: 0, healed: 0, backfilled: 0, corrected: 0,
                   skippedDeleted: 0 };
    if (raw.length) {
      counts = await processIncomingTrades(account.id, account.userId, raw,
                                          { manual: opts.manual });
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
                                         + `feed could not supply` : '')
                  // A CORRECTION IS NOT A BACKFILL AND MUST NOT BE REPORTED AS ONE. This counts a
                  // value that was WRONG and has been overwritten — a direction stored the wrong way
                  // round, or a P&L with the wrong sign (his EUR/USD long stored as a short, its $51
                  // loss recorded as a $51 win). It was counted and never returned, so the single
                  // most serious thing this pipeline does happened silently.
                  + (counts.corrected ? `, ${counts.corrected} CORRECTED (a stored value the `
                                        + `broker's own deals disproved)` : '')
                  // ONE COUNT PER ACCOUNT, NOT ONE ROW PER TRADE PER TICK. The skip has to be
                  // visible — a guard that stops real work in silence is its own defect — but an
                  // audit row every 15 minutes for every trade he has ever deleted would be ~96 a
                  // day each. So: counted here, and written to `sync_events` once, at the moment he
                  // deleted it.
                  + (counts.skippedDeleted ? `, ${counts.skippedDeleted} left alone (he deleted `
                                             + `their journal entries — press Sync to rebuild)` : ''));
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

/**
 * HOW MANY ACCOUNTS MAY BE RECONCILED AT ONCE.
 *
 * The loop below used to start EVERY account and wait for none of them. At four accounts that is
 * invisible; at 250 it is 250 syncs querying the database at the same moment.
 *
 * ⚠ THE CEILING IS NOT OURS TO PICK FREELY. `server/db.ts:65` allows **20 database connections and
 * gives up after 3 seconds**, and every web request shares those 20 — so a sweep that helps itself to
 * all of them does not just slow down, it starts failing page loads. (The comment there claims
 * "20 per process × PM2 workers = ~160 total"; that is wrong for production, which runs ONE plain Node
 * process — `start.sh:69`.)
 *
 * 4 leaves the clear majority of the pool for actual users, and is still 4× the cTrader side's own
 * limit of one socket at a time per account. Raise it only against a measurement.
 */
/**
 * THREE SEPARATE LIMITS, NOT ONE — the reviewer's item 9, and the plan named all three.
 *
 * One number cannot express this, because the three things being protected fail differently:
 *   * ACCOUNTS  — how many are being reconciled at once. Bounds the work in flight.
 *   * cTRADER   — how many broker requests are in flight. The scarce budget is 5 per second for
 *                  history, so a burst here is what earns a rate-limit refusal.
 *   * DATABASE  — how many queries are in flight. ⚠ NOT ours to choose freely: the pool allows 20 and
 *                  gives up after 3 seconds (`db.ts:65`), and EVERY page load shares those 20. A sweep
 *                  that takes them all does not run slowly, it fails real users' requests.
 *
 * The defaults deliberately leave the clear majority of the database pool for actual users.
 */
const SWEEP_WORKERS  = envInt('SYNC_SWEEP_WORKERS', 4, 1, 16);
const CTRADER_INFLIGHT = envInt('SYNC_MAX_CTRADER_INFLIGHT', 4, 1, 8);
const DB_INFLIGHT      = envInt('SYNC_MAX_DB_INFLIGHT', 6, 1, 12);

/**
 * A plain counting gate: at most `max` holders at once, the rest wait in line.
 *
 * Deliberately not a library. It is fifteen lines, it is used in two places, and a dependency here
 * would be more surface than the problem.
 */
function gate(max: number, label: string) {
  let held = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (held >= max) await new Promise<void>(r => queue.push(r));
    held++;
    try { return await fn(); }
    finally {
      held--;
      const next = queue.shift();
      if (next) next();
      else if (held === 0 && queue.length) console.warn(`[AutoSync] ${label} gate drained oddly`);
    }
  };
}

/** Shared by every sweep, so limits apply ACROSS accounts and not per account. */
export const withCTraderSlot = gate(CTRADER_INFLIGHT, 'ctrader');
export const withDbSlot      = gate(DB_INFLIGHT, 'database');


async function syncAllAccounts(): Promise<void> {
  const accounts = await getAllApiAccounts();
  // WITHOUT THIS LINE THERE IS NO PROOF THE SWEEP EVER RAN. "[AutoSync] Starting" appeared once at
  // boot and then 2h44m of production log held not one further word about syncing — so "the sweep
  // is running and finding nothing" and "the sweep died at the first line" looked identical.
  console.log(`[AutoSync] sweep: ${accounts.length} API-connected account(s) to check, `
              + `${SWEEP_WORKERS} at a time`);

  const started = Date.now();
  await runWithWorkers(accounts, SWEEP_WORKERS, syncOne);
  console.log(`[AutoSync] sweep finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

/**
 * Run `fn` over every item with at most `workers` of them in flight at once.
 *
 * A FIXED NUMBER OF WORKERS SHARING ONE QUEUE, rather than one promise per item. Each worker takes the
 * next item only when it has finished the last, so the number in flight can never exceed `workers` no
 * matter how many items there are — which is the property `Promise.all(items.map(fn))` does not have.
 *
 * EXPORTED SO THE LIMIT CAN BE PROVEN BY RUNNING IT, not by reading it. The thing worth protecting here
 * is a number that is invisible at four accounts and harmful at 250, so a test that actually counts
 * what is in flight is worth more than one that greps for the word "worker".
 */
export async function runWithWorkers<T>(
  items: readonly T[], workers: number, fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const worker = async (): Promise<void> => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, queue.length)) }, worker));
}

async function syncOne(account: BrokerAccount): Promise<void> {
  {
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
    // Recording twice is impossible, AND THE DATABASE IS NOW WHAT MAKES IT SO (29 Sep, docs/OPEN.md
    // D52). This used to rest entirely on `processIncomingTrades` looking before it inserted, which
    // cannot close the gap between the look and the insert — and the feed and this sweep can both be
    // inside that gap. `synced_trades_account_external_key` closes it.
    //
    // THE ERROR IS LOGGED, NOT SWALLOWED. `.catch(() => {})` meant anything that threw before
    // syncAccount's own try/except vanished without trace.
    await syncAccount(account).catch(err =>
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

/**
 * SAY OUT LOUD WHETHER THE DATABASE IS ACTUALLY REFUSING DUPLICATE TRADES.
 *
 * `synced_trades_account_external_key` is what stops the live feed and this sweep both writing the
 * same trade (docs/OPEN.md D52). It is created by `docker-migrate.sql`, which runs at boot as
 * `psql -f ... || echo "Migration warning (non-fatal)"` (start.sh:17) — so a migration that fails does
 * NOT stop the container, and the protection would simply be absent.
 *
 * `createSyncedTrade` is deliberately written to survive that (it degrades to the old behaviour rather
 * than throwing), which is right — trade recording must never be what breaks — but it also means the
 * loss of protection would be SILENT. Hence one line at boot, so "are we protected?" is answerable
 * from the log instead of by guessing.
 */
async function reportDuplicateGuard(): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'synced_trades'
         AND indexname = 'synced_trades_account_external_key'`);
    if (r.rowCount) console.log('[AutoSync] duplicate guard: ON — the database refuses a second copy '
                                + 'of the same broker trade');
    else console.error('[AutoSync] ⚠ duplicate guard MISSING — synced_trades_account_external_key is '
                     + 'not present, so only the application check stands between the live feed and a '
                     + 'doubled trade. Check the migration output above for a failure.');
  } catch (err: any) {
    console.error('[AutoSync] could not check the duplicate guard: ' + (err?.message ?? err));
  }
}

export function startAutoSync(): void {
  console.log(`[AutoSync] Starting — every ${SYNC_INTERVAL_MS / 60_000} min for all API-connected `
              + `accounts, looking back ${(OVERLAP_MS / 3_600_000).toFixed(1)}h `
              + `(${LOOKBACK_RATIO}x the interval, derived — the two cannot drift apart)`);
  console.log(`[AutoSync] limits — ${SWEEP_WORKERS} account(s), ${CTRADER_INFLIGHT} cTrader request(s), `
              + `${DB_INFLIGHT} database query(ies) in flight at once (the database allows 20 in total, `
              + `shared with every page load)`);
  void reportDuplicateGuard();
  // THE OUTERMOST SWALLOW, AND THE WORST OF THEM. `.catch(() => {})` here covers
  // `getAllApiAccounts()` — one failed database read and the entire sweep stops for ever, on the
  // boot run AND on every 15-minute tick after it, without a single character in the log.
  const sweep = () => syncAllAccounts().catch(err =>
    console.error('[AutoSync] SWEEP FAILED — no account was synced this round: '
                  + (err?.message ?? err)));
  // BOOT ORDER, AND IT MATTERS. The backfill gives accounts connected before 25 Oct 2026 a shared
  // sign-in record; the repair then corrects any account filed under the wrong connection type.
  // Both run BEFORE the first sweep, so that sweep already sees a corrected, grouped picture — and
  // each step's failure is logged and stepped over rather than taking the sweep down with it.
  const bootSteps = async () => {
    try { await backfillCtraderTokenRecords(); }
    catch (err: any) { console.error('[AutoSync] cTrader token backfill failed: ' + (err?.message ?? err)); }
    try { await repairApiConnectionType(); }
    catch (err: any) { console.error('[AutoSync] connectionType repair failed: ' + (err?.message ?? err)); }
  };
  void bootSteps().finally(sweep);
  setInterval(sweep, SYNC_INTERVAL_MS);
}
