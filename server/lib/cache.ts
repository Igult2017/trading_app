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
