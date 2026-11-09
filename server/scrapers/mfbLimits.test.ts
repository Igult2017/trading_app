/**
 * mfbLimits.test.ts — run with:
 *     npx tsx server/scrapers/mfbLimits.test.ts
 *
 * WHAT THIS PROTECTS. His instruction, 2026-11-09: *"remember rate limiting so that myfxbook doesnt
 * block as for ever."* Everything that keeps that promise is in `decide`, and none of it can be
 * seen working in normal use — a limiter that silently stops limiting looks exactly like a limiter
 * with nothing to do. The only way to know it still holds is to drive it.
 *
 * It also pins the three reasons a fetch may happen at all, because each one is his:
 *   SWEEP   — "scrap available news once and persist", and "check at a good interval for any news
 *             that has been posted that we did not persist so that we dont miss anything"
 *   RELEASE — "only scrap again when going to get releases"
 *   nothing else.
 *
 * ⚠ The numbers here are sized against a MEASURED 3.5-6.4 minutes per fetch on the server, not
 * against a fast request.
 */
import { decide, no, type RunRow, type PendingRelease } from "./mfbLimits";

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? "" : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, held: boolean) {
  count++;
  console.log(`   ${held ? "PASS" : "FAIL"}  TEETH — ${name}`);
  if (!held) failed++;
}

const NOW = new Date("2026-11-09T12:00:00Z");
const ago = (mins: number) => new Date(NOW.getTime() - mins * 60_000);

/** A finished run, `mins` minutes ago. */
const run = (mins: number, over: Partial<RunRow> = {}): RunRow => ({
  kind: "sweep", startedAt: ago(mins), finishedAt: ago(mins - 5), ok: true, blocked: false, ...over,
});
const noPending: PendingRelease[] = [];
const onePending: PendingRelease[] = [{ eventTime: ago(20) }];

console.log("\nMYFXBOOK RATE LIMITER — every rule that stops us being blocked for good\n");

// ── 1. ONE AT A TIME ──────────────────────────────────────────────────────────────────────────
// Two browsers on a 2-CPU box that also runs DORIXÉ is how this machine fell over on 2026-09-07.
console.log("1. never two fetches at once:");
const inFlight = run(3, { finishedAt: null });
check("a fetch still running blocks a second", decide([inFlight], onePending, NOW).due, false);
teeth("...and says so plainly", decide([inFlight], onePending, NOW).reason.includes("already running"));
// A crashed run must not wedge the lock shut for ever.
const stuck = run(30, { finishedAt: null });
teeth("a run stuck for 30 min is presumed dead, not honoured",
      decide([stuck], onePending, NOW).due === true);

// ── 2. THE MINIMUM GAP ────────────────────────────────────────────────────────────────────────
console.log("\n2. at least 15 minutes between fetches:");
check("5 minutes ago -> refused", decide([run(5)], onePending, NOW).due, false);
check("14 minutes ago -> refused", decide([run(14)], onePending, NOW).due, false);
check("16 minutes ago -> allowed", decide([run(16, { kind: "release" })], onePending, NOW).due, true);

// ── 3. THE DAILY CEILING ──────────────────────────────────────────────────────────────────────
// Counted over ATTEMPTS, failures included — otherwise being blocked would cost nothing at all and
// a refusing site could be hammered for free.
console.log("\n3. a hard ceiling of 20 attempts per 24 hours:");
const nineteen = Array.from({ length: 19 }, (_, i) => run(30 + i * 10, { kind: "release" }));
teeth("19 attempts still allows one more", decide(nineteen, onePending, NOW).due === true);
const twenty = Array.from({ length: 20 }, (_, i) => run(30 + i * 10, { kind: "release" }));
check("20 attempts -> refused", decide(twenty, onePending, NOW).due, false);
teeth("...and the ceiling counts FAILED attempts too, or being blocked would be free",
      decide(Array.from({ length: 20 }, (_, i) => run(30 + i * 10, { ok: false, blocked: true })),
             onePending, NOW).due === false);

// ── 4. BACKOFF — being refused must slow us DOWN ──────────────────────────────────────────────
console.log("\n4. being refused makes us wait longer, never try harder:");
const blocked = (mins: number) => run(mins, { ok: false, blocked: true, kind: "release" });
check("1 refusal, 20 min ago -> still waiting (needs 30)", decide([blocked(20)], onePending, NOW).due, false);
check("1 refusal, 35 min ago -> allowed again", decide([blocked(35)], onePending, NOW).due, true);
check("2 refusals in a row, 40 min -> still waiting (needs 60)",
      decide([blocked(40), blocked(100)], onePending, NOW).due, false);
teeth("3 refusals in a row waits longer than 2 did",
      decide([blocked(90), blocked(150), blocked(200)], onePending, NOW).due === false);
teeth("...but it RECOVERS on its own rather than giving up for ever",
      decide([blocked(400), blocked(500), blocked(600)], onePending, NOW).due === true);

// ── 5. THE SWEEP — his "don't miss anything" ──────────────────────────────────────────────────
console.log("\n5. the sweep catches events posted since last time:");
check("no sweep on record -> sweep", decide([], noPending, NOW).kind, "sweep");
check("a sweep 1 hour ago -> nothing to do", decide([run(60)], noPending, NOW).due, false);
check("a sweep 5 hours ago -> sweep again", decide([run(300)], noPending, NOW).kind, "sweep");
teeth("a FAILED sweep does not count as having swept",
      decide([run(300, { ok: true }), run(10_000)].concat([run(60, { ok: false })]), noPending, NOW).kind === "sweep");

// ── 6. THE RELEASE FETCH — his "only go back for the releases" ────────────────────────────────
console.log("\n6. going back for a number we are missing:");
const swept = run(60);                      // recent successful sweep, so the sweep is not due
check("nothing missing -> no fetch", decide([swept], noPending, NOW).due, false);
check("a number missing -> release fetch", decide([swept], onePending, NOW).kind, "release");
teeth("...and it stops after 2 tries rather than chasing a number that never comes",
      decide([swept, run(16, { kind: "release" }), run(40, { kind: "release" })],
             [{ eventTime: ago(44) }], NOW).due === false);

// ── 7. THE OFF SWITCH, and the shape of a refusal ─────────────────────────────────────────────
console.log("\n7. housekeeping:");
check("a refusal never names a kind", no("because").kind, null);
check("a refusal is never due", no("because").due, false);
teeth("every decision carries a readable reason",
      [decide([], noPending, NOW), decide([run(5)], onePending, NOW), decide([swept], noPending, NOW)]
        .every((d) => typeof d.reason === "string" && d.reason.length > 8));

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`} — ${count} checks\n`);
process.exit(failed === 0 ? 0 : 1);
