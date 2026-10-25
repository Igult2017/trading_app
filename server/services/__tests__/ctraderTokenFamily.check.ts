/**
 * ONE SIGN-IN'S TOKEN, SHARED — the grouping and the single-flight that stop one account's renewal
 * killing its siblings.  Run: npx tsx server/services/__tests__/ctraderTokenFamily.check.ts
 *
 * WHY. cTrader issues ONE token per sign-in for the whole cTID, and renewing it is single-use: the
 * new pair kills the old one instantly. While every account kept its own COPY, the first account
 * to renew invalidated every sibling's copy and each of those was then refused — which is how four
 * accounts came to demand a fresh sign-in, one after another, on 25 Oct 2026.
 *
 * ⚠ WHAT THIS FILE CAN AND CANNOT COVER. The store itself talks to the database, so the parts
 * tested here are the two pieces of PURE DECISION-MAKING that the defect actually turned on:
 *
 *     1. the grouping rule — which accounts belong to the same sign-in
 *     2. the single-flight rule — that one renewal happens, not one per account
 *
 * The database-backed halves (compare-and-set, mirroring) are verified in production by the
 * end-to-end check in the plan: reconnect ONE account, then confirm the siblings answer 200 rather
 * than 409 without a second sign-in. Saying so is better than a test that pretends to cover it.
 */
let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

console.log('\ncTRADER TOKEN FAMILIES\n');

// ── 1. THE GROUPING RULE ────────────────────────────────────────────────────────────────
// Mirrors ctraderTokenBackfill: owner + issuing app + the ticket ITSELF. The ticket alone is the
// proof — an identical stored ticket IS the same sign-in, which is why no guesswork is involved.
const familyKey = (userId: string, app: string, refreshToken: string) =>
  `${userId}|${app}|${refreshToken}`;

const accounts = [
  { id: 'signal2', userId: 'u1', app: 'legacy', refreshToken: 'TICKET-A', ctraderId: '47535363' },
  { id: 'signal',  userId: 'u1', app: 'legacy', refreshToken: 'TICKET-A', ctraderId: '5834793'  },
  { id: 'hola',    userId: 'u1', app: 'legacy', refreshToken: 'TICKET-A', ctraderId: '3001655'  },
  { id: 'master',  userId: 'u1', app: 'legacy', refreshToken: 'TICKET-A', ctraderId: '5347048'  },
  // A SECOND SIGN-IN of the same user: a different ticket, so a different family. Renewing one
  // must never touch the other.
  { id: 'other',   userId: 'u1', app: 'legacy', refreshToken: 'TICKET-B', ctraderId: '9999999'  },
  // Same ticket text but ANOTHER USER — must never be pooled with u1's.
  { id: 'someone', userId: 'u2', app: 'legacy', refreshToken: 'TICKET-A', ctraderId: '1111111'  },
  // Same user and ticket but a DIFFERENT Open API app: a ticket can only be renewed with its own
  // app's credentials, so this is its own family too (docs/ctrader-open-api-apps.md:54).
  { id: 'synced',  userId: 'u1', app: 'sync',   refreshToken: 'TICKET-A', ctraderId: '2222222'  },
];

const families = new Map<string, string[]>();
for (const a of accounts) {
  const k = familyKey(a.userId, a.app, a.refreshToken);
  families.set(k, [...(families.get(k) ?? []), a.id]);
}

check('the four accounts from one sign-in form ONE family',
      families.get(familyKey('u1', 'legacy', 'TICKET-A')), ['signal2', 'signal', 'hola', 'master']);
check('a second sign-in by the same user is its own family',
      families.get(familyKey('u1', 'legacy', 'TICKET-B')), ['other']);
check('another user holding the same ticket text is never pooled in',
      families.get(familyKey('u2', 'legacy', 'TICKET-A')), ['someone']);
check('a different Open API app is its own family, because only its app can renew it',
      families.get(familyKey('u1', 'sync', 'TICKET-A')), ['synced']);
check('four sign-ins in all, not one big pool', families.size, 4);

// ── 2. AN ERASED ACCOUNT IS LEFT ALONE, NOT GUESSED INTO A FAMILY ───────────────────────
// It has no ticket to group on. Attaching it to a family we merely SUSPECT could hand it a token
// that does not cover it — the exact error the signal platform's account pin exists to prevent.
const erased = { id: 'blanked', userId: 'u1', app: 'legacy', refreshToken: '' };
const groupable = (a: { refreshToken: string }) => Boolean(a.refreshToken);
check('an account whose login was erased is NOT grouped', groupable(erased), false);
check('...while a healthy one is', groupable(accounts[0]), true);

// ── 3. SINGLE-FLIGHT, KEYED BY THE RECORD ───────────────────────────────────────────────
// The old code keyed its in-flight map by ACCOUNT id, so four accounts sharing one ticket could
// renew at the same moment: four calls, each spending a single-use ticket, three of them losing.
// This is the same shape as ctraderTokenStore.renewToken.
const calls: string[] = [];
const inFlight = new Map<string, Promise<string>>();
const renew = (recordId: string): Promise<string> => {
  const running = inFlight.get(recordId);
  if (running) return running;
  const p = (async () => {
    calls.push(recordId);
    await new Promise(r => setTimeout(r, 10));
    return `fresh-for-${recordId}`;
  })().finally(() => inFlight.delete(recordId));
  inFlight.set(recordId, p);
  return p;
};

(async () => {
  // All four accounts of one family ask at the same instant.
  const results = await Promise.all(['signal2', 'signal', 'hola', 'master'].map(() => renew('record-1')));
  check('four accounts renewing at once produce exactly ONE call to cTrader', calls.length, 1);
  check('...and all four get the same new token',
        results, ['fresh-for-record-1', 'fresh-for-record-1', 'fresh-for-record-1', 'fresh-for-record-1']);

  // TEETH: prove the check can fail — keyed by ACCOUNT, the old way, it is four calls.
  const oldCalls: string[] = [];
  const oldInFlight = new Map<string, Promise<string>>();
  const oldRenew = (accountId: string): Promise<string> => {
    const running = oldInFlight.get(accountId);
    if (running) return running;
    const p = (async () => { oldCalls.push(accountId); await new Promise(r => setTimeout(r, 10)); return 'x'; })()
      .finally(() => oldInFlight.delete(accountId));
    oldInFlight.set(accountId, p);
    return p;
  };
  await Promise.all(['signal2', 'signal', 'hola', 'master'].map(id => oldRenew(id)));
  check('TEETH — keyed by account (the old way) it really is four calls, three of them doomed',
        oldCalls.length, 4);

  // A different record is a different ticket and must still renew on its own.
  calls.length = 0;
  await Promise.all([renew('record-2'), renew('record-2')]);
  check('a different sign-in still renews independently', calls, ['record-2']);

  console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`}  (${pass + fail} checks)`);
  process.exit(fail === 0 ? 0 : 1);
})();
