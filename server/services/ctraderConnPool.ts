/**
 * How many cTrader connections Node may hold, and who waits when it is full.
 *
 * WHY THIS EXISTS. Spotware refused to approve a second cTrader application, so the signal scanner,
 * account syncing and copy trading all share ONE approved app permanently. cTrader's request limits
 * are per connection, but the number of concurrent connections is reported (forum, not the docs) to
 * be capped **per application** at around 25 — and until now nothing in Node counted its connections
 * at all, let alone limited them.
 *
 * `ctraderRealtime` opens ONE PERMANENT WebSocket PER cTrader ACCOUNT, for every user, forever. That
 * grows with the user base, and the connection eventually refused could be **the signal platform
 * reconnecting** — which is the one outcome ruled out: *"without affecting signal platform"*.
 *
 * WHAT IT DOES NOT COVER, DELIBERATELY. The signal platform and the copy engine are separate
 * processes with their own connections. This cap is NODE'S. That asymmetry is the whole point: the
 * scanner can never be stuck behind a user's history backfill, because it is not in this queue.
 *
 * FEEDS OUTRANK TASKS. A live feed is a user's only ongoing trade sync — cTrader is excluded from
 * the 15-minute sync timer (`autoSyncService.ts:168`, *"never on timer"*), so a feed that cannot
 * open means that user silently records nothing. A backfill, by contrast, can wait a few seconds and
 * lose nothing. So feeds are served first and never queue behind a task.
 *
 * THE CAP IS SET LOW ON PURPOSE. The ~25 ceiling is unverified and measuring it means opening
 * connections until one is refused — which would risk the scanner. Sitting at 8 makes the unknown
 * irrelevant rather than betting on it.
 */
import { EventEmitter } from 'events';

export type ConnKind = 'feed' | 'task';

export interface Lease {
  readonly kind: ConnKind;
  readonly label: string;
  /** Idempotent — calling twice must not hand back two slots. */
  release(): void;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(String(process.env[name] ?? ''), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

/** Total simultaneous cTrader connections Node may hold. Well under the reported ~25 per-app cap. */
export const MAX_CONNECTIONS = envInt('CTRADER_MAX_CONNECTIONS', 8, 1, 24);
const WARN_AT = 0.75;

interface Waiter {
  kind: ConnKind;
  label: string;
  resolve: (lease: Lease) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

let held = 0;
const heldBy = new Map<string, number>();     // label -> count, for the log line
const feedQueue: Waiter[] = [];
const taskQueue: Waiter[] = [];
let warned = false;

export const poolEvents = new EventEmitter();  // 'acquired' | 'released' — for tests

function countKey(kind: ConnKind, label: string): string {
  return `${kind}:${label}`;
}

function makeLease(kind: ConnKind, label: string): Lease {
  const key = countKey(kind, label);
  heldBy.set(key, (heldBy.get(key) ?? 0) + 1);
  held += 1;
  poolEvents.emit('acquired', { kind, label, held });

  let released = false;
  return {
    kind,
    label,
    release() {
      // IDEMPOTENT. A double release would hand out a slot that is still in use, and the symptom —
      // occasionally exceeding the cap — would look like the cap not working rather than a leak.
      if (released) return;
      released = true;
      held -= 1;
      const n = (heldBy.get(key) ?? 1) - 1;
      if (n <= 0) heldBy.delete(key); else heldBy.set(key, n);
      poolEvents.emit('released', { kind, label, held });
      pump();
    },
  };
}

/** Hand the next waiter a slot — feeds first, then tasks, both FIFO within their class. */
function pump(): void {
  while (held < MAX_CONNECTIONS) {
    const next = feedQueue.shift() ?? taskQueue.shift();
    if (!next) return;
    if (next.timer) clearTimeout(next.timer);
    next.resolve(makeLease(next.kind, next.label));
  }
}

/**
 * Wait for permission to open a cTrader connection.
 *
 * `timeoutMs` applies to WAITING only, never to the connection itself, and rejecting is the right
 * answer when it expires: the caller logs a refusal instead of opening a connection the pool has
 * already decided there is no room for.
 */
export function acquire(kind: ConnKind, label = 'unnamed', timeoutMs = 60_000): Promise<Lease> {
  if (held < MAX_CONNECTIONS) return Promise.resolve(makeLease(kind, label));

  return new Promise<Lease>((resolve, reject) => {
    const waiter: Waiter = { kind, label, resolve, reject };
    waiter.timer = setTimeout(() => {
      for (const q of [feedQueue, taskQueue]) {
        const i = q.indexOf(waiter);
        if (i >= 0) q.splice(i, 1);
      }
      reject(new Error(
        `cTrader connection pool full (${held}/${MAX_CONNECTIONS}) — ${kind} "${label}" waited ` +
        `${Math.round(timeoutMs / 1000)}s. Raise CTRADER_MAX_CONNECTIONS or reduce concurrent work.`));
    }, timeoutMs);
    (kind === 'feed' ? feedQueue : taskQueue).push(waiter);
  });
}

/**
 * Acquire, run, release — for transient work (sync, balance, add-account). The release is in a
 * `finally`, which is the only thing standing between a thrown error and a permanently lost slot.
 */
export async function withConnection<T>(
  kind: ConnKind, label: string, fn: () => Promise<T>, timeoutMs?: number,
): Promise<T> {
  const lease = await acquire(kind, label, timeoutMs);
  try {
    return await fn();
  } finally {
    lease.release();
  }
}

export function stats(): {
  held: number; max: number; free: number; waitingFeeds: number; waitingTasks: number;
  byLabel: Record<string, number>;
} {
  return {
    held, max: MAX_CONNECTIONS, free: Math.max(0, MAX_CONNECTIONS - held),
    waitingFeeds: feedQueue.length, waitingTasks: taskQueue.length,
    byLabel: Object.fromEntries(heldBy),
  };
}

/**
 * Say how full the pool is, so the ceiling is seen COMING rather than hit. Quiet while there is
 * room — a line every minute saying "3 of 8" is how a real warning gets scrolled past.
 */
export function logUtilisation(): void {
  const s = stats();
  const full = s.held / s.max;
  if (full >= WARN_AT) {
    warned = true;
    console.warn(`[ctraderPool] ${s.held}/${s.max} connections in use ` +
                 `(${Math.round(full * 100)}%) — waiting: ${s.waitingFeeds} feed(s), ` +
                 `${s.waitingTasks} task(s). Holders: ${JSON.stringify(s.byLabel)}`);
  } else if (warned) {
    warned = false;
    console.log(`[ctraderPool] back below ${Math.round(WARN_AT * 100)}% — ${s.held}/${s.max} in use`);
  }
}

/** Tests only — drop all state so one case cannot leak a slot into the next. */
export function _resetForTests(): void {
  held = 0;
  heldBy.clear();
  feedQueue.length = 0;
  taskQueue.length = 0;
  warned = false;
}
