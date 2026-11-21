/**
 * bcLimits.ts — WHEN the Barchart gold-options (Greeks & volatility) scraper may run. Pure: no database, so every rule
 * is provable (`bcLimits.test.ts`). `bcSchedule.ts` is only the plumbing that fetches the runs and calls `decide`.
 *
 * HIS RULE, 21 Nov 2026 (replacing the 19 Nov six-a-day): ONCE per market open, 10 minutes after it — his options
 * guide: "London … New York … Asia market open (10 minutes after Sydney market open)". Answer 7: "Leave the Sunday
 * Asian open out because it is complicated" — that open is Monday 08:00 in Sydney, so Sydney runs Tue-Fri.
 *
 *   ASIA      Sydney   08:00 local  → asia at 08:10 (Tue-Fri, Sydney's day)
 *   LONDON    London   08:00 local  → ln   at 08:10 (Mon-Fri)
 *   NEW YORK  New York 08:00 local  → ny   at 08:10 (Mon-Fri)
 * What each run reads and posts: `docs/barchart-levels-plan.md`.
 * The opens are the platform's own (`signal_platform/scheduler/session_windows.py`); each city's own clock handles
 * daylight saving. A slot may start from its minute until `WINDOW_MS` after it, ONCE — a slot that has run (ok or not)
 * is never run again that day. No slot on a Saturday or a Sunday (markets shut). After a BLOCKED answer the rest of
 * that UTC day is skipped: being refused must mean waiting, never asking again harder.
 *
 * ⚠ SWITCHED OFF BY DEFAULT (`BARCHART_ENABLED`), his "disable it first". Unlike MyFXBook (default on), nothing depends
 * on this yet, so an env var nobody set must leave it OFF.
 */

export type BcSlot = "asia" | "ln" | "ny";
export interface BcDecision { due: boolean; slot: BcSlot | null; reason: string; }
export interface BcRun { kind: string; startedAt: Date; blocked: boolean | null; }

export const WINDOW_MS = 10 * 60_000;
const OPENS: { zone: string; hour: number; name: BcSlot }[] = [
  // SYDNEY, NOT TOKYO (his guide, 21 Nov 2026: "10 minutes after Sydney market open") — 08:00 local, the platform's
  // own Sydney hour (`signal_platform/scheduler/session_windows.py:17`).
  { zone: "Australia/Sydney", hour: 8, name: "asia" },
  { zone: "Europe/London", hour: 8, name: "ln" },
  { zone: "America/New_York", hour: 8, name: "ny" },
];
const AFTER_OPEN_MIN = 10;          // ONE run, 10 minutes after each open (his guide, 21 Nov 2026)

export const bcNo = (reason: string): BcDecision => ({ due: false, slot: null, reason });

export function barchartEnabled(): boolean {
  return (process.env.BARCHART_ENABLED ?? "false").toLowerCase() === "true";
}

/** The UTC instant of `hh:mm` local time in `zone` on the local date that `at` falls on there. */
function localTime(at: Date, zone: string, hour: number, minute: number): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const offset = wallAsUtc - Math.floor(at.getTime() / 60_000) * 60_000;      // the zone's offset at `at`
  const target = Date.UTC(get("year"), get("month") - 1, get("day"), hour, minute) - offset;
  // one correction if a daylight-saving change sits between `at` and the target
  const parts2 = new Intl.DateTimeFormat("en-CA", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(target));
  const h2 = Number(parts2.find((p) => p.type === "hour")!.value);
  return new Date(target + (hour - h2) * 3_600_000);
}

/** Every slot of the local day `now` falls in, for each city: [{ slot, at }]. */
export function slotsAround(now: Date): { slot: BcSlot; at: Date }[] {
  const out: { slot: BcSlot; at: Date }[] = [];
  for (const o of OPENS) out.push({ slot: o.name, at: localTime(now, o.zone, o.hour, AFTER_OPEN_MIN) });
  return out;
}

/** @param runs Barchart runs in the last 24h, any order. */
export function decide(runs: BcRun[], now: Date): BcDecision {
  if (!barchartEnabled()) return bcNo("switched off (BARCHART_ENABLED is not true)");
  const dayUtc = now.toISOString().slice(0, 10);
  if (runs.some((r) => r.blocked && r.startedAt.toISOString().slice(0, 10) === dayUtc)) {
    return bcNo("blocked earlier today — waiting until tomorrow");
  }
  for (const { slot, at } of slotsAround(now)) {
    const localDay = new Intl.DateTimeFormat("en-US", {
      timeZone: OPENS.find((o) => slot.startsWith(o.name))!.zone, weekday: "short",
    }).format(at);
    if (localDay === "Sat" || localDay === "Sun") continue;
    // NO SUNDAY ASIA OPEN (his answer 7, 21 Nov 2026: "Leave the Sunday Asian open out because it is complicated") —
    // that open is MONDAY 08:00 in Sydney (Sunday evening in Kenya).
    if (slot === "asia" && localDay === "Mon") continue;
    const t = now.getTime() - at.getTime();
    if (t < 0 || t >= WINDOW_MS) continue;
    const done = runs.some((r) => r.kind === slot && Math.abs(r.startedAt.getTime() - at.getTime()) < 6 * 3_600_000);
    if (done) return bcNo(`${slot} already ran`);
    return { due: true, slot, reason: `${slot} (${at.toISOString().slice(11, 16)} UTC)` };
  }
  return bcNo("no slot now");
}
