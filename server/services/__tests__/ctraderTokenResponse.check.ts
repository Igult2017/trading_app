/**
 * A REFUSED cTRADER TOKEN MUST NEVER LOOK LIKE A SUCCESS —
 * run: npx tsx server/services/__tests__/ctraderTokenResponse.check.ts
 *
 * WHY THIS EXISTS. On 2026-10-25 four cTrader accounts lost their stored logins in one morning and
 * the signal platform crash-looped 20 times. The cause was one assumption: that a refused token
 * comes back with an error STATUS. It does not. Measured against the live endpoint with a
 * deliberately invalid refresh token:
 *
 *     POST https://connect.spotware.com/apps/token   grant_type=refresh_token
 *     HTTP_STATUS=200
 *     {"errorCode":"ACCESS_DENIED","description":"Access denied. Make sure the credentials are valid."}
 *
 * `refreshAccessToken` checked only `res.ok`, so that body was returned as a success carrying
 * `access_token: undefined`, written over the account's credentials, and `JSON.stringify` dropped
 * the key — leaving the account with NO access token, permanently, until a human signed in again.
 *
 * ⚠ THE 200 CASE IS THE ONE THAT MATTERS. A test that only checks 4xx would have passed on the
 * broken code. The first check below is the whole reason this file exists.
 *
 * These run against the REAL exported functions with `fetch` swapped for the real recorded bodies —
 * not a re-implementation of the parsing, which is exactly what was wrong in the first place.
 */
import { refreshAccessToken, exchangeCodeForTokens } from '../brokerAdapters/ctrader';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

process.env.CTRADER_CLIENT_ID     ||= 'test-client';
process.env.CTRADER_CLIENT_SECRET ||= 'test-secret';

const realFetch = globalThis.fetch;
/** Answer the next token call with this exact status and body. */
function reply(status: number, body: unknown) {
  globalThis.fetch = (async () => ({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as any;
}
/** What happened when we called it: the thrown message, or the credentials it would have stored. */
async function attempt(fn: () => Promise<any>): Promise<{ threw: string | null; got: any }> {
  try { return { threw: null, got: await fn() }; }
  catch (err: any) { return { threw: String(err?.message ?? err), got: null }; }
}

console.log('\ncTRADER TOKEN RESPONSES\n');

(async () => {
  // ── 1. THE REAL REFUSAL — status 200, error in the body ───────────────────────────────
  // The exact body production received. This is the check the old code failed.
  reply(200, { errorCode: 'ACCESS_DENIED', description: 'Access denied. Make sure the credentials are valid.' });
  const refused = await attempt(() => refreshAccessToken('a-spent-ticket', 'legacy'));
  check('a 200 carrying errorCode is treated as a FAILURE, not a success', refused.threw !== null, true);
  check('...and nothing is handed back that could be written over a login', refused.got, null);
  check('...and the thrown message names the code so the log says WHY',
        /ACCESS_DENIED/.test(refused.threw ?? ''), true);
  check('...and it carries cTrader own words, not ours',
        /Access denied\. Make sure the credentials are valid\./.test(refused.threw ?? ''), true);

  // ── 2. A 200 WITH NOTHING USEFUL IN IT ────────────────────────────────────────────────
  // Not a shape cTrader is known to send — it is here because the destruction needed only ONE
  // thing: a response with no access_token reaching the write. Shape-independence is the point.
  reply(200, { some: 'unexpected shape' });
  const empty = await attempt(() => refreshAccessToken('whatever', 'legacy'));
  check('a 200 with no access_token is a FAILURE too', empty.threw !== null, true);
  check('...and says so plainly', /no access_token/.test(empty.threw ?? ''), true);

  // ── 3. THE HAPPY PATH STILL WORKS ─────────────────────────────────────────────────────
  // cTrader access tokens really do last ~30 days (2,628,000s) — docs/ctrader-open-api-apps.md:87.
  reply(200, { access_token: 'new-access', refresh_token: 'new-ticket', expires_in: 2628000 });
  const good = await attempt(() => refreshAccessToken('old-ticket', 'legacy'));
  check('a real renewal is unaffected', good.got, { accessToken: 'new-access', refreshToken: 'new-ticket', expiresIn: 2628000 });

  // THE ROTATION IS THE WHOLE REASON ONE ACCOUNT CAN KILL ANOTHER: the ticket we get back is a
  // DIFFERENT one, and cTrader invalidates the old pair the moment it issues this. Every sibling
  // account still holding "old-ticket" is now refused — which is case 1 above.
  check('...and the ticket it returns is a NEW one (single-use: the old pair is now dead)',
        good.got?.refreshToken !== 'old-ticket', true);

  // ── 4. A 200 WITH NO refresh_token KEEPS THE ONE WE HAVE ──────────────────────────────
  reply(200, { access_token: 'new-access', expires_in: 2628000 });
  const keep = await attempt(() => refreshAccessToken('still-valid-ticket', 'legacy'));
  check('a response with no new ticket keeps the current one', keep.got?.refreshToken, 'still-valid-ticket');

  // ── 5. THE SIGN-IN CALL HAS THE SAME GUARD ────────────────────────────────────────────
  // It shared the identical flaw at ctrader.ts:189, and a bad sign-in writes credentials too.
  reply(200, { errorCode: 'INVALID_REQUEST', description: 'Code already used.' });
  const signin = await attempt(() => exchangeCodeForTokens('a-used-code', 'legacy'));
  check('a refused SIGN-IN is a failure as well', signin.threw !== null, true);
  check('...naming its own code', /INVALID_REQUEST/.test(signin.threw ?? ''), true);

  // ── 6. A GENUINE ERROR STATUS STILL BEHAVES ───────────────────────────────────────────
  reply(400, { error_description: 'invalid_grant' });
  const four = await attempt(() => refreshAccessToken('x', 'legacy'));
  check('a 4xx is still a failure', four.threw, 'invalid_grant');

  globalThis.fetch = realFetch;
  console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass + fail} checks)`);
  process.exit(fail === 0 ? 0 : 1);
})();
