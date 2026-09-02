/**
 * cTrader real-time trade recorder
 * ────────────────────────────────
 * The instant a position closes, the deal is fed into `processIncomingTrades` — the SAME pipeline as
 * manual/connect sync, so it is deduped (by externalId) and auto-journaled. Safe beside the existing
 * sync: a trade can never be recorded twice.
 *
 * THIS IS NOT AN OPTIONAL CONVENIENCE. It is how a closed trade reaches the journal in SECONDS
 * rather than at the next 15-minute sweep, and it is the only route at all while that sweep is
 * between runs. (cTrader was excluded from the timer until 31 Aug 2026, when this feed really was
 * the ONLY sync there was; `autoSyncService.syncAllAccounts` now includes it as the safety net
 * underneath.) A feed that quietly fails to open costs freshness, not the trade — which is why
 * feeds still outrank transient work in the connection pool.
 *
 * THE TWO ROUTES CANNOT DOUBLE-RECORD. Both key a closed position on its CLOSING deal id, and
 * `processIncomingTrades` de-duplicates on externalId + brokerAccountId, so whichever arrives second
 * is discarded.
 *
 * SOCKETS ARE NO LONGER ONE-PER-ACCOUNT. They live in `ctraderHub`, which puts many accounts on one
 * socket so connection count stops growing with the user base. This file owns the LIFECYCLE — which
 * accounts should be connected, what happens to a trade, and recovery — and holds no sockets itself.
 *
 * Push-only (no polling); the only periodic outbound message is a 10s heartbeat, per socket rather
 * than per account. Resilience: reconnect with backoff, one-shot token refresh on auth-expiry
 * (2142), and a 60s reconcile that self-heals missed connects and prunes deleted accounts. Feeds run
 * on the PRIMARY worker only (cluster-safe).
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { brokerAccounts } from '../../shared/schema';
import type { BrokerAccount } from '../../shared/schema';
import { safeDecrypt } from '../lib/crypto';
import { processIncomingTrades } from './brokerSyncService';
import { notificationService } from './notificationService';
import { refreshCTraderToken } from './autoSyncService';
import { mapClosedDeal, mapClosedFromEvent } from './brokerAdapters/ctrader';
import { logUtilisation, stats } from './ctraderConnPool';
import {
  attach, detach, isAttached, attachedIds, hubStats, logRoutingEvidence,
  ACCOUNTS_PER_CONN, type Member,
} from './ctraderHub';

const RECONNECT_MS = 15_000;
const RECONCILE_MS = 60_000;
const connecting = new Set<string>();    // ids mid-handshake (blocks double-connect)
// Feeds live only on the primary worker (mirrors index.ts) so PM2 cluster mode can't open duplicate
// sockets; non-primary workers no-op and the primary's reconcile loop adopts any account they
// connect/delete within RECONCILE_MS.
const IS_PRIMARY = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

async function loadAccount(id: string): Promise<BrokerAccount | null> {
  const [a] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, id));
  return a ?? null;
}

function scheduleReconnect(id: string): void {
  setTimeout(() => { connect(id).catch(() => {}); }, RECONNECT_MS);
}

/** Every account that shared a dropped socket comes back together. */
function onHubLost(accountIds: string[]): void {
  console.warn(`[cTraderRT] socket dropped carrying ${accountIds.length} account(s) — reconnecting`);
  accountIds.forEach(scheduleReconnect);
}

/** Idempotent connect — guards against concurrent attempts for the same account. */
async function connect(id: string, attempt = 0): Promise<void> {
  if (isAttached(id) || connecting.has(id)) return;
  connecting.add(id);
  try { await openFeed(id, attempt); }
  finally { connecting.delete(id); }
}

async function openFeed(id: string, attempt: number): Promise<void> {
  const account = await loadAccount(id);
  if (!account || account.platform.toLowerCase() !== 'ctrader' || account.connectionType !== 'api') return;

  let creds: any;
  try { creds = JSON.parse(safeDecrypt(account.passwordEnc) ?? '{}'); } catch { return; }
  if (!creds.accessToken || !creds.ctraderId) return;        // OAuth not finished yet

  try {
    await attach(account, creds, onTrade, onHubLost);
    console.log(`[cTraderRT] live feed attached — account ${id} (ctid ${creds.ctraderId})`);
  } catch (err: any) {
    const msg = String(err?.message ?? '');
    if (attempt === 0 && /2142|token|auth/i.test(msg)) {       // expired token → refresh once
      const fresh = await refreshCTraderToken(account).catch(() => null);
      if (fresh) { await openFeed(id, 1); return; }
    }
    // A pool refusal reads the same as any other failure here: log it and retry later, rather than
    // give up on an account whose trades would then never be recorded.
    console.error(`[cTraderRT] could not attach account ${id}: ${msg}`);
    scheduleReconnect(id);
  }
}

/** One closed deal, for one account. Unchanged from the one-socket-per-account version. */
function onTrade(member: Member, payload: any): void {
  const account = member.account;
  // THE POSITION IS IN THE SAME EVENT AND WAS BEING THROWN AWAY. `ProtoOAExecutionEvent` carries
  // `deal` AND `position`; this read only the deal, and `mapClosedDeal` then needed
  // `closePositionDetail`, which this gateway does not send — verified on the live demo account,
  // 0 of 30 real deals carried it. So every live close mapped to null and nothing was ever recorded.
  //
  // A close is now recognised from what IS present: the position's status says CLOSED, or the
  // deal's side is opposite the position's (the only other way a position shrinks to nothing).
  const trade = payload?.deal
    ? (mapClosedDeal(payload.deal, member.symbolMap)
       ?? mapClosedFromEvent(payload, member.symbolMap))
    : null;
  if (!trade) return;                                         // opening fill, not a realised close

  processIncomingTrades(account.id, account.userId, [trade])
    .then(({ created }) => {
      if (created <= 0) return;
      console.log(`[cTraderRT] recorded live trade ${trade.externalId} ${trade.symbol} (acct ${account.id})`);
      return notificationService.createNotification({
        userId:  account.userId,
        type:    'trade_synced',
        title:   'Trade recorded',
        message: `${trade.direction} ${trade.symbol} closed @ ${trade.closePrice ?? '—'} · P/L ${trade.profit ?? 0}`,
      }).catch(() => {});
    })
    .catch((e: any) => console.error(`[cTraderRT] record failed (acct ${account.id}): ${e.message}`));
}

/** Connect newly-added cTrader accounts and drop feeds whose account was deleted. */
async function reconcile(): Promise<void> {
  const all = await db.select().from(brokerAccounts).where(eq(brokerAccounts.connectionType, 'api'));
  const wanted = new Set(all.filter(a => a.platform.toLowerCase() === 'ctrader').map(a => a.id));
  // AWAITED, so that whoever called reconcile can report what is actually attached. The first
  // production boot logged "live feeds active for 0 account(s) on 0 socket(s)" and then printed two
  // "live feed attached" lines underneath it — the connects were still in flight when the summary
  // read the counters. That summary is the evidence line for the whole pooling design, so a version
  // of it that reports zeros while two feeds are opening is worse than no line at all.
  // Failures stay per-account: one account that cannot connect must not stop the others.
  await Promise.all(
    [...wanted].filter(id => !isAttached(id)).map(id => connect(id).catch(() => {}))
  );
  attachedIds().forEach(id => { if (!wanted.has(id)) removeCTraderAccount(id); });
}

/** Boot hook (primary worker only) — open all feeds, then keep them reconciled. */
export async function startCTraderRealtime(): Promise<void> {
  if (!IS_PRIMARY) return;
  try {
    await reconcile();
    // ACCOUNTS AND SOCKETS ARE REPORTED SEPARATELY. They were the same number before the hub, and
    // the whole point is that they stop being — a line that conflates them cannot show it working.
    const h = hubStats(), p = stats();
    console.log(`[cTraderRT] live feeds active for ${h.accounts} cTrader account(s) on ` +
                `${h.hubs} socket(s) (max ${ACCOUNTS_PER_CONN}/socket) — ` +
                `pool ${p.held}/${p.max}`);
    setInterval(() => { reconcile().catch(() => {}); }, RECONCILE_MS);
    setInterval(() => { logUtilisation(); logRoutingEvidence(); }, 60_000);
  } catch (e: any) {
    console.error(`[cTraderRT] startup failed: ${e.message}`);
  }
}

/** Start a feed for a freshly connected account (call right after OAuth completes). */
export function addCTraderAccount(id: string): void { if (IS_PRIMARY) connect(id).catch(() => {}); }

/** Stop and drop a feed (call on account disconnect/delete). */
export function removeCTraderAccount(id: string): void { detach(id); }
