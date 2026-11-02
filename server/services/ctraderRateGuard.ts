/**
 * ONE BRAKE FOR EVERY cTRADER CONNECTION NODE OPENS — the thing D63 was missing.
 *
 * WHY THIS EXISTS. 94% of one production log (4,714 of 5,000 lines) was a single message repeating
 * across four accounts: `cTrader: You are being rate limited`. The cause was not the refusal itself —
 * it was that being refused made the code open MORE connections, not fewer. A flat 15-second retry, a
 * second retry driver every 60 seconds, and an unbounded reconnect loop all pushed harder the longer
 * it stayed broken, so the refusal fed itself and could never clear.
 *
 * WHY THE BRAKE IS SHARED RATHER THAN PER-ACCOUNT. This is the design decision that matters, and the
 * one an ordinary "add exponential backoff" fix gets wrong. Four accounts each backing off politely on
 * their own still hammer the SAME cTrader application: Spotware refused to approve a second one, so the
 * signal scanner, account syncing and copy trading all share one permanently
 * (`ctraderConnPool.ts:5-8`). A per-account brake would therefore slow each account down and leave the
 * total load — the thing actually being refused — unchanged.
 *
 * WHETHER THE LIMIT IS PER APPLICATION OR PER CONNECTION IS NOT KNOWN, and that is handled rather than
 * guessed. Documented: 50 requests/sec (5/sec for history) per CONNECTION. Forum-only and flagged
 * unverified: ~25 connections per APPLICATION (`docs/ctrader-open-api-apps.md:85-86`). cTrader
 * publishes no page carrying the words "You are being rate limited"; the nearest thing is
 * `BLOCKED_PAYLOAD_TYPE` ("Message is blocked by server or rate limit is reached"), which this repo hit
 * once before and cured by PACING (`docs/OPEN.md` B29). An application-wide brake is correct under
 * EITHER answer, so the unknown stops mattering instead of being bet on — the same reasoning that set
 * the connection cap at 8: "Sitting at 8 makes the unknown irrelevant rather than betting on it."
 *
 * ⚠ IT IS NODE'S BRAKE ONLY. The Python signal platform and the copy engine are separate processes with
 * their own connections. Node standing down does NOT stand them down. Stated so nobody reads a quiet
 * Node log as proof the whole platform has backed off.
 */

/** What kind of refusal was that? The three answers need three different responses. */
export type Refusal = 'rate-limited' | 'login-rejected' | 'other';

/**
 * ⚠ CHECKED IN THIS ORDER, and the order is load-bearing. A rate-limit refusal must never be read as a
 * login problem: treating it as one burns a token refresh — which ROTATES the shared ticket and can
 * invalidate every sibling account's copy (`docs/ctrader-open-api-apps.md:91`) — to cure a problem that
 * was only ever "you asked too often".
 */
const RATE_LIMITED = /rate[\s-]?limit|too many requests|BLOCKED_PAYLOAD_TYPE|REQUEST_FREQUENCY_EXCEEDED/i;

/**
 * ⚠ `ACCESS_DENIED` IS IN HERE BECAUSE IT WAS MISSING, and that absence was its own defect. The
 * one-shot token refresh only fired on text containing "2142", "token" or "auth"
 * (`ctraderRealtime.ts:139`), and cTrader's own words for a dead login are "Access denied. Make sure
 * the credentials are valid." (measured 25 Oct, `docs/ctrader-open-api-apps.md:90`) — which match none
 * of the three. So a genuinely expired login was never retried with a fresh one.
 */
const LOGIN_REJECTED = /2142|access[\s_-]?denied|invalid[\s_-]?token|token|unauthori[sz]ed|not authori[sz]ed|auth/i;

export function classify(message: unknown): Refusal {
  const m = String(message ?? '');
  if (RATE_LIMITED.test(m)) return 'rate-limited';
  if (LOGIN_REJECTED.test(m)) return 'login-rejected';
  return 'other';
}

// ── THE SHARED STAND-DOWN ─────────────────────────────────────────────────────

/** First stand-down after a refusal. Doubles on each re-trip, so a persistent refusal costs little. */
const BASE_STAND_DOWN_MS = 30_000;
const MAX_STAND_DOWN_MS = 10 * 60_000;

/** Per-account retry wait. Base matches the old flat RECONNECT_MS so nothing gets FASTER than before. */
const BASE_RETRY_MS = 15_000;
const MAX_RETRY_MS = 5 * 60_000;

let standDownUntil = 0;                       // epoch ms; 0 = not standing down
let standDownStep = 0;                        // how many times in a row we have been refused
let prober: string | null = null;             // the one account allowed to test the water
const retryStep = new Map<string, number>();  // accountId -> consecutive failures

function clampDouble(base: number, step: number, max: number): number {
  return Math.min(max, base * 2 ** Math.max(0, step));
}

/**
 * The broker refused us for asking too often. Everything stands down, together.
 *
 * Returns how long the wait is, so the caller can SAY it rather than going quiet for ten minutes with
 * no explanation anywhere.
 */
export function noteRateLimited(now = Date.now()): {
  untilMs: number; waitMs: number; step: number; fresh: boolean;
} {
  // ⚠ A BURST COUNTS ONCE. At boot four accounts attach at the same moment, so one rate limit can come
  // back as four refusals within milliseconds. Escalating on each would take the wait from 30 seconds
  // straight to four minutes for what is a single event — and would do it again on every later burst,
  // reaching the ten-minute cap while the limit itself may have been momentary. Already standing down
  // means the answer is already known.
  if (isStandingDown(now)) {
    return { untilMs: standDownUntil, waitMs: standDownRemainingMs(now), step: standDownStep, fresh: false };
  }
  const waitMs = clampDouble(BASE_STAND_DOWN_MS, standDownStep, MAX_STAND_DOWN_MS);
  standDownStep += 1;
  standDownUntil = now + waitMs;
  prober = null;                              // whoever was testing the water has its answer
  return { untilMs: standDownUntil, waitMs, step: standDownStep, fresh: true };
}

/**
 * A connection actually worked. The brake comes fully off.
 *
 * ⚠ ONLY A REAL SUCCESS CLEARS THE ESCALATION. If letting the window merely expire reset the step, a
 * refusal every ten minutes would be re-tried for ever at the 30-second starting wait — which is how a
 * brake quietly becomes no brake at all.
 */
export function noteSuccess(): void {
  standDownUntil = 0;
  standDownStep = 0;
  prober = null;
}

export function standDownRemainingMs(now = Date.now()): number {
  return Math.max(0, standDownUntil - now);
}

export function isStandingDown(now = Date.now()): boolean {
  return standDownRemainingMs(now) > 0;
}

/**
 * MAY THIS ACCOUNT TRY RIGHT NOW?
 *
 * Three states, and the middle one is the point:
 *   * standing down      -> nobody tries;
 *   * recovering         -> exactly ONE account tries, so finding out whether the limit has lifted
 *                           costs one request instead of four — and if the real problem turns out to be
 *                           a dead login, one account says so instead of four shouting it;
 *   * never been refused -> everybody goes, exactly as before.
 */
export function mayAttempt(accountId: string, now = Date.now()): boolean {
  if (isStandingDown(now)) return false;
  if (standDownStep === 0) return true;       // nothing has gone wrong; no gate at all
  if (prober === null) { prober = accountId; return true; }
  return prober === accountId;
}

/** This account's turn at testing the water is over, however it went. */
export function endAttempt(accountId: string): void {
  if (prober === accountId) prober = null;
}

// ── PER-ACCOUNT RETRY WAIT ────────────────────────────────────────────────────

/** The wait for the Nth consecutive failure, WITHOUT randomness — the pure part, so it is testable. */
export function retryStepMs(step: number): number {
  return clampDouble(BASE_RETRY_MS, step, MAX_RETRY_MS);
}

/**
 * How long before this account tries again — growing, capped, and SPREAD OUT.
 *
 * ⚠ THE RANDOMNESS IS NOT DECORATION. Four accounts that fail together and wait an identical time come
 * back in lockstep for ever, which is four simultaneous requests every round — the exact shape that
 * provokes the refusal. A spread of ±25% breaks the convoy up.
 *
 * ⚠ AND IT NEVER RETURNS LESS THAN THE STAND-DOWN. A 15-second retry inside a 10-minute stand-down is
 * 40 pointless wake-ups, each one a log line; the wait is whichever is longer.
 */
export function nextRetryMs(accountId: string, now = Date.now()): number {
  const step = retryStep.get(accountId) ?? 0;
  retryStep.set(accountId, step + 1);
  const base = retryStepMs(step);
  const jittered = Math.round(base + (Math.random() * 2 - 1) * base * 0.25);
  return Math.max(jittered, standDownRemainingMs(now));
}

/** This account connected — forget its failure history so the next problem starts from the bottom. */
export function forget(accountId: string): void {
  retryStep.delete(accountId);
  endAttempt(accountId);
}

/** For the capacity endpoint and the boot line — why is nothing connecting? */
export function guardStats(now = Date.now()): {
  standingDown: boolean; standDownMs: number; standDownStep: number;
  probing: string | null; accountsBackingOff: number;
} {
  return {
    standingDown: isStandingDown(now),
    standDownMs: standDownRemainingMs(now),
    standDownStep,
    probing: prober,
    accountsBackingOff: retryStep.size,
  };
}

/** Tests only. */
export function _resetForTests(): void {
  standDownUntil = 0;
  standDownStep = 0;
  prober = null;
  retryStep.clear();
}
