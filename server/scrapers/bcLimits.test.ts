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

console.log("\nTHE THREE SLOTS — 10 min after each open (21 Nov 2026). November: Sydney = UTC+11, London = UTC, NY = UTC-5");
const winter = slotsAround(at("2026-11-18T12:00:00Z")).map((s) => `${s.slot} ${s.at.toISOString().slice(5, 16)}`);
check("Sydney 08:10 = 21:10 UTC the evening before; London 08:10; New York 13:10 UTC", winter,
  ["asia 11-17T21:10", "ln 11-18T08:10", "ny 11-18T13:10"]);
check("at 13:10 UTC → ny due", due("2026-11-18T13:10:30Z").slot, "ny");
check("at 13:09 UTC (before the slot) → nothing", due("2026-11-18T13:09:00Z").due, false);
check(`at 13:21 UTC (past the ${WINDOW_MS / 60000}-minute window) → nothing`, due("2026-11-18T13:21:00Z").due, false);
check("Sydney Wednesday 08:12 (Tue 21:12 UTC) → asia", due("2026-11-17T21:12:00Z").slot, "asia");

console.log("\nDAYLIGHT SAVING — July: Sydney = UTC+10, London = UTC+1, New York = UTC-4");
const summer = slotsAround(at("2026-07-15T12:00:00Z")).map((s) => `${s.slot} ${s.at.toISOString().slice(5, 16)}`);
check("Sydney 22:10 UTC the evening before; London 07:10; New York 12:10 UTC", summer,
  ["asia 07-14T22:10", "ln 07-15T07:10", "ny 07-15T12:10"]);

console.log("\nHIS ANSWER 7 — NO SUNDAY ASIA OPEN (Monday 08:00 in Sydney)");
check("Sunday 21:12 UTC (Sydney Monday 08:12) → nothing", due("2026-11-22T21:12:00Z").due, false);
check("Monday 21:12 UTC (Sydney Tuesday 08:12) → asia", due("2026-11-23T21:12:00Z").slot, "asia");
check("Friday 21:12 UTC (Sydney Saturday) → nothing", due("2026-11-20T21:12:00Z").due, false);
check("Thursday 21:12 UTC (Sydney Friday) → asia", due("2026-11-19T21:12:00Z").slot, "asia");

console.log("\nONCE PER SLOT, AND BACK OFF WHEN REFUSED");
const ran: BcRun[] = [{ kind: "ny", startedAt: at("2026-11-18T13:10:10Z"), blocked: false }];
check("ny already ran → not again in its window", due("2026-11-18T13:12:00Z", ran).due, false);
const refused: BcRun[] = [{ kind: "ln", startedAt: at("2026-11-18T08:10:10Z"), blocked: true }];
check("blocked at London → the rest of that UTC day is skipped (ny not run)", due("2026-11-18T13:10:30Z", refused).due, false);
check("...and the next day starts again (London on Thursday)", due("2026-11-19T08:11:00Z", refused).slot, "ln");

console.log("\nWEEKEND");
check("Saturday 13:10 UTC → nothing", due("2026-11-21T13:10:30Z").due, false);
check("Sunday 08:10 UTC → nothing", due("2026-11-22T08:10:30Z").due, false);

console.log(`\n${bad ? `${bad} of ${n} FAILED` : "ALL PASS"} (${n} checks)`);
process.exit(bad ? 1 : 0);
