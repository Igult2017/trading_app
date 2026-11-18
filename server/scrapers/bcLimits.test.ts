/**
 * bcLimits.test.ts — run with:  npx tsx server/scrapers/bcLimits.test.ts
 *
 * Pins his rule (19 Nov 2026): six fetches a day — five minutes after the Asia, London and New York opens, and again
 * 15 minutes later — and his "disable it first". Every rule is driven on hand-made clocks, incl. daylight saving.
 */
import { decide, slotsAround, WINDOW_MS, type BcRun } from "./bcLimits";

let bad = 0, n = 0;
function check(name: string, got: unknown, want: unknown) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `, want ${JSON.stringify(want)}`}`);
  if (!ok) bad++;
}
const at = (iso: string) => new Date(iso);
const due = (iso: string, runs: BcRun[] = []) => decide(runs, at(iso));

console.log("SWITCHED OFF BY DEFAULT (his 'disable it first')");
delete process.env.BARCHART_ENABLED;
check("no env var → never due, even at a slot minute", due("2026-11-18T13:05:00Z").due, false);
process.env.BARCHART_ENABLED = "false";
check("BARCHART_ENABLED=false → never due", due("2026-11-18T13:05:00Z").reason.startsWith("switched off"), true);
process.env.BARCHART_ENABLED = "true";

console.log("\nTHE SIX SLOTS — winter (18 Nov 2026: London = UTC, New York = UTC-5, Tokyo = UTC+9)");
const winter = slotsAround(at("2026-11-18T12:00:00Z")).map((s) => `${s.slot} ${s.at.toISOString().slice(11, 16)}`);
check("asia 00:05 / 00:20, london 08:05 / 08:20, new york 13:05 / 13:20 UTC", winter,
  ["asia-1 00:05", "asia-2 00:20", "ln-1 08:05", "ln-2 08:20", "ny-1 13:05", "ny-2 13:20"]);
check("at 13:05 UTC → ny-1 due", due("2026-11-18T13:05:30Z").slot, "ny-1");
check("at 13:20 UTC → ny-2 due (15 minutes later)", due("2026-11-18T13:21:00Z").slot, "ny-2");
check("at 13:04 UTC (before the slot) → nothing", due("2026-11-18T13:04:00Z").due, false);
check(`at 13:16 UTC (past the ${WINDOW_MS / 60000}-minute window, before ny-2) → nothing`, due("2026-11-18T13:16:00Z").due, false);
check("Asia: 00:07 UTC Wednesday → asia-1", due("2026-11-18T00:07:00Z").slot, "asia-1");

console.log("\nDAYLIGHT SAVING — summer (15 Jul 2026: London = UTC+1, New York = UTC-4)");
const summer = slotsAround(at("2026-07-15T12:00:00Z")).map((s) => `${s.slot} ${s.at.toISOString().slice(11, 16)}`);
check("london 07:05 / 07:20, new york 12:05 / 12:20 UTC; asia unchanged", summer,
  ["asia-1 00:05", "asia-2 00:20", "ln-1 07:05", "ln-2 07:20", "ny-1 12:05", "ny-2 12:20"]);

console.log("\nONCE PER SLOT, AND BACK OFF WHEN REFUSED");
const ran: BcRun[] = [{ kind: "ny-1", startedAt: at("2026-11-18T13:05:10Z"), blocked: false }];
check("ny-1 already ran → not again in its window", due("2026-11-18T13:08:00Z", ran).due, false);
check("...but ny-2 still runs", due("2026-11-18T13:20:30Z", ran).slot, "ny-2");
const refused: BcRun[] = [{ kind: "ln-1", startedAt: at("2026-11-18T08:05:10Z"), blocked: true }];
check("blocked at London → the rest of that day is skipped (ny-1 not run)", due("2026-11-18T13:05:30Z", refused).due, false);
check("...and the next day starts again (asia-1 on Thursday)", due("2026-11-19T00:05:30Z", refused).slot, "asia-1");

console.log("\nWEEKEND");
check("Saturday 13:05 UTC → nothing", due("2026-11-21T13:05:30Z").due, false);
check("Sunday 08:05 UTC → nothing", due("2026-11-22T08:05:30Z").due, false);
check("Monday 00:05 UTC (Tokyo Monday 09:05) → asia-1", due("2026-11-23T00:05:30Z").slot, "asia-1");

console.log(`\n${bad ? `${bad} of ${n} FAILED` : "ALL PASS"} (${n} checks)`);
process.exit(bad ? 1 : 0);
