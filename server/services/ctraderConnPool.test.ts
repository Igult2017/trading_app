/**
 * ctraderConnPool.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/ctraderConnPool.test.ts
 *
 * No test framework is installed in this repo (only `tsx`), so this is a plain script — same shape
 * as brokerSyncService.test.ts.
 *
 * WHAT THIS PROTECTS. Spotware refused a second cTrader app, so the signal scanner, account syncing
 * and copy trading share ONE application. Concurrent connections are reported (forum, not docs) to
 * be capped per application at ~25, and Node counted its own connections nowhere — it opened one
 * PERMANENT socket per cTrader account, for every user, forever. The connection eventually refused
 * could be the signal platform reconnecting, which is the one outcome ruled out.
 *
 * THE LEAK IS THE DANGEROUS FAILURE, not the cap. A cap that is too low refuses loudly. A leaked
 * slot strangles the pool one account at a time and presents as "new feeds stopped connecting"
 * weeks later, with nothing pointing at the release that never ran. Hence the teeth cases below.
 */
import { acquire, withConnection, stats, MAX_CONNECTIONS, _resetForTests } from './ctraderConnPool';

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

const settled = () => new Promise(r => setImmediate(r));

async function main() {
  console.log('\nCTRADER CONNECTION POOL — the cap, the queue, and the slot that must come back');

  // ── THE CAP ───────────────────────────────────────────────────────────────
  _resetForTests();
  const leases = [];
  for (let i = 0; i < MAX_CONNECTIONS; i++) leases.push(await acquire('task', `t${i}`));
  check(`${MAX_CONNECTIONS} acquire immediately`, stats().held, MAX_CONNECTIONS);
  check('...and the pool reports no free slots', stats().free, 0);

  // The next one must WAIT, not open a connection anyway.
  let overflowGranted = false;
  const overflow = acquire('task', 'overflow').then(l => { overflowGranted = true; return l; });
  await settled();
  check('one past the cap WAITS rather than exceeding it', overflowGranted, false);
  check('...and is counted as waiting', stats().waitingTasks, 1);
  check('the cap is never exceeded while it waits', stats().held <= MAX_CONNECTIONS, true);

  leases[0].release();
  const granted = await overflow;
  check('releasing a slot hands it to the waiter', overflowGranted, true);
  check('...and the total is still within the cap', stats().held, MAX_CONNECTIONS);
  granted.release();
  leases.slice(1).forEach(l => l.release());
  check('everything released returns the pool to empty', stats().held, 0);

  // ── FEEDS OUTRANK TASKS ───────────────────────────────────────────────────
  // A live feed is a user's ONLY ongoing trade sync (cTrader is excluded from the 15-min timer), so
  // it must never queue behind a 26-second history backfill.
  _resetForTests();
  const full = [];
  for (let i = 0; i < MAX_CONNECTIONS; i++) full.push(await acquire('task', `busy${i}`));

  const order: string[] = [];
  const waitingTask = acquire('task', 'late-task').then(l => { order.push('task'); return l; });
  await settled();
  const waitingFeed = acquire('feed', 'late-feed').then(l => { order.push('feed'); return l; });
  await settled();
  check('a task and a feed are both waiting', [stats().waitingTasks, stats().waitingFeeds], [1, 1]);

  full[0].release();
  await settled();
  check('the FEED is served first even though the task queued earlier', order[0], 'feed');

  full[1].release();
  const [ft, wt] = await Promise.all([waitingFeed, waitingTask]);
  check('...and the task is served next', order, ['feed', 'task']);
  ft.release(); wt.release();
  full.slice(2).forEach(l => l.release());
  check('pool empty again', stats().held, 0);

  // ── THE SLOT MUST COME BACK ───────────────────────────────────────────────
  _resetForTests();
  const once = await acquire('task', 'double');
  once.release();
  once.release();                       // a double release must NOT hand back two slots
  check('release is idempotent — a double release does not free two slots', stats().held, 0);

  for (let i = 0; i < MAX_CONNECTIONS; i++) (await acquire('task', 'fill')).release();
  check('acquire/release cycles do not leak', stats().held, 0);

  // withConnection must release even when the work throws — this is the one that matters, because
  // every real caller does network I/O that can reject.
  _resetForTests();
  let threw = false;
  try {
    await withConnection('task', 'boom', async () => { throw new Error('network died'); });
  } catch { threw = true; }
  check('withConnection propagates the error', threw, true);
  check('...and STILL releases the slot', stats().held, 0);

  const value = await withConnection('task', 'ok', async () => 42);
  check('withConnection returns the work’s value', value, 42);
  check('...and releases on success too', stats().held, 0);

  // ── WAITING HAS A LIMIT ───────────────────────────────────────────────────
  // Rejecting is right: the caller logs a refusal instead of opening a connection the pool has
  // already decided there is no room for.
  _resetForTests();
  const hold = [];
  for (let i = 0; i < MAX_CONNECTIONS; i++) hold.push(await acquire('task', 'hold'));
  let timedOut = false;
  try { await acquire('task', 'impatient', 40); } catch { timedOut = true; }
  check('waiting past the timeout rejects rather than hanging forever', timedOut, true);
  check('...and the timed-out waiter is removed from the queue', stats().waitingTasks, 0);
  hold.forEach(l => l.release());
  check('pool empty after the timeout case', stats().held, 0);

  // ── VISIBILITY ────────────────────────────────────────────────────────────
  _resetForTests();
  const a = await acquire('feed', 'live-feed');
  const b = await acquire('task', 'trade-sync');
  check('holders are reported by label so the log names what is using the pool',
        stats().byLabel, { 'feed:live-feed': 1, 'task:trade-sync': 1 });
  a.release(); b.release();
  check('...and the labels clear on release', stats().byLabel, {});

  // ── TEETH ─────────────────────────────────────────────────────────────────
  _resetForTests();
  const leaked = await acquire('feed', 'leaked');
  void leaked;                          // deliberately NOT released — the failure being guarded
  teeth('a slot that is never released stays held (this is the strangle)', stats().held === 1);
  _resetForTests();
  check('reset clears a leaked slot for the next case', stats().held, 0);

  // Prove the cap does real work: without it, MAX+5 would all be granted at once.
  _resetForTests();
  let granted2 = 0;
  const many = Array.from({ length: MAX_CONNECTIONS + 5 }, () =>
    acquire('task', 'burst', 30).then(l => { granted2++; return l; }).catch(() => null));
  await settled();
  teeth('a burst past the cap is NOT all granted at once', granted2 === MAX_CONNECTIONS);
  await Promise.all(many).then(ls => ls.forEach(l => l?.release()));

  console.log();
  if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
  console.log(`ALL PASS (${count} checks)`);
}

main().catch(e => { console.error(e); process.exit(1); });
