import { createHash } from 'crypto';

/**
 * REMEMBER A CONFIRMED LOGIN TOKEN FOR A FEW SECONDS, so a burst of requests asks Supabase once.
 *
 * His question, 2026-09-15: *"Why is the logout and log in too slow."* Every signed-in request asked
 * Supabase whether its token was real (`verifyToken` -> `auth.getUser`), measured from production at
 * +0.23-0.27s per request, and the dashboard fires several at once right after login.
 *
 * THE TRADE-OFF, AGREED IN THE PLAN: a token that has been signed out keeps working on our API for at
 * most TTL_MS, and never past the token's own expiry. A refused token is never remembered (the caller
 * only remembers a token Supabase confirmed). Tokens are held as SHA-256 digests, so this memory holds
 * nothing that could be used as a login.
 */
export const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

/** The token's own expiry (the JWT `exp` claim) in epoch ms, or null if it cannot be read. */
export function tokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function createTokenMemory<T>(now: () => number = Date.now, ttlMs: number = TTL_MS) {
  const entries = new Map<string, { value: T; until: number }>();
  const digest = (token: string) => createHash('sha256').update(token).digest('hex');

  return {
    get(token: string): T | null {
      const key = digest(token);
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.until > now()) return entry.value;
      entries.delete(key);
      return null;
    },

    remember(token: string, value: T): void {
      const t = now();
      const expiry = tokenExpiryMs(token);
      if (expiry === null) return;              // unknown expiry: cannot promise not to outlive it
      const until = Math.min(t + ttlMs, expiry);
      if (until <= t) return;                   // already expired
      if (entries.size >= MAX_ENTRIES) {
        for (const [key, entry] of entries) if (entry.until <= t) entries.delete(key);
        if (entries.size >= MAX_ENTRIES) entries.clear();
      }
      entries.set(digest(token), { value, until });
    },

    size: () => entries.size,
  };
}
