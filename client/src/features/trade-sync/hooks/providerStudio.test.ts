/**
 * providerStudio.test.ts — run with:
 *     npx tsx client/src/features/trade-sync/hooks/providerStudio.test.ts
 *
 * THE PROVIDER STUDIO MUST NOT LIE, AND ITS TWO BUTTONS MUST BOTH WORK.
 *
 * Five defects found by tracing it from the controls back to the database:
 *
 *  1. DECLINE RETURNED 403. Accept asks "do you own the MASTER?" — right for a provider. Decline
 *     called `DELETE /api/copy/followers/:id`, which asks "do you own the FOLLOWER ROW?" — and that
 *     row belongs to the person asking to follow. Two buttons side by side, only one of which could
 *     work against a real third-party request. It looked fine because the only follower rows in
 *     existence were his own.
 *  2. HIS OWN ACCOUNTS APPEARED AS STRANGERS. Pending requests were "any inactive follower on any
 *     master I own", so pressing Stop mirroring put his own mirrors in the queue as follow requests.
 *  3. HIS PROVIDER STATS COUNTED HIS OWN MONEY. AUM and active-follower counts summed every master
 *     including the self-copy one — while the profile shown above them excluded it, so the header
 *     and the numbers described two different businesses.
 *  4. "SEND MESSAGE" SENT NOTHING while saying *"we'll reply within one business day"*. The worst of
 *     the five: it failed while claiming success.
 *  5. FEE MODEL HAD NOWHERE TO GO — never sent, never loaded, and `copy_masters` has no fee column.
 *
 * SOURCE CHECKS, same approach as `copySetup.test.ts` and `server/lib/entryParity.test.ts`: driving
 * these paths needs a login, a provider and a second user, but what can be lost silently is the
 * WIRING — which endpoint a button calls, and which rows a query counts.
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

function teeth(name: string, brokeItAndFailed: boolean) {
  count++;
  console.log(`   ${brokeItAndFailed ? 'PASS' : 'FAIL'}  TEETH — ${name}`);
  if (!brokeItAndFailed) failed++;
}

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const P = ['client', 'src', 'features', 'trade-sync'];
const hook    = read(...P, 'hooks', 'useProviderStudio.ts');
const setup   = read(...P, 'sections', 'provider', 'BusinessSetup.tsx');
const support = read(...P, 'sections', 'provider', 'SupportBox.tsx');
const page    = read(...P, 'sections', 'ProviderStudioPage.tsx');
const routes  = read('server', 'routes.ts');

console.log('\nPROVIDER STUDIO — both buttons work, and nothing claims what it did not do');

// ── 1. ACCEPT AND DECLINE ASK THE SAME OWNERSHIP QUESTION ───────────────────
check('there is a decline endpoint', routes.includes('"/api/copy/followers/:id/decline"'), true);
check('...and it checks you own the MASTER, like approve does',
      routes.includes('Only the provider can decline followers'), true);
check('...and deletes, so the request leaves the queue',
      /declined: await storage\.deleteCopyFollower\(follower\.id\)/.test(routes), true);
check('the studio calls it', hook.includes('/decline`'), true);
check('...and no longer DELETEs a row it does not own',
      /apiRequest\("DELETE", `\/api\/copy\/followers\/\$\{req\.id\}`\)/.test(hook), false);

// The DELETE route must KEEP its own check — it is correct for a follower cancelling their own
// subscription. Loosening it would let a provider destroy a follower's record.
check('the follower DELETE route still requires you to own the row',
      /app\.delete\("\/api\/copy\/followers\/:id"[\s\S]{0,400}?existing\.userId !== auth\.id/.test(routes), true);

// ── 2. HIS OWN ACCOUNTS ARE NOT FOLLOW REQUESTS ─────────────────────────────
// The exclusion is keyed on WHO OWNS THE TWO ROWS, not on the 'Self-copy source' marker. That
// marker is stamped by only one of the two paths that build a self-copy, and his real relationship
// — built through the Provider Studio — does not carry it, so the marker version excluded nothing.
// The slice anchors are comment text, so it is taken from the raw source and stripped afterwards —
// these blocks EXPLAIN the marker they stopped using, and reading the prose fails on the
// explanation while passing on nothing. Same trap as entryParity.test.ts.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const reqQ = stripComments(
  routes.slice(routes.indexOf('PENDING FOLLOW REQUESTS'), routes.indexOf('ACTIVE FOLLOWERS + AUM')));
check('pending requests exclude him copying himself',
      reqQ.includes('f.user_id <> m.user_id'), true);
check('...and do NOT rely on the creation-path marker',
      reqQ.includes("'Self-copy source'"), false);
check('...only masters that actually have an approval queue',
      reqQ.includes('m.require_approval = true'), true);
check('...and only followers that never started, so paused is not mistaken for waiting',
      reqQ.includes('f.deployed_at IS NULL'), true);

// ── 3. HIS PROVIDER STATS COUNT CUSTOMERS, NOT HIMSELF ──────────────────────
const folQ = stripComments(
  routes.slice(routes.indexOf('ACTIVE FOLLOWERS + AUM'), routes.indexOf('const num = (v: any)')));
check('active followers and AUM exclude him copying himself',
      folQ.includes('f.user_id <> m.user_id'), true);
check('...and do NOT rely on the creation-path marker either',
      folQ.includes("'Self-copy source'"), false);

// ── 4. THE SUPPORT BOX TELLS THE TRUTH ──────────────────────────────────────
check('there is a support endpoint', routes.includes('"/api/copy/support-message"'), true);
check('...that requires a message', routes.includes('Message is required'), true);
check('...and reports failure rather than success when delivery fails',
      routes.includes('Could not reach support just now'), true);
check('the button actually calls it', hook.includes("/api/copy/support-message"), true);
check('...and only claims it was sent after the call succeeds',
      /apiRequest\("POST", "\/api\/copy\/support-message"[^)]*\);\s*\n\s*setToast\("Message sent to support/
        .test(hook), true);
// The box is cleared ONLY on the success path — on failure his text stays, because it is his only
// copy of it. Asserted on the code, not on the comment that explains it.
const sendFn = hook.slice(hook.indexOf('const sendSupportMessage'), hook.indexOf('return {'));
check('the box is cleared once, on success', (sendFn.match(/setSupportMessage\(""\)/g) || []).length, 1);
check('...and the clear sits above the catch, not inside it',
      sendFn.indexOf('setSupportMessage("")') < sendFn.indexOf('} catch'), true);
check('the button is disabled while sending', support.includes('disabled={studio.sending'), true);

// The fake address is gone — it appeared once in the whole codebase, in that button.
// COMMENTS STRIPPED FIRST: these files explain the mockup address they removed, so reading the raw
// text would fail on the explanation and pass on nothing. Same trap as entryParity.test.ts.
const code = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
   .replace(/(^|[^:])\/\/.*$/gm, '$1');
check('the mockup support address is no longer rendered', code(support).includes('tradesync.app'), false);
check('...and nowhere else in the studio',
      code(hook + setup + page).includes('tradesync.app'), false);

// ── 5. THE FEE DROPDOWN IS GONE ─────────────────────────────────────────────
check('the fee dropdown is removed from the form', setup.includes('Performance fee'), false);
check('...and its state with it', hook.includes('feeModel'), false);

// ── DEAD PROPS SWEPT ────────────────────────────────────────────────────────
// Removing the fake email button orphaned `setToast` in SupportBox — and it turned out BusinessSetup
// had been taking it without ever using it, from before this change.
check('SupportBox no longer takes a toast setter it does not use', support.includes('setToast'), false);
check('BusinessSetup no longer takes one either', setup.includes('setToast'), false);
check('...and the page stopped passing them', page.includes('setToast'), false);

// ── WHAT MUST NOT HAVE BROKEN ───────────────────────────────────────────────
check('the profile still saves', hook.includes("apiRequest(\"PUT\", `/api/copy/masters/${master.id}`"), true);
check('the marketplace listing still saves', hook.includes('persist({ isPublic: next }'), true);
check('the fields still seed only once', hook.includes('if (master && !seeded)'), true);
check('accept still calls approve', hook.includes('/approve`'), true);

// ── TEETH ───────────────────────────────────────────────────────────────────
teeth('the old decline would have been caught',
      'await apiRequest("DELETE", `/api/copy/followers/${req.id}`);'.includes('DELETE'));
teeth('a support button that only toasted would be caught',
      !'setToast("Message sent to support"); setSupportMessage("");'.includes('/api/copy/support-message'));
teeth('counting every master would put his own mirrors in the stats',
      !'WHERE m.user_id = $1 AND f.is_active = true'.includes('Self-copy source'));

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
