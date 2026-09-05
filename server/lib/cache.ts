/**
 * Shared cache module — Redis when REDIS_URL is set, in-process Map otherwise.
 *
 * All keys are prefixed with "mfm:" to avoid collisions if Redis is shared.
 * TTLs are always in SECONDS.
 *
 * In-memory fallback is intentionally simple: no LRU, no size cap.
 * It is only safe for single-process development use.
 */
import { redis } from "./redis";

const PREFIX = "mfm:";

// ── In-memory fallback ────────────────────────────────────────────────────────
const mem = new Map<string, { v: string; exp: number }>();

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) { mem.delete(key); return null; }
  return e.v;
}
function memSet(key: string, value: string, ttlSecs: number) {
  mem.set(key, { v: value, exp: Date.now() + ttlSecs * 1000 });
}
function memDel(key: string) { mem.delete(key); }
function memDelPattern(pattern: string) {
  const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  for (const k of mem.keys()) if (re.test(k)) mem.delete(k);
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = redis ? await redis.get(PREFIX + key) : memGet(PREFIX + key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function cacheSet(key: string, value: unknown, ttlSecs: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (redis) { await redis.setex(PREFIX + key, ttlSecs, raw); }
  else { memSet(PREFIX + key, raw, ttlSecs); }
}

export async function cacheDel(key: string): Promise<void> {
  if (redis) { await redis.del(PREFIX + key); }
  else { memDel(PREFIX + key); }
}

/** Delete all keys matching a glob pattern (e.g. "metrics:userId:*"). */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (redis) {
    const keys = await redis.keys(PREFIX + pattern);
    if (keys.length) await redis.del(keys);
  } else {
    memDelPattern(PREFIX + pattern);
  }
}

// ── Compute-page cache keys, and clearing them ───────────────────────────────
// EVERY JOURNAL PAGE IS BUILT FROM ONE CACHED LIST. `resolveComputeScope` in routes.ts caches the
// user's journal entries for 5 minutes, and the calendar, drawdown, metrics and timeframe-matrix
// results are cached on top of it. So a new entry that does not clear these is INVISIBLE on every
// page until the cache expires.
//
// THIS LIVES HERE, NOT IN routes.ts, BECAUSE THE SYNC IS NOT A ROUTE. It was a local function in
// routes.ts with three callers, all of them the manual create/update/delete endpoints — so a trade
// typed into the journal form cleared the cache and a trade arriving from the broker did not.
// `brokerSyncService` cannot import from routes.ts, which is exactly why the gap existed.

/** The key a compute result is cached under. Must match routes.ts's `userSessionKey`. */
export function userSessionKey(ns: string, userId?: string, sessionId?: string): string {
  return `${ns}:${userId ?? ""}:${sessionId ?? ""}`;
}

// EVERY NAMESPACE THAT CACHES A COMPUTED PAGE MUST BE HERE, or an edit is invisible on that page
// until its TTL expires. "strategy-audit" was missing (added 2026-09-05): the audit endpoint caches
// under that key (routes.ts) and guards with `entryCount === entries.length`, and correcting a
// trade changes VALUES, not the count — so the stale page was served straight back. That is part of
// why his corrections "did not appear everywhere".
const COMPUTE_NAMESPACES = ["entries", "metrics", "calendar", "drawdown", "tfmatrix",
                            "strategy-audit"] as const;

/** Clear every cached page for one user/session, so the next request recomputes. */
export async function invalidateComputeCaches(sessionId?: string, userId?: string): Promise<void> {
  await Promise.all(COMPUTE_NAMESPACES.map(ns =>
    (userId || sessionId)
      ? cacheDel(userSessionKey(ns, userId, sessionId))
      : cacheDelPattern(`${ns}:*`)));
}
