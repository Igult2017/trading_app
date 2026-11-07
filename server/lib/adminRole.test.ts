/**
 * adminRole.test.ts — run with:
 *     npx tsx server/lib/adminRole.test.ts
 *
 * WHAT IT GUARDS. He reported, 2026-11-08: *"That admin email is not loging me in to admin. I think
 * something is broken."* He was signed in the whole time — the live log shows it:
 *
 *     [Auth/setup] start { id: '0a96e6d3-…', email: 'henryantipas@gmail.com' }
 *     [Auth/setup] existing profile found { id: '0a96e6d3-…', role: 'user' }
 *     GET /api/admin/users 403 :: {"error":"Forbidden — admins only"}
 *
 * His profile said `user`, and NOTHING in production could change that. Only one rule ran for an
 * account that already had a profile — "promote if the email matches ADMIN_EMAIL" — and ADMIN_EMAIL
 * was not set. The app's OTHER rule, *if nobody is admin, let someone become admin*, ran for
 * brand-NEW profiles only. The 02 Nov migration emptied the database: profiles came back, the admin
 * row did not, and the rule written for exactly that situation could not reach it.
 *
 * ⚠ THE CHECKS THAT MATTER MOST ARE THE ONES THAT REFUSE. This is the file that decides who
 * administers the platform. A bug that locks the owner out costs an afternoon; a bug that hands
 * admin to an ordinary user costs the platform. So "nobody is promoted while an admin exists" is
 * tested harder than the recovery it enables.
 */
import { decideRole, describeDecision, type Role } from './adminRole';

let pass = 0;
const failures: string[] = [];

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}`
            + (ok ? '' : `, want ${JSON.stringify(want)}`));
  ok ? pass++ : failures.push(name);
}

function teeth(name: string, heldUp: boolean) {
  console.log(`   ${heldUp ? 'PASS' : 'FAIL'}  TEETH — ${name}: ${heldUp}`);
  heldUp ? pass++ : failures.push(`TEETH:${name}`);
}

const HIS = 'henryantipas@gmail.com';
/** The decision, shortened to what matters: the role and whether it must be written. */
const role = (o: Partial<Parameters<typeof decideRole>[0]>): [Role, boolean] => {
  const d = decideRole({ email: HIS, adminEmail: HIS, existingRole: null, adminCount: 1, ...o });
  return [d.role, d.promoted];
};

console.log('\nWHO GETS TO BE ADMIN\n');

console.log('1. the configured ADMIN_EMAIL wins — the operator naming a person:');
// `promoted` is true here because a new profile has NO stored role yet, so the role still has to be
// written — as part of the insert rather than an update. (My first version of this check expected
// false, on the loose assumption that "promoted" meant "an existing row changed". It does not; the
// flag means "the caller must write this". The doc comment on it now says so explicitly.)
check('a brand-new profile with that email is admin',
      role({ existingRole: null, adminCount: 1 }), ['admin', true]);
check("HIS ACTUAL CASE — an existing 'user' with that email is PROMOTED",
      role({ existingRole: 'user', adminCount: 1 }), ['admin', true]);
check('...and an existing admin is left alone, nothing to write',
      role({ existingRole: 'admin', adminCount: 1 }), ['admin', false]);

console.log('\n2. the recovery: when NOBODY is admin, someone has to be able to get in:');
check("an existing 'user' is promoted when the admin count is zero",
      role({ email: 'someone@else.com', adminEmail: '', existingRole: 'user', adminCount: 0 }),
      ['admin', true]);
check('...and so is a brand-new account, as before',
      role({ email: 'someone@else.com', adminEmail: '', existingRole: null, adminCount: 0 }),
      ['admin', true]);
check('...it works with ADMIN_EMAIL unset, which is the whole point',
      role({ email: 'someone@else.com', adminEmail: undefined, existingRole: 'user', adminCount: 0 }),
      ['admin', true]);

console.log('\n3. ⚠ THE REFUSALS — nobody is promoted while an administrator exists:');
for (const existingRole of [null, 'user'] as const) {
  for (const adminCount of [1, 2, 57]) {
    const [r, promoted] = role({ email: 'stranger@example.com', adminEmail: '', existingRole, adminCount });
    teeth(`${existingRole ?? 'new'} account, ${adminCount} admin(s) present → stays user`,
          r === 'user' && promoted === false);
  }
}
teeth('a near-miss email is NOT the configured admin',
      role({ email: 'henryantipas@gmail.co', adminEmail: HIS, existingRole: 'user', adminCount: 1 })[0] === 'user');
teeth('an empty ADMIN_EMAIL never matches an empty account email',
      role({ email: '', adminEmail: '', existingRole: 'user', adminCount: 1 })[0] === 'user');
teeth('...nor does a whitespace-only ADMIN_EMAIL',
      role({ email: '   ', adminEmail: '   ', existingRole: 'user', adminCount: 1 })[0] === 'user');
teeth('an existing admin is NEVER demoted by logging in again',
      role({ email: 'stranger@example.com', adminEmail: '', existingRole: 'admin', adminCount: 9 })[0] === 'admin');

console.log('\n4. the email comparison is forgiving about shape, strict about identity:');
check('capitals and padding do not matter',
      role({ email: '  HenryAntipas@Gmail.COM  ', adminEmail: HIS, existingRole: 'user', adminCount: 1 }),
      ['admin', true]);
check('...in the configured value too',
      role({ email: HIS, adminEmail: '  HENRYANTIPAS@GMAIL.COM ', existingRole: 'user', adminCount: 1 }),
      ['admin', true]);

console.log('\n5. every promotion can explain itself in the log:');
check('the named-admin reason',
      describeDecision(decideRole({ email: HIS, adminEmail: HIS, existingRole: 'user', adminCount: 1 })),
      'role=admin (email matches ADMIN_EMAIL) — PROMOTED');
check('the recovery reason names what happened',
      describeDecision(decideRole({ email: 'a@b.c', adminEmail: '', existingRole: 'user', adminCount: 0 })),
      'role=admin (no administrator existed — this account became the first) — PROMOTED');
check('an ordinary account says so without claiming a promotion',
      describeDecision(decideRole({ email: 'a@b.c', adminEmail: '', existingRole: null, adminCount: 3 })),
      'role=user (ordinary account)');

console.log();
if (failures.length) {
  console.log(`${failures.length} of ${pass + failures.length} FAILED: ${JSON.stringify(failures)}`);
  process.exit(1);
}
console.log(`ALL PASS (${pass} checks)`);
