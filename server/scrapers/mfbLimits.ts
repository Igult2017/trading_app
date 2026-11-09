/**
 * mfbLimits — WHEN we are allowed to ask MyFXBook, and when we actually need to.
 *
 * ⚠ NO DATABASE IMPORT IN THIS FILE, AND THAT IS THE POINT. `server/db.ts` THROWS at import time
 * when DATABASE_URL is unset (db.ts:20), so anything that touches it cannot be run from a command
 * line. This is the part he asked for by name — *"remember rate limiting so that myfxbook doesnt
 * block as for ever"* — so it has to be provable, and a rule that can only run against a live
 * database is a rule nobody tests. `mfbSchedule.ts` holds the plumbing that reads the real rows
 * and calls `decide` here; `mfbLimits.test.ts` drives every branch below.
 */


/** Minimum gap between ANY two MyFXBook fetches. */
const MIN_GAP_MS = 15 * 60_000;

/** Hard ceiling per rolling 24 hours. Expected real use is 3-6, so this is a backstop that holds
 *  even if the logic above it is wrong — not a target. */
const MAX_PER_DAY = 20;

/**
 * HOW OFTEN WE SWEEP THE WHOLE CALENDAR AGAIN.
 *
 * ⚠ THIS WAS 20 HOURS AND THAT WAS WRONG — his correction, 2026-11-09: *"also check at a good
 * interval for any news that has been posted that we did not persist so that we dont miss
 * anything."* A once-a-day fetch stores whatever is listed at that moment; an event ADDED to the
 * calendar an hour later would not be seen until the next day, and a release we never stored is a
 * release the bot's news guard cannot protect against.
 *
 * HIS TWO IDEAS ARE ONE FETCH, so they are merged rather than built twice. "Collect it once and
 * keep it" and "check again for anything new" are the same request to the same page — the second
 * is simply the first, repeated.
 *
 * ⚠ FOUR HOURS IS A STARTING POINT, NOT A MEASUREMENT, and is marked as one so it cannot harden
 * into a fact. `new_count` on every run records how many events arrived that we did not already
 * hold, so after a week the right interval is a number in the table rather than an opinion. Finding
 * 0 new every time means this can lengthen; finding events due within hours means it must shorten.
 */
const SWEEP_EVERY_MS = 4 * 60 * 60_000;

/** A fetch in flight for longer than this is presumed dead, so a crashed run cannot wedge the lock
 *  shut for ever. Comfortably past the slowest measured run (381s) plus container start. */
const STUCK_AFTER_MS = 12 * 60_000;

/** How long after a release to look for the number, and when to give up.
 *  ⚠ The existing ladder is [2, 5, 10, 15] minutes (scheduler.ts) and CANNOT be used here: a single
 *  fetch takes longer than the first three rungs put together. */
export const RELEASE_FIRST_MS = 6 * 60_000;
export const RELEASE_GIVE_UP_MS = 45 * 60_000;
const RELEASE_MAX_TRIES = 2;

/** Being refused must make us wait LONGER, never try harder. Capped so it recovers on its own. */
const BACKOFF_MS = [30, 60, 120, 240, 360].map((m) => m * 60_000);

export type DueKind = "sweep" | "release";
export interface DueDecision { due: boolean; kind: DueKind | null; reason: string; }

export const no = (reason: string): DueDecision => ({ due: false, kind: null, reason });

/** True unless it has been switched off. Default ON, because an env var nobody set must not
 *  silently disable the source the calendar now depends on. */
export function myfxbookEnabled(): boolean {
  return (process.env.MYFXBOOK_ENABLED ?? "true").toLowerCase() !== "false";
}

/** The minimum a run has to look like for the rules below. Kept narrow so the decision can be
 *  tested without a database. */
export interface RunRow {
  kind: string; startedAt: Date; finishedAt: Date | null; ok: boolean | null; blocked: boolean | null;
}
/** A release we are still missing a number for. */
export interface PendingRelease { eventTime: Date; }

/**
 * THE WHOLE RATE-LIMITING DECISION, AS A PURE FUNCTION.
 *
 * ⚠ SEPARATED FROM THE DATABASE ON PURPOSE. This is the part he asked for by name — *"remember
 * rate limiting so that myfxbook doesnt block as for ever"* — so it has to be PROVABLE, and a rule
 * that can only run against a live database is a rule nobody tests. `mfbSchedule.test.ts` drives
 * every branch here with made-up histories; `decideDue` below is only the plumbing that fetches
 * the real rows and calls this.
 *
 * @param runs    MyFXBook runs in the last 24h, NEWEST FIRST
 * @param pending releases that are due a number we do not have
 */
export function decide(runs: RunRow[], pending: PendingRelease[], now: Date): DueDecision {
  const recent = runs;

  // 1. ONE AT A TIME. Two browsers on a 2-CPU box is how this machine fell over on 2026-09-07.
  const inFlight = recent.find((r) => !r.finishedAt &&
    now.getTime() - new Date(r.startedAt).getTime() < STUCK_AFTER_MS);
  if (inFlight) return no("a fetch is already running");

  // 2. The ceiling, counted over attempts — failures included, or being blocked would cost nothing.
  if (recent.length >= MAX_PER_DAY) return no(`daily ceiling reached (${recent.length}/${MAX_PER_DAY})`);

  // 3. The minimum gap, measured from the last ATTEMPT.
  const last = recent[0];
  if (last) {
    const since = now.getTime() - new Date(last.startedAt).getTime();
    if (since < MIN_GAP_MS) return no(`only ${Math.round(since / 60_000)} min since the last fetch`);

    // 4. BACKOFF. Count how many times in a row we were refused and wait the matching interval.
    //    Being refused must slow us down; it must never turn into retrying harder.
    if (last.blocked) {
      let streak = 0;
      for (const r of recent) { if (r.blocked) streak++; else break; }
      const wait = BACKOFF_MS[Math.min(streak - 1, BACKOFF_MS.length - 1)];
      if (since < wait) {
        return no(`backing off after ${streak} refusal(s): ${Math.round((wait - since) / 60_000)} min left`);
      }
    }
  }

  // 5. THE SWEEP: collect everything listed and keep it, and catch anything POSTED since last time.
  const lastGoodSweep = recent.find((r) => r.kind === "sweep" && r.ok);
  if (!lastGoodSweep ||
      now.getTime() - new Date(lastGoodSweep.startedAt).getTime() > SWEEP_EVERY_MS) {
    const hrs = lastGoodSweep
      ? Math.round((now.getTime() - new Date(lastGoodSweep.startedAt).getTime()) / 3_600_000)
      : null;
    return {
      due: true,
      kind: "sweep",
      reason: hrs === null ? "no successful sweep on record" : `last successful sweep was ${hrs}h ago`,
    };
  }

  // 6. A NUMBER WE ARE STILL MISSING. Only Medium and High are worth a 6-minute browser.
  if (pending.length === 0) return no("nothing published recently that we are missing");

  // Stop after RELEASE_MAX_TRIES attempts since the OLDEST thing we are waiting on, so a figure
  // that is simply never published cannot keep a browser running all afternoon.
  const oldest = pending.reduce((a, b) => (a.eventTime < b.eventTime ? a : b)).eventTime;
  const triesSince = recent.filter((r) => r.kind === "release" &&
    new Date(r.startedAt) >= new Date(oldest)).length;
  if (triesSince >= RELEASE_MAX_TRIES) {
    return no(`already tried ${triesSince}x for this release; not asking again`);
  }

  return {
    due: true,
    kind: "release",
    reason: `${pending.length} release(s) still missing a number (try ${triesSince + 1}/${RELEASE_MAX_TRIES})`,
  };
}
