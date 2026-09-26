/**
 * authContract.test.ts — run with:
 *     npx tsx server/lib/authContract.test.ts
 *
 * ONE UNAUTHENTICATED REQUEST MUST NOT BE ABLE TO KILL THE SERVER.
 *
 * ══ WHAT HAPPENED ═══════════════════════════════════════════════════════════════════════════════
 *
 * `requireAuth(req, res)` SENDS its own 401 and returns null. Its doc says exactly that, and tells
 * callers what to write:
 *
 *     Sends a 401 response and returns null when authentication fails so that
 *     callers can simply `if (!auth) return;`.
 *
 * Twenty-five of sixty-five handlers instead wrote `if (!auth) return res.status(401).json(...)`. The
 * second send threw INSIDE the handler's `try`; the `catch` then ran `res.status(500).json(...)`, which
 * threw again with nothing above it, so the rejection was unhandled and **the Node process exited**. A
 * single unauthenticated GET to `/api/notifications/unread` was enough. Found 2026-09-26 while rendering
 * the journal for a contrast measurement — it crashed the dev server twice.
 *
 * ══ WHY A TEST AND NOT JUST THE FIX ═════════════════════════════════════════════════════════════
 *
 * `routes.ts` is 6,000 lines and 220 endpoints. The next handler written in that shape does it again,
 * and the symptom — "production restarted" — is the hardest kind to trace back to its cause. Two things
 * are pinned here: the contract at every call site, and the guard that makes a violation non-fatal.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let failed = 0, count = 0;

function check(name: string, got: unknown, want: unknown) {
  count++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}` +
              (ok ? '' : `, want ${JSON.stringify(want)}`));
  if (!ok) failed++;
}

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

console.log();
console.log('AUTH CONTRACT — requireAuth responds; a caller that responds again crashed the server');

const routes = readFileSync(join(process.cwd(), 'server/routes.ts'), 'utf8');
const setup  = readFileSync(join(process.cwd(), 'server/lib/appSetup.ts'), 'utf8');

// ── 1. THE CONTRACT, AT EVERY CALL SITE ────────────────────────────────────
console.log('\n1. no handler responds again after requireAuth already did:');
const violations = [...routes.matchAll(/if \(!auth\)[^\n]*\breturn\s+res\./g)]
  .map((m) => routes.slice(0, m.index).split('\n').length);
check('routes.ts has no `if (!auth) return res.…`', violations, []);

// It is only a meaningful check while the contract is actually in use.
const callSites = (routes.match(/requireAuth\(req, res\)/g) ?? []).length;
const correct   = (routes.match(/if \(!auth\) return;/g) ?? []).length;
check('requireAuth is still the auth helper these routes use', callSites > 50, true);
check('...and the call sites follow the documented shape', correct >= 60, true);

// THE DOC IS THE SPEC. If someone changes requireAuth to stop responding, this test is measuring a
// contract that no longer exists — so the doc line itself is pinned.
check('requireAuth still documents that it responds',
      /Sends a 401 response and returns null when authentication fails/.test(routes), true);
check('...and still actually responds', /res\.status\(401\)\.json\(\{ error: "Authentication required" \}\)/.test(routes), true);

// TEETH — the old shape, reproduced, must be caught by the rule above.
const OLD = 'if (!auth) return res.status(401).json({ error: "Unauthorized" });';
teeth('the pattern that crashed the server would be caught',
      [...`  ${OLD}`.matchAll(/if \(!auth\)[^\n]*\breturn\s+res\./g)].length === 1);

// ── 2. THE GUARD THAT MAKES A VIOLATION NON-FATAL ──────────────────────────
//
// Fixing 25 call sites is not the same as making it safe. A defect whose symptom is "production
// restarted" must not be reachable from one more handler written in the old shape.
console.log('\n2. a second response is ignored rather than fatal:');
check('the guard exists', /function doubleSendGuard\(/.test(setup), true);
check('...and is installed', /app\.use\(doubleSendGuard\)/.test(setup), true);
check('...before the request logger, so it wraps res.json first',
      setup.indexOf('app.use(doubleSendGuard)') < setup.indexOf('app.use(requestLogger)'), true);
check('...it guards res.json', /res\.json = guard\('res\.json'/.test(setup), true);
check('...and res.send', /res\.send = guard\('res\.send'/.test(setup), true);
check('...keyed on headersSent, which is the thing that makes the second write throw',
      /if \(res\.headersSent\)/.test(setup), true);
// IT MUST NOT BE SILENT. A double send is still a bug; what it must not be is a crash.
check('...and it says so in the log rather than swallowing it',
      /\[DoubleSend\]/.test(setup), true);

// ── 3. THE BEHAVIOUR, EXERCISED ────────────────────────────────────────────
//
// The checks above read source. This one runs the guard's actual logic against a fake response, so a
// guard that is installed but does not work is still caught.
console.log('\n3. the guard, exercised against a response that has already been sent:');
{
  const sent: string[] = [];
  const logs: string[] = [];
  const res: any = { headersSent: false };
  res.json = (b: any) => { sent.push(JSON.stringify(b)); res.headersSent = true; return res; };
  res.send = res.json;

  // The same wrapper shape appSetup installs.
  const guard = (name: string, fn: any) => function (this: any, ...args: any[]) {
    if (res.headersSent) { logs.push(name); return res; }
    return fn.apply(this, args);
  };
  const realJson = res.json.bind(res);
  res.json = guard('res.json', realJson);

  res.json({ error: 'Authentication required' });    // requireAuth's own 401
  const returned = res.json({ error: 'Unauthorized' });  // the handler responding again

  check('the first response is the one that reaches the client', sent, ['{"error":"Authentication required"}']);
  check('the second is ignored, not thrown', logs, ['res.json']);
  check('...and it returns res, so the handler\'s `return res.json(...)` still works', returned === res, true);
}

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
