/**
 * ResetPasswordPage.test.ts — run with:
 *     npx tsx client/src/pages/ResetPasswordPage.test.ts
 *
 * WHAT THIS PROTECTS. On 2026-11-08 password reset could not be completed at all, and the four
 * faults behind it were each invisible at build time — every one of them type-checked, built and
 * deployed clean. The evidence is in docs/MAP.md (2026-11-08) and docs/OPEN.md C17.
 *
 *  1. A reset link does not land on the reset page. Supabase drops a `redirect_to` that is not on
 *     its allow-list, so the link arrives at the HOMEPAGE carrying `#…&type=recovery`.
 *  2. The reset page waited for a ONE-SHOT announcement it is often not subscribed in time to hear
 *     — and which can never be made twice, because the library wipes the token out of the address.
 *  3. The submit button had `try/finally` with NO `catch`, so a THROWN failure changed nothing on
 *     screen. That was his actual report: he pressed it and nothing happened.
 *  4. The in-app change-password box had the same hole, and stuck on "Changing…".
 *
 * ⚠ IT READS THE FILES WITH `fs`, not imports — the same reason as ddStyles.test.ts: `@/` is a Vite
 * alias, so an importing test could not be run from the command line at all. It therefore asserts
 * on SOURCE, which means every check must match the CALL and not merely the definition
 * (feedback-assert-the-call-not-the-def: a check for `fn(` also matches `function fn(`, and that
 * has let a deleted call ship green TWICE).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let failed = 0;
let count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, held: boolean) {
  count++;
  console.log(`   ${held ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!held) failed++;
}

const here = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');
const page = here('ResetPasswordPage.tsx');
const client = here('../lib/supabase.ts');
const profile = here('../components/profile/ProfileSettings.tsx');

console.log('\nPASSWORD RESET — the link arrives, the form appears, and nothing fails silently');

// ── 1. THE LINK IS HONOURED WHEREVER IT LANDS ────────────────────────────────
// Measured on production: Supabase answered `redirect_to=https://app.dorixe.com`, dropping the
// path, so the link hits the homepage. The app has to recognise it there.
console.log('\n1. a recovery link is routed to the reset page from anywhere:');
check('the router reads the type out of the address',
      /getParams?\(|new URLSearchParams/.test(client) && client.includes("=== 'recovery'"), true);
teeth('it is CALLED, not merely defined — the call sits on its own line, outside the function',
      /\n\s*routeRecoveryLink\(\);/.test(client));

// ⚠ THE WHOLE FIX HANGS ON THIS ORDER. The login library wipes the token out of the address as soon
// as it starts reading it, so a check that runs after `createClient` finds nothing left.
const callAt = client.search(/\n\s*routeRecoveryLink\(\);/);
const createAt = client.indexOf('createClient(supabaseUrl');
teeth('…and it runs BEFORE createClient, or the token is already gone',
      callAt > 0 && createAt > 0 && callAt < createAt);
check('it does not bounce a page that is already the reset page',
      client.includes('if (pathname === RESET_PATH) return;'), true);
check('the token is carried over, not dropped on the way',
      /RESET_PATH\}\$\{search\}\$\{hash\}/.test(client), true);

// ── 2. THE FORM APPEARS BECAUSE A SESSION EXISTS ─────────────────────────────
// Not because one particular announcement was overheard. Measured before the fix: a valid session
// in storage and still no password box on screen.
console.log('\n2. the form is gated on the session, not on one announcement:');
teeth('the page ASKS for the session (a call, not an import)',
      /supabase\.auth\.getSession\(\)\.then\(/.test(page));
teeth('the old single-event gate is gone',
      !page.includes("event === 'PASSWORD_RECOVERY'"));
check('the listener now accepts the session from ANY event',
      /onAuthStateChange\(\(_event, s\) => \{/.test(page), true);
check('a spent link is NAMED instead of spinning for ever',
      page.includes('invalid or has already been used'), true);
teeth('the listener is unsubscribed on leaving — it never was',
      page.includes('subscription.unsubscribe()'));

// ── 3. NO OUTCOME OF THE BUTTON LEAVES THE SCREEN UNCHANGED ──────────────────
// His report, 2026-11-08: "it dint take effect like saying 'it was successful'".
console.log('\n3. the submit button can always say what happened:');
const submit = page.slice(page.indexOf('async function handleSubmit'),
                          page.indexOf('const S: Record<string'));
teeth('the submit has a catch, not just a finally', /\}\s*catch\s*\(/.test(submit));
teeth('…and the catch actually puts something on screen',
      /catch[\s\S]{0,900}setError\(/.test(submit));
check('the success path still reports success', submit.includes('setDone(true)'), true);
// His choice B1, 2026-11-08.
teeth('it signs out BEFORE sending you to the sign-in screen',
      submit.indexOf('signOut()') > 0 && submit.indexOf('signOut()') < submit.indexOf("navigate('/auth')"));

// ── 4. THE SAME HOLE IN THE IN-APP BOX ───────────────────────────────────────
console.log('\n4. the in-app change-password box has the same guard:');
const savePw = profile.slice(profile.indexOf('async function savePw'),
                             profile.indexOf('const Section ='));
teeth('savePw has a catch', /\}\s*catch\s*\(/.test(savePw));
teeth('…and the spinner is cleared in a finally, so it cannot stick on "Changing…"',
      /finally\s*\{\s*\n?\s*setSavingPw\(false\);/.test(savePw));
check('it still reports a handed-back failure too', savePw.includes("s: 'err', m: error.message"), true);

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${count} checks\n`);
process.exit(failed === 0 ? 0 : 1);
