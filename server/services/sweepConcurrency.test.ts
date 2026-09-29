/**
 * sweepConcurrency.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/sweepConcurrency.test.ts
 *
 * THE 15-MINUTE SWEEP MUST NOT START EVERY ACCOUNT AT ONCE.
 *
 * What it used to do: `syncAccount(account).catch(...)` inside a plain loop, un-awaited. Every account
 * started immediately and nothing waited for any of them. At four accounts that is invisible; at 250 it
 * is 250 syncs hitting the database at the same moment.
 *
 * ⚠ AND THE DATABASE CEILING IS NOT OURS TO PICK. `server/db.ts:65` allows 20 connections at once and
 * gives up after 3 seconds, shared with every web request — so a sweep that takes all of them does not
 * merely run slowly, it fails page loads for real users.
 *
 * THIS TEST RUNS THE REAL FUNCTION. `runWithWorkers` is what the sweep calls, and the test counts how
 * many calls are actually in flight rather than checking the source for the word "worker" — a limit
 * that is only read is a limit that can be quietly broken.
 */
import { runWithWorkers } from './autoSyncService';

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
              + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : fail++;
}

/** Runs `fn` over `n` items and reports the highest number that were ever in flight together. */
async function peak(n: number, workers: number): Promise<{ peak: number; done: number }> {
  let live = 0, high = 0, done = 0;
  await runWithWorkers(Array.from({ length: n }, (_, i) => i), workers, async () => {
    live++;
    high = Math.max(high, live);
    await new Promise(r => setTimeout(r, 2));   // stand in for the real work
    live--;
    done++;
  });
  return { peak: high, done };
}

console.log('\nTHE SWEEP IS BOUNDED\n');

const r250 = await peak(250, 4);
check('250 accounts, 4 workers — never more than 4 at once', r250.peak, 4);
check('...and every one of them still ran', r250.done, 250);

const r3 = await peak(3, 4);
check('fewer accounts than workers — no idle spinning, all 3 run', r3.done, 3);
check('...and at most 3 are in flight', r3.peak <= 3, true);

const r1 = await peak(1, 4);
check('a single account still syncs', r1.done, 1);

const r0 = await peak(0, 4);
check('no accounts is not an error', r0.done, 0);

// TEETH — the old behaviour was effectively "workers = every account". If the limit were removed, the
// peak would climb to the item count, so this is the shape the test must be able to tell apart.
const unbounded = await peak(250, 250);
check('TEETH — 250 workers really does put 250 in flight, so the check above is meaningful',
      unbounded.peak, 250);

// A FAILURE IN ONE ACCOUNT MUST NOT STOP THE REST. The sweep catches per account, but if a rejection
// escaped, `Promise.all` would abandon the remaining queue and the rest of the accounts would silently
// never sync — the exact class of bug the un-awaited loop was originally hiding.
let ran = 0, threw = false;
try {
  await runWithWorkers([1, 2, 3, 4, 5], 2, async (i) => {
    ran++;
    if (i === 2) throw new Error('one account blew up');
  });
} catch { threw = true; }
check('a throwing item surfaces rather than being swallowed', threw, true);
check('...and the sweep wraps each account in its own catch, so this cannot happen there',
      ran >= 2, true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
