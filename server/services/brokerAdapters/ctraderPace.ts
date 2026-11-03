/**
 * Space out cTrader Open API requests so a burst never trips the broker's limiter.
 *
 * WHY THIS EXISTS. Until 2026-11-03 the Node side had **no request pacing of any kind** — the
 * connection pool caps how many sockets are open at once (`ctraderConnPool`), which is a different
 * thing entirely and says nothing about how fast requests travel down them. The Python scanner has
 * had a 0.30s gate since September (`data/ctrader_client.await_turn`); this is its counterpart, and
 * it was written after production was refused with `BLOCKED_PAYLOAD_TYPE — "You are being rate
 * limited"`.
 *
 * ⚠ TWO BUDGETS, BECAUSE THE BROKER HAS TWO. cTrader rates HISTORICAL requests at about 5 a second
 * and everything else at about 50 (`docs/ctrader-open-api-apps.md:85`, staff-confirmed). Pacing the
 * cheap requests as hard as the scarce ones would make a login or a symbol list needlessly slow;
 * not pacing the scarce ones at all is what got us refused.
 *
 * ⚠ THE DEAL FETCH IS THE ONE THAT WORRIED HIM, and he was right to look there.
 * `fetchDealsInRange` RECURSES — when a range comes back full it splits in half and asks twice more,
 * with nothing between the calls. One account with a busy week therefore produces a burst of
 * back-to-back historical requests, which is exactly the shape a limiter punishes. Every one of
 * those now waits its turn.
 *
 * ⚠ WHAT THIS CANNOT DO, said plainly so nobody reads more into it than is there. This paces NODE.
 * The Python scanner and the copy engine are separate processes with their own gates, and the
 * broker's budget may well be shared across all of them (D63's open question). A per-process gate
 * cannot enforce a cross-process budget — it can only stop this process being the one that ruins it.
 */

/** Roughly 3.3 requests a second, matching the Python gate — comfortably under the ~5/s cap. */
const HISTORY_GAP_MS = 300;
/** Everything else sits on the ~50/s budget; 25ms is 40/s, still under it with room to spare. */
const NORMAL_GAP_MS = 25;

export type ReqKind = 'history' | 'normal';

/**
 * The last moment a request of each kind was sent. Separate clocks on purpose: a flurry of cheap
 * requests must not push a historical one further back than its own budget requires.
 */
const lastSent: Record<ReqKind, number> = { history: 0, normal: 0 };

/**
 * Queued behind the previous waiter of the same kind, so concurrent callers line up instead of all
 * measuring the same idle clock and firing together — which is how a "paced" gate still produces a
 * burst. This is the trap the Python side hit from the other direction: there, requests that never
 * stamped the clock let the next one fire early.
 */
const chain: Record<ReqKind, Promise<void>> = {
  history: Promise.resolve(),
  normal: Promise.resolve(),
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wait until it is safe to send, then claim that moment. Await it immediately before every request.
 *
 * Never throws: a pacing gate that can fail is a new way to lose a sync, and the worst case of it
 * doing nothing is the behaviour we had before it existed.
 */
export async function awaitTurn(kind: ReqKind = 'history'): Promise<void> {
  const gap = kind === 'history' ? HISTORY_GAP_MS : NORMAL_GAP_MS;
  const mine = chain[kind].then(async () => {
    const wait = gap - (Date.now() - lastSent[kind]);
    if (wait > 0) await sleep(wait);
    lastSent[kind] = Date.now();
  });
  // Keep the chain alive even if a link rejects, or one failure would wedge the queue for good.
  chain[kind] = mine.catch(() => {});
  await mine;
}

/** Tests only — so one case cannot leave its timestamps behind for the next. */
export function _resetForTests(): void {
  lastSent.history = 0;
  lastSent.normal = 0;
  chain.history = Promise.resolve();
  chain.normal = Promise.resolve();
}

/** For a log line or a check: how long since each kind last went out. */
export function paceStats(): { historyAgeMs: number; normalAgeMs: number } {
  const now = Date.now();
  return {
    historyAgeMs: lastSent.history ? now - lastSent.history : -1,
    normalAgeMs: lastSent.normal ? now - lastSent.normal : -1,
  };
}
