/**
 * THE DURABLE RECORD OF WHAT THE SYNC AND THE AUTO-JOURNAL DID.
 *
 * His instruction, 2026-09-02: *"persist every memory that we might need either for fixes, error
 * tracing or for records. I dont want to here that we redeployed and the memory was wiped so we cant
 * know what happened."*
 *
 * He is describing what had just happened to us. Finding one defect that evening took four deploys,
 * and every deploy destroyed the log lines the previous one had added — twice I had to re-add a
 * diagnostic that had already answered its question and then been wiped. `console.log` is not a
 * record; it is a stream that a restart truncates.
 *
 * `signal_events` already solved exactly this for the SIGNAL side, and its own header says why:
 * *"the container had restarted and taken every log line with it, so the question 'where did it die?'
 * was permanently unanswerable."* This is its counterpart for broker sync and auto-journaling, which
 * had nothing at all. Same shape, same reasoning, same append-only rule.
 *
 * TWO PROPERTIES THIS FILE MUST HAVE, and both come from tonight:
 *
 *  1. **It still writes to the log.** The log is where you look while something is happening; the
 *     table is where you look afterwards. Losing the first to gain the second would be a bad trade.
 *  2. **It can NEVER break a sync.** Recording a trade matters; recording that we recorded it does
 *     not. Every write is best-effort and swallowed, and a failure to write the record is itself
 *     logged rather than thrown.
 */
import { db } from '../../db';
import { syncEvents } from '../../../shared/schema';

/** The stages a trade passes through on its way into the journal. */
export type SyncStage =
  | 'fetched'      // the broker returned this window
  | 'recorded'     // a new trade was stored
  | 'duplicate'    // we already had it
  | 'journaled'    // a journal entry was created
  | 'healed'       // it was stored earlier but had no journal entry until now
  | 'backfilled'   // a blank field was filled from a source that had it
  | 'skipped'      // nothing was attempted, and `detail` says why
  | 'failed'       // it threw, and `detail` carries the message
  // ── THE ONE FACT THAT SETS THE PLATFORM'S CAPACITY CEILING ─────────────────────────────────────
  // Whether a real fill on this JSON gateway names the account it belongs to. If it does, many accounts
  // may share one cTrader socket; if it does not, they must not, because routing would be a guess and a
  // wrong guess writes a real trade into the wrong person's journal (docs/ctrader-scaling.md, THE GATE).
  // Recorded rather than only logged because the container log holds about 50 seconds of history, and
  // this verdict is printed exactly once, after the first fill.
  | 'routing-ok'          // fills carry ctidTraderAccountId — sharing a socket is safe
  | 'routing-missing-id'  // at least one fill did not — sharing a socket is NOT safe
  // ── IS THE LIVE PATH STILL THE ONE DOING THE WORK? ─────────────────────────────────────────────
  // Once events are the primary mechanism and the sweep is only a safety net, a live feed that has
  // quietly stopped working looks EXACTLY like one that is working — because the sweep covers for it,
  // and the trade still appears. These two stages are what tell them apart.
  | 'live-latency'        // a fill went from arriving to stored in N ms, on the live path
  | 'session-lost';       // one account's session ended (usually a token refresh); it alone re-attaches

export interface SyncEventInput {
  brokerAccountId?: string | null;
  externalId?: string | null;
  symbol?: string | null;
  stage: SyncStage;
  detail?: string | null;
}

/**
 * Record one thing that happened, to the log AND to the database.
 *
 * Never throws and never awaits anything the caller depends on: a sync that recorded a trade but
 * could not write its audit row has still done the job that matters.
 */
export async function record(e: SyncEventInput): Promise<void> {
  const where = [e.symbol, e.externalId].filter(Boolean).join(' ');
  console.log(`[Sync:${e.stage}]${where ? ' ' + where : ''}${e.detail ? ' — ' + e.detail : ''}`);
  try {
    await db.insert(syncEvents).values({
      brokerAccountId: e.brokerAccountId ?? null,
      externalId:      e.externalId ?? null,
      symbol:          e.symbol ?? null,
      stage:           e.stage,
      detail:          e.detail ?? null,
    });
  } catch (err: any) {
    // Deliberately not rethrown. Say it once so a missing audit trail is itself visible — the whole
    // point of this file is that silence is what made tonight expensive.
    console.error(`[Sync:events] could not persist a '${e.stage}' event: ${err?.message ?? err}`);
  }
}

/** Fire-and-forget, for paths that must not wait even the length of one insert. */
export function recordSoon(e: SyncEventInput): void {
  void record(e);
}
