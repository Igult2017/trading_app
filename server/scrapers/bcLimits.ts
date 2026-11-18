/**
 * bcLimits.ts — WHEN the Barchart gold-options (Greeks & volatility) scraper may run. Pure: no database, so every rule
 * is provable (`bcLimits.test.ts`). `bcSchedule.ts` is only the plumbing that fetches the runs and calls `decide`.
 *
 * HIS RULE, 19 Nov 2026: *"It only scrapes six time the whole day. Twice at an interval of 15 minutes at NY LN and
 * Asia open. Five minutes after the open of each market. After creating it just disable it first."*
 *
 *   ASIA      Tokyo    09:00 local  → asia-1 at 09:05, asia-2 at 09:20
 *   LONDON    London   08:00 local  → ln-1   at 08:05, ln-2   at 08:20
 *   NEW YORK  New York 08:00 local  → ny-1   at 08:05, ny-2   at 08:20
 * The opens are the platform's own (`signal_platform/scheduler/session_windows.py`); each city's own clock handles
 * daylight saving. A slot may start from its minute until `WINDOW_MS` after it, ONCE — a slot that has run (ok or not)
 * is never run again that day. No slot on a Saturday or a Sunday (markets shut). After a BLOCKED answer the rest of
 * that UTC day is skipped: being refused must mean waiting, never asking again harder.
 *
 * ⚠ SWITCHED OFF BY DEFAULT (`BARCHART_ENABLED`), his "disable it first". Unlike MyFXBook (default on), nothing depends
 * on this yet, so an env var nobody set must leave it OFF.
 */

export type BcSlot = "asia-1" | "asia-2" | "ln-1" | "ln-2" | "ny-1" | "ny-2";
export interface BcDecision { due: boolean; slot: BcSlot | null; reason: string; }
export interface BcRun { kind: string; startedAt: Date; blocked: boolean | null; }

export const WINDOW_MS = 10 * 60_000;
const OPENS: { zone: string; hour: number; name: "asia" | "ln" | "ny" }[] = [
  { zone: "Asia/Tokyo", hour: 9, name: "asia" },
  { zone: "Europe/London", hour: 8, name: "ln" },
  { zone: "America/New_York", hour: 8, name: "ny" },
];
const AFTER_OPEN_MIN = [5, 20];     // five minutes after the open, then 15 minutes later

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
  for (const o of OPENS) {
    AFTER_OPEN_MIN.forEach((m, i) => {
      out.push({ slot: `${o.name}-${i + 1}` as BcSlot, at: localTime(now, o.zone, o.hour, m) });
    });
  }
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
    const t = now.getTime() - at.getTime();
    if (t < 0 || t >= WINDOW_MS) continue;
    const done = runs.some((r) => r.kind === slot && Math.abs(r.startedAt.getTime() - at.getTime()) < 6 * 3_600_000);
    if (done) return bcNo(`${slot} already ran`);
    return { due: true, slot, reason: `${slot} (${at.toISOString().slice(11, 16)} UTC)` };
  }
  return bcNo("no slot now");
}
