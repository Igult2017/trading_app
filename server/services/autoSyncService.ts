/**
 * Auto-sync service — runs every 15 min for all API-connected broker accounts.
 * First sync pulls 2 years of history (60-day batches).
 * Subsequent syncs pull only since lastSyncAt (with 2hr overlap).
 * cTrader tokens are refreshed reactively (on error) and proactively (near expiry).
 */
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { fetchTradesForAccount, API_PLATFORMS } from './brokerAdapters/index';
import { processIncomingTrades } from './brokerSyncService';
import { safeDecrypt, safeEncrypt } from '../lib/crypto';
import { refreshAccessToken } from './brokerAdapters/ctrader';
import type { BrokerAccount } from '../../shared/schema';

const SYNC_INTERVAL_MS = 15 * 60 * 1_000;
const CHUNK_DAYS       = 60;
const HISTORY_DAYS     = 730;   // 2 years
const OVERLAP_MS       = 2 * 3_600_000;
const PROACTIVE_MS     = 5 * 60 * 1_000; // refresh if token expires within 5 min

async function getAllApiAccounts(): Promise<BrokerAccount[]> {
  return db.select().from(brokerAccounts).where(eq(brokerAccounts.connectionType, 'api'));
}

async function refreshCTraderToken(account: BrokerAccount): Promise<BrokerAccount | null> {
  try {
    const plain = safeDecrypt(account.passwordEnc);
    if (!plain) return null;
    const creds = JSON.parse(plain);
    if (!creds.refreshToken) return null;
    const tokens = await refreshAccessToken(creds.refreshToken);
    const newCreds = {
      ...creds,
      accessToken:      tokens.accessToken,
      refreshToken:     tokens.refreshToken,
      tokenExpiresAt:   Date.now() + (tokens.expiresIn * 1000),
    };
    await db.update(brokerAccounts)
      .set({ passwordEnc: safeEncrypt(JSON.stringify(newCreds)) })
      .where(eq(brokerAccounts.id, account.id));
    const [fresh] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, account.id));
    return fresh ?? null;
  } catch {
    return null;
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

export async function syncAccount(account: BrokerAccount): Promise<void> {
  if (!API_PLATFORMS.has(account.platform.toLowerCase())) return;
  // Skip placeholder accounts awaiting OAuth completion
  if (account.loginId?.startsWith('pending_')) return;

  await db.update(brokerAccounts).set({ syncStatus: 'syncing' }).where(eq(brokerAccounts.id, account.id));

  try {
    const now   = Date.now();
    const isNew = !account.lastSyncAt;

    if (isNew) {
      const start = now - HISTORY_DAYS * 86_400_000;
      for (let t = start; t < now; t += CHUNK_DAYS * 86_400_000) {
        const raw = await doFetch(account, t, Math.min(t + CHUNK_DAYS * 86_400_000, now));
        if (raw.length) await processIncomingTrades(account.id, account.userId, raw);
      }
    } else {
      const fromMs = Math.max(account.lastSyncAt!.getTime() - OVERLAP_MS, 0);
      const raw    = await doFetch(account, fromMs, now);
      if (raw.length) await processIncomingTrades(account.id, account.userId, raw);
    }

    await db.update(brokerAccounts)
      .set({ syncStatus: 'ok', lastSyncAt: new Date(), lastSyncError: null as any })
      .where(eq(brokerAccounts.id, account.id));
  } catch (err: any) {
    await db.update(brokerAccounts)
      .set({ syncStatus: 'error', lastSyncError: (err.message ?? 'Sync failed').slice(0, 255) })
      .where(eq(brokerAccounts.id, account.id));
    console.error(`[AutoSync] ${account.platform}(${account.id}): ${err.message}`);
  }
}

async function syncAllAccounts(): Promise<void> {
  const accounts = await getAllApiAccounts();
  for (const account of accounts) {
    syncAccount(account).catch(() => {});
  }
}

export function startAutoSync(): void {
  console.log('[AutoSync] Starting — 15-min interval for all API-connected accounts');
  syncAllAccounts().catch(() => {});
  setInterval(() => syncAllAccounts().catch(() => {}), SYNC_INTERVAL_MS);
}
