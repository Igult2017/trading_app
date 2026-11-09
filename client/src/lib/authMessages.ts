/**
 * authMessages.ts — turns whatever a sign-in failure came back as into words a person can act on.
 *
 * WHY IT EXISTS. On 2026-11-08 password reset could not be completed at all, and the headline fault
 * was that the page could say NOTHING when the attempt failed (docs/MAP.md, docs/OPEN.md C17). While
 * proving the fix I hit the smaller version of the same thing: with the network blocked the page
 * showed the browser's raw **"Failed to fetch"**. That is a message, which beats the silence it
 * replaced — but it is not one he can act on, and the whole point of the change was that every
 * outcome says something useful.
 *
 * ⚠ IT IS SHARED ON PURPOSE. Two screens change a password — the reset page and the "Change
 * password" box in Profile Settings — and they had already drifted apart once: the reset page could
 * not report a thrown failure at all while the profile box could not clear its spinner. One function
 * means the two cannot give different words for the same failure again.
 *
 * ⚠ IT NEVER INVENTS A REASON. Anything it does not recognise is passed through untouched, because a
 * wrong explanation is worse than a technical one — the reader at least knows a raw message is raw.
 */

/** The known-unreadable cases, each mapped to what the reader should actually DO next. */
const PATTERNS: Array<[RegExp, string]> = [
  // The browser's own wording when a request never left, or never came back.
  [/failed to fetch|networkerror|load failed|fetch failed|network request failed/i,
   'Could not reach the server. Check your connection and try again.'],
  // The login library's own 5-second wait for its turn (GoTrueClient lockAcquireTimeout). It is a
  // plain error, not a login error, so the library THROWS it rather than handing it back - which is
  // exactly how it used to reach nothing at all.
  [/acquire|timeout|timed out/i,
   'The page was busy and timed out. Please try again.'],
  [/session|jwt|refresh token/i,
   'Your sign-in has expired. Please request a new reset link from the sign-in page.'],
];

/**
 * @param msg      whatever the failure carried, if anything
 * @param fallback what to say when there was no message at all
 */
export function readableAuthError(msg?: string | null, fallback = 'Something went wrong. Please try again.'): string {
  const m = (msg ?? '').trim();
  if (!m) return fallback;
  for (const [pattern, plain] of PATTERNS) if (pattern.test(m)) return plain;
  return m;
}
