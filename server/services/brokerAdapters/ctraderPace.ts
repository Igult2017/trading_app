/**
 * Space out cTrader Open API requests so a burst never trips the broker's limiter.
 *
 * ⚠ PER CONNECTION, NOT PER PROCESS (22 Nov 2026, sync plan step 4). cTrader limits requests on EACH
 * connection — about 50 a second for ordinary requests and 5 a second for history (measured per
 * connection 30 Aug, `docs/ctrader-open-api-apps.md:85`). Until today this gate held ONE clock for the
 * whole website: 3.3 history requests a second shared by every connection Node had open. So a second
 * connection added no capacity at all, and twenty accounts syncing at once queued behind each other
 * for no reason the broker imposed. Now every connection gets its own allowance and its own queue.
 *
 * ⚠ A ROLLING SECOND, NOT A FIXED GAP. The broker counts requests inside any one-second window. A
 * fixed gap (the old 300 ms) is slower than the limit allows when idle and says nothing about a
 * window; a rolling count of the last second's sends is exactly the broker's own rule, kept under it:
 * 35 ordinary (limit ~50) and 4 history (limit ~5).
 *
 * ⚠ CALLERS IN LINE. Concurrent callers on the same connection queue behind each other instead of all
 * reading the same idle count and firing together — which is how a "paced" gate still produces a burst.
 *
 * A call without a connection uses one shared process-wide allowance — the safe, slow fallback.
 */

export type ReqKind = 'history' | 'normal';

/** Requests allowed in any rolling second, per connection. Under cTrader's ~50 and ~5. */
export const BUDGET: Readonly<Record<ReqKind, number>> = { normal: 35, history: 4 };
/**
 * The window is counted as 1.1 s, not 1 s: a request leaves a few milliseconds AFTER it is allowed,
 * so a late first send and a prompt fifth could otherwise land inside one broker second. Measured by
 * `__tests__/ctraderPace.check.ts` (5 in one second with a 1.0 s window, 4 with 1.1 s).
 */
const WINDOW_MS = 1100;

type Lane = { sent: number[]; chain: Promise<void> };
type Lanes = Record<ReqKind, Lane>;

/** Keyed by the connection itself, so a closed connection's state is dropped with it. */
const lanes = new WeakMap<object, Lanes>();
const PROCESS_WIDE = {};

function lanesOf(conn: object): Lanes {
  let l = lanes.get(conn);
  if (!l) {
    l = { normal: { sent: [], chain: Promise.resolve() }, history: { sent: [], chain: Promise.resolve() } };
    lanes.set(conn, l);
  }
  return l;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait until this connection may send a request of this kind, then claim that moment. Await it
 * immediately before every request, passing the connection it will go down.
 *
 * Never throws: a pacing gate that can fail is a new way to lose a sync.
 */
export async function awaitTurn(kind: ReqKind = 'history', conn: object = PROCESS_WIDE): Promise<void> {
  const lane = lanesOf(conn)[kind];
  const budget = BUDGET[kind];
  const mine = lane.chain.then(async () => {
    for (;;) {
      const now = Date.now();
      while (lane.sent.length && now - lane.sent[0] >= WINDOW_MS) lane.sent.shift();
      if (lane.sent.length < budget) { lane.sent.push(now); return; }
      await sleep(lane.sent[0] + WINDOW_MS - now + 1);
    }
  });
  // Keep the chain alive even if a link rejects, or one failure would wedge the queue for good.
  lane.chain = mine.catch(() => {});
  await mine;
}
