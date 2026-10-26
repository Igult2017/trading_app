/**
 * tradeOrder.test.ts — run with:  npx tsx client/src/lib/tradeOrder.test.ts
 *
 * No test framework is installed in this repo (only `tsx`), so this is a plain script rather than
 * a new dependency added on the way past — the same shape as `tradeCalculations.test.ts`.
 *
 * WHAT IT GUARDS. His instruction, 2026-10-26: *"The tradevault should also record trades from the
 * latest at the top to the oldest at the bottom."* The list arrives ordered by when the ROW was
 * written (`server/storage.ts:519`), which for an imported trade is when the sweep ran — so the
 * case that matters most below is the mixed one: hand-typed entries and imported ones together,
 * where the two orders genuinely disagree.
 */
import { byNewestTradeFirst, newestTradeFirst, tradeSortKey } from "./tradeOrder";

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? "" : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

console.log("\nNEWEST TRADE FIRST\n");

// ── 1. THE KEY IS THE DATE THE ROW PRINTS ───────────────────────────────────────────────
check("a hand-typed entry sorts on its own entry time",
  tradeSortKey({ entryTime: "2026-10-26T14:30", createdAt: "2026-10-20T08:00:00.000Z" }),
  "2026-10-26T14:30");
check("an imported entry sorts on its own entry time, not the import moment",
  tradeSortKey({ entryTime: "2026-09-01T09:15:00.000Z", createdAt: "2026-10-25T23:59:00.000Z" }),
  "2026-09-01T09:15");
check("no entry time falls back to when the row was written",
  tradeSortKey({ entryTime: null, createdAt: "2026-10-25T23:59:00.000Z" }),
  "2026-10-25T23:59");
check("a blank entry time falls back the same way",
  tradeSortKey({ entryTime: "   ", createdAt: "2026-10-25T23:59:00.000Z" }),
  "2026-10-25T23:59");
check("a date that is not a date at all falls back rather than sorting as text",
  tradeSortKey({ entryTime: "26/10/2026", createdAt: "2026-10-25T23:59:00.000Z" }),
  "2026-10-25T23:59");
check("a Date object for createdAt is read too",
  tradeSortKey({ createdAt: new Date("2026-10-25T23:59:00.000Z") }),
  "2026-10-25T23:59");
check("nothing readable anywhere yields an empty key", tradeSortKey({}), "");

// ── 2. THE CASE HE IS SEEING: IMPORT ORDER AND TRADE ORDER DISAGREE ─────────────────────
// All four were written by one sweep within the same second, in the order the broker returned
// them — so `created_at` says nothing useful about which trade is the latest.
const imported = [
  { id: "sep-01", entryTime: "2026-09-01T09:15:00.000Z", createdAt: "2026-10-25T20:00:00.000Z" },
  { id: "oct-24", entryTime: "2026-10-24T11:02:00.000Z", createdAt: "2026-10-25T20:00:01.000Z" },
  { id: "sep-20", entryTime: "2026-09-20T15:40:00.000Z", createdAt: "2026-10-25T20:00:02.000Z" },
  { id: "oct-02", entryTime: "2026-10-02T07:30:00.000Z", createdAt: "2026-10-25T20:00:03.000Z" },
];
check("imported trades come out newest first, not in import order",
  newestTradeFirst(imported).map(e => e.id),
  ["oct-24", "oct-02", "sep-20", "sep-01"]);

// ── 3. HAND-TYPED AND IMPORTED, MIXED ───────────────────────────────────────────────────
const mixed = [
  { id: "typed-oct-26",  entryTime: "2026-10-26T14:30",          createdAt: "2026-10-26T14:35:00.000Z" },
  { id: "import-oct-24", entryTime: "2026-10-24T11:02:00.000Z",  createdAt: "2026-10-25T20:00:00.000Z" },
  { id: "typed-oct-10",  entryTime: "2026-10-10T08:00",          createdAt: "2026-10-10T08:05:00.000Z" },
  { id: "import-oct-25", entryTime: "2026-10-25T18:44:00.000Z",  createdAt: "2026-10-25T20:00:01.000Z" },
];
check("a mixed list reads newest to oldest down the column",
  newestTradeFirst(mixed).map(e => e.id),
  ["typed-oct-26", "import-oct-25", "import-oct-24", "typed-oct-10"]);

// ── 4. AN UNDATED ROW SINKS, IT DOES NOT CLAIM TO BE THE LATEST ─────────────────────────
const withUndated = [
  { id: "undated" },
  { id: "oct-24", entryTime: "2026-10-24T11:02:00.000Z" },
  { id: "oct-26", entryTime: "2026-10-26T09:00:00.000Z" },
];
check("an entry with no readable date goes to the bottom",
  newestTradeFirst(withUndated).map(e => e.id),
  ["oct-26", "oct-24", "undated"]);

// ── 5. IT MUST NOT SORT THE CACHED ARRAY WHERE IT LIES ──────────────────────────────────
// The list handed in is React Query's cached array. Sorting it in place mutates state React
// believes is immutable, and the next render can show the old order or none at all.
const original = [
  { id: "a", entryTime: "2026-09-01T09:15:00.000Z" },
  { id: "b", entryTime: "2026-10-24T11:02:00.000Z" },
];
const sorted = newestTradeFirst(original);
check("the caller's array is untouched", original.map(e => e.id), ["a", "b"]);
check("...and a new array comes back sorted", sorted.map(e => e.id), ["b", "a"]);

// ── 6. EQUAL DATES KEEP THEIR PLACE, SO THE LIST DOES NOT RESHUFFLE ON EVERY RENDER ─────
check("two entries at the same minute compare equal",
  byNewestTradeFirst({ entryTime: "2026-10-24T11:02:00.000Z" },
                     { entryTime: "2026-10-24T11:02:33.000Z" }), 0);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
