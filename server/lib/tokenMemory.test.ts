/**
 * tokenMemory.test.ts — run with:
 *     npx tsx server/lib/tokenMemory.test.ts
 *
 * A CONFIRMED LOGIN TOKEN IS REMEMBERED FOR AT MOST 30 SECONDS, AND NEVER PAST ITS OWN EXPIRY.
 *
 * His question, 2026-09-15: "Why is the logout and log in too slow." Every signed-in request asked
 * Supabase about its token (+0.23-0.27s each, measured). The memory removes the repeats; these checks
 * hold the two promises that make it acceptable: the 30-second ceiling, and the token's own expiry.
 */
import { createTokenMemory, TTL_MS, tokenExpiryMs } from './tokenMemory';

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

/** A token shaped like Supabase's: header.payload.signature, with only `exp` in the payload. */
const token = (expSeconds: number, salt = '') =>
  ['h', Buffer.from(JSON.stringify({ exp: expSeconds, salt })).toString('base64url'), 's'].join('.');

const START = 1_789_000_000_000;
let clock = START;
const memory = createTokenMemory<string>(() => clock);

// ── the 30-second ceiling ───────────────────────────────────────────────────
const longLived = token(START / 1000 + 3600);
memory.remember(longLived, 'user-1');
check('a confirmed token is remembered', memory.get(longLived), 'user-1');
clock = START + TTL_MS - 1;
check('...still remembered just before 30 seconds', memory.get(longLived), 'user-1');
clock = START + TTL_MS + 1;
check('...and forgotten after 30 seconds, although the token itself is still valid', memory.get(longLived), null);

// ── never past the token's own expiry ───────────────────────────────────────
clock = START;
const expiresSoon = token(START / 1000 + 10);
memory.remember(expiresSoon, 'user-2');
clock = START + 9_000;
check('a token expiring in 10 seconds is remembered before then', memory.get(expiresSoon), 'user-2');
clock = START + 10_500;
check('...and forgotten at its OWN expiry, well before 30 seconds', memory.get(expiresSoon), null);

// ── what is never remembered ────────────────────────────────────────────────
clock = START;
const expired = token(START / 1000 - 5);
memory.remember(expired, 'user-3');
check('an already-expired token is never remembered', memory.get(expired), null);
memory.remember('not-a-login-token', 'user-4');
check('a token with no readable expiry is never remembered', memory.get('not-a-login-token'), null);

// ── one token cannot answer for another ─────────────────────────────────────
memory.remember(token(START / 1000 + 3600, 'a'), 'user-5');
check('a different token is not answered by a remembered one', memory.get(token(START / 1000 + 3600, 'b')), null);

check('the expiry is read from the token', tokenExpiryMs(token(123)), 123_000);

console.log(fail ? `${fail} of ${pass + fail} FAILED` : `ALL PASS (${pass} checks)`);
process.exit(fail ? 1 : 0);
