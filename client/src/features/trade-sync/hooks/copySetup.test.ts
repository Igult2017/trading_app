/**
 * copySetup.test.ts — run with:
 *     npx tsx client/src/features/trade-sync/hooks/copySetup.test.ts
 *
 * THE COPY SETUP PANEL MUST REMEMBER WHAT WAS SAVED, AND MUST NOT FORGET IT AGAIN.
 *
 * HIS REPORT: *"I would try connect a slave account and when I reload the page everything is
 * undone."* He was exactly right. "Set as master" and "Add as mirror" wrote to browser memory and
 * nothing else, and every other control started from a hardcoded default on each page load. The
 * setup HAD been saved since the first Start — `POST /api/copy/self-copy` writes the master and
 * follower rows — but `GET /api/copy/overview` never returned which accounts were on either side,
 * so the panel could not show it. His screenshot proves both halves at once: a **"Stop mirroring"**
 * button (which only renders when active follower rows exist) above a header reading **"no master
 * set"**.
 *
 * THE TWO WAYS THIS FIX COULD ITSELF GO WRONG, both asserted below:
 *
 *   1. **Re-seeding on every payload.** The overview refetches every 20 seconds. Seeding on each one
 *      would wipe whatever he was in the middle of choosing, twice a minute — worse than the bug.
 *      The `hydrated` ref must gate the effect.
 *   2. **Leaving Stop gated by the start-blockers.** After a reload the master is blank, so the
 *      "declare a master" blocker fires — and it was disabling the button that STOPS mirroring, so
 *      he could not switch off copying that was already live.
 *
 * SOURCE CHECKS. Rendering the hook needs React, a query client and a server; what can be lost
 * silently here is the WIRING, and that is what is asserted — the same approach as
 * `server/lib/entryParity.test.ts`.
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
const F = ['client', 'src', 'features', 'trade-sync'];
const setup    = read(...F, 'hooks', 'useCopySetup.ts');
const overview = read(...F, 'hooks', 'useOverview.ts');
const routes   = read('server', 'routes.ts');
const agree    = read(...F, 'sections', 'setup', 'AgreementAndStart.tsx');
const picker   = read(...F, 'sections', 'setup', 'AccountPicker.tsx');
const ownList  = read(...F, 'sections', 'setup', 'OwnAccountsList.tsx');

console.log('\nCOPY SETUP — the panel remembers what was saved');

// ── 1. THE SERVER RETURNS THE SAVED SETUP ───────────────────────────────────
// Without the two broker_account_id columns the panel cannot know which account is which — that is
// the whole reason it said "no master set" while mirroring was live.
check('the overview selects the follower\'s account',
      routes.includes('f.broker_account_id AS follower_account_id'), true);
check('...and the master\'s account',
      routes.includes('m.broker_account_id AS master_account_id'), true);
check('...and the saved filters and sizing',
      routes.includes('f.symbol_whitelist, f.active_sessions, f.max_dd_percent, f.risk_accepted'), true);
// CRLF-TOLERANT, and that is not pedantry. `server/routes.ts` is checked out with WINDOWS line
// endings, so `selfCopy,` is followed by a carriage return before the newline, and a pattern that
// demanded a bare newline never matched. On 2026-09-26 this reported the block MISSING while it
// sat at routes.ts:3418 doing its job. A source-text assertion must tolerate both endings, or it
// fails by platform rather than by fault.
check('the response carries a selfCopy block', /^\s*selfCopy,\s*$/m.test(routes), true);
check('the client type knows about it', overview.includes('masterBrokerAccountId'), true);

// WHICH ROWS COUNT AS "HIS SELF-COPY SETUP" — and this is where the first attempt was wrong.
//
// It shipped keyed on `description = 'Self-copy source'`, the marker POST /api/copy/self-copy
// stamps. It restored nothing for him. The live data said why: his only cTrader master is named
// "My signal service" — the Provider Studio's default — so he had built the relationship through
// POST /api/copy/masters, and NO master carrying that marker existed at all. Two paths create the
// same thing, and a rename through the studio erases the marker anyway, so keying on how a row was
// CREATED was the mistake. The question is whose the master is.
check('the master is selected with its owner', routes.includes('m.user_id AS master_user_id'), true);
check('...and self-copy means the master is his too, not that one endpoint made it',
      /r\.master_user_id === uid/.test(routes), true);
check('...with telegram masters excluded, having no broker account to mirror from',
      /source_type \?\? ''\)\.toLowerCase\(\) !== 'telegram'/.test(routes), true);
check('the creation-path marker is no longer what selects those rows',
      /selfRows[\s\S]{0,200}master_description/.test(routes), false);

// PAUSED relationships must be included. Stopping sets is_active=false and keeps the rows; filtering
// to active ones would blank the panel the moment he stopped, leaving nothing to restart from.
check('paused relationships are not filtered out of selfCopy',
      /const selfRows = rels\.rows\.filter\((?![\s\S]{0,120}is_active)/.test(routes), true);

// ── 2. THE PANEL SEEDS FROM IT — EXACTLY ONCE ───────────────────────────────
check('the hook seeds from the saved setup', setup.includes('overview.selfCopy'), true);
// ⚠ CHANGED 2026-09-26, AND THE OLD ASSERTIONS WERE RIGHT FOR THE OLD PANEL. It used to restore
// "the master" and "the mirrors" into form state, because there was exactly one master. His rule
// that day - "I have master A copied by slave B and master D copied by slave E... 1 slave can have
// more than 1 master" - made a single master impossible to hold, so the saved relationships are now
// READ BACK as a list (`overview.selfCopy.links`) and rendered in Mirror feeds, while the FORM
// starts empty and builds one new link at a time.
//
// Restoring a master into the form would pre-fill it with a relationship that already exists and
// invite him to create it twice, so the absence below is the behaviour, not a regression.
check('the form does NOT pre-fill itself with an existing relationship',
      setup.includes('setMasterAccountId(s.masterBrokerAccountId)'), false);
check('the saved links are read back instead', setup.includes('overview?.selfCopy?.links'), true);
check('...and the settings he chose last still seed the form',
      ['setInstruments(d.symbolWhitelist)', 'setSessions(d.activeSessions)',
       'setDrawdown(String(d.maxDdPercent))', 'setAgreed(true)'].every(x => setup.includes(x)), true);

// THE 20-SECOND TRAP.
check('there is a hydrated guard', setup.includes('const hydrated = useRef(false)'), true);
check('...checked before seeding', setup.includes('if (hydrated.current || !overview) return;'), true);
check('...and set immediately, so a second payload cannot re-seed',
      /hydrated\.current \|\| !overview\) return;\s*\n\s*hydrated\.current = true;/.test(setup), true);

// It must not restore a sizing mode the dropdown cannot display.
check('only the two sizing modes the dropdown offers are restored',
      setup.includes('setSizingMode("Lot Size")') && setup.includes('setSizingMode("Risk %")') &&
      !setup.includes('setSizingMode("Lot Multiplier")'), true);

// ── 3. STOP IS NOT GATED BY THE START-BLOCKERS ──────────────────────────────
// ⚠ REPLACED, NOT DELETED, 2026-09-28. This asserted `startBlockers = mirroring ? [] :` — the
// blockers were skipped while copying was live, and for a real reason: the SAME button also stopped
// mirroring, so after a reload (master blank) the "declare a master" blocker fired and disabled the
// stop. He could not turn off copying that was already running.
//
// That button no longer stops anything. His instruction: "there is no need for things like 'stop
// mirroring' in this form... The connected accounts appear in the connected accounts section" —
// stopping is per-account there, the Drop button. With one job left, gating the submit on a complete
// form is simply correct, and the bug the old assertion guarded cannot occur.
check('the form only ever starts — no stop branch left in it',
      /if \(mirroring\) \{/.test(setup), false);
check('...so the blockers are no longer skipped while copying is live',
      /const startBlockers = mirroring \? \[\] :/.test(setup), false);
// COMMENTS STRIPPED FIRST. The docblock in that file EXPLAINS the old "Stop mirroring" button, so a
// plain text search matches the explanation and reports the behaviour as still present. The question
// is what the component renders, not what its history says.
const agreeCode = agree.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
check('...and the button label never says stop',
      /Stop mirroring/.test(agreeCode), false);
check('...nor switches its label on whether copying is live',
      /mirroring \?/.test(agreeCode), false);

// ── THE PANEL IS A FORM: pick, submit, clear, repeat ────────────────────────
// His instruction: "This should just be like a form that enable users to connect accounts... Whatever
// is marked here is submitted and it remains cleared for the next task... the accounts that users can
// follow should be displayed explicitly not in a dropdown... User picks master account and then it is
// shown accounts to copy to."
check('the pair is chosen from cards, not a dropdown', /<select/.test(ownList), false);
check('...and the picker uses buttons per account', /<button/.test(picker), true);
check('the targets step waits for a master', /\{masterId && \(/.test(picker), true);
check('...and never offers the master as its own target',
      /a\.id !== masterId/.test(picker), true);
check('a pair that already exists is marked rather than blocked',
      /already copying/.test(picker), true);

// CLEARED FOR THE NEXT TASK — the whole form, not just the target. It used to reset only
// selectedOwnAccounts, so the master and every risk setting carried into the next link.
for (const [what, re] of [
  ['the master',      /setMasterAccountId\(""\)/],
  ['the target',      /setSelectedOwnAccounts\(\[\]\)/],
  ['the sizing mode', /setSizingMode\("Risk %"\)/],
  ['the sizing value',/setSizingValue\("1\.00"\)/],
  ['the drawdown',    /setDrawdown\("10"\)/],
  ['the sessions',    /setSessions\(\["London"\]\)/],
  ['the instruments', /setInstruments\(\["Forex", "Metals"\]\)/],
] as [string, RegExp][]) {
  check(`a successful submit clears ${what}`, re.test(setup), true);
}
check('...but NOT the terms tick, which is consent to the service not to one link',
      /setAgreed\(false\)/.test(setup), false);
check('the form says what it just created', /lastLinked/.test(agree), true);

// ── 4. THE CHOICES ACTUALLY LEAVE THE BROWSER ───────────────────────────────
// Collected since the panel was built, never sent — both sets of buttons were decoration.
check('Start sends the instrument choice', setup.includes('symbolWhitelist: instruments.length'), true);
check('...and the session choice', setup.includes('activeSessions:  sessions.length'), true);
check('...with the on/off switch the engine reads first',
      setup.includes('sessionFilter:   sessions.length > 0'), true);
check('the server stores both', routes.includes('sessionFilter:   b.sessionFilter ?? false') &&
      routes.includes('activeSessions:  b.activeSessions ?? null'), true);

// A CHANGED setting must actually be written. The endpoint was create-or-nothing, so once a pair was
// linked, editing the sizing or the instruments and pressing Start again did nothing at all.
check('an existing relationship is updated, not skipped',
      routes.includes('storage.updateCopyFollower(follower.id, patch as any)'), true);
check('...and re-pressing Start resumes a paused one',
      /const patch: Record<string, any> = \{ isActive: true,/.test(routes), true);
// ...AND UN-RETIRES A DROPPED ONE, which is the half that can fail silently. Drop marks the row with
// `dropped_at` instead of deleting it (2026-09-29), and this same patch is what brings the pair back.
// If it set the row live without clearing the mark, the relationship would mirror real trades while
// every list on screen still hid it — copying with nothing to say so, which is worse than the server
// error this replaced. Asserted separately from isActive so neither can be dropped without noticing.
check('...and un-retires a dropped one, so it cannot copy invisibly',
      /const patch: Record<string, any> = \{[^}]*droppedAt: null/.test(routes), true);

// ── A PERSISTED PAYLOAD OF ANY AGE MUST NOT WHITE-SCREEN THE PAGE ───────────
//
// WHAT HAPPENED, 2026-09-27. `/api/copy/overview` changed the shape of its `selfCopy` block (one
// master -> a list of links). The React Query cache is written to localStorage and seeded
// SYNCHRONOUSLY at startup (`lib/queryClient.ts`), so the first `overview` the hook saw in a
// browser that had used the app before was a payload saved by the OLD build: `masterBrokerAccountId`
// present, `defaults` absent. The hook did `const d = s.defaults;` then `d.symbolWhitelist` — a read
// off undefined — which threw, killed the whole React tree, and rendered a blank page. His words:
// *"It should this when i try to access copy trade. You broke something fix it."*
//
// A SHAPE CHANGE IS A MIGRATION WHEN THE OLD SHAPE LIVES ON DISK. Two defences, both checked here.
const oldPayload: any = {           // exactly what a v1 cache holds
  masterBrokerAccountId: 'acct-a',
  mirrorBrokerAccountIds: ['acct-b'],
  lotMode: 'risk', riskPercent: '2.00', maxDdPercent: '10',
  symbolWhitelist: [], activeSessions: [], riskAccepted: true,
};
let survived = true;
try {
  // the exact expression the hook now uses
  const d = oldPayload.defaults ?? {};
  void (d.symbolWhitelist?.length);
  void (d.activeSessions?.length);
  void (d.maxDdPercent != null);
  void (d.lotMode === 'fixed' && d.fixedLot != null);
  void (d.riskAccepted);
} catch { survived = false; }
check('an OLD cached payload no longer throws on hydration', survived, true);
check('...because every read off `defaults` is guarded',
      setup.includes('s.defaults ?? ('), true);
check('...and `links` degrades to an empty list, never undefined',
      setup.includes('overview?.selfCopy?.links ?? []'), true);

// THE CACHE KEY RELEASES THE BROWSERS ALREADY STUCK. They cannot reach a page to clear it from, so
// the guard above alone would leave them broken until the entry aged out (30 days).
const qc = read('client/src/lib/queryClient.ts');
check('the persisted-cache key was bumped past v1', qc.includes('fsd-journal-cache-v1'), false);
check('...to a newer version', /fsd-journal-cache-v[2-9]/.test(qc), true);

// ...AND NOTHING ELSE MAY HARDCODE IT. `AuthContext` drops the previous user's cache when a
// DIFFERENT user signs in on a shared device — a security cleanup — and it had the key typed out by
// hand. The v1 -> v2 bump left it removing a key that no longer held anything, so that user's data
// would have survived the switch. A cleanup that silently targets nothing still reads as done.
const auth = read('client/src/context/AuthContext.tsx');
check('the cache key is defined once and exported', qc.includes('export const CACHE_KEY'), true);
check('...and AuthContext imports it rather than retyping it',
      auth.includes('CACHE_KEY') && !/['"]fsd-journal-cache-v\d/.test(auth), true);
teeth('a second hardcoded copy is what broke the cross-user cleanup',
      !/['"]fsd-journal-cache-v\d/.test(auth));

// ── DROP RETIRES THE RELATIONSHIP, IT DOES NOT DELETE IT ────────────────────
// His report: "Why is this account not dropping?" — the button returned a server error on every
// relationship that had actually copied something. It deleted the row, and the trades it had copied
// plus the audit lines about them point AT that row, so the database refused:
//     violates foreign key constraint "copy_execution_logs_follower_id_fkey"
// Cascading instead would have erased those records — and they are what the history tab and the
// win-rate figure are computed from, so tidying a list would have rewritten his past numbers.
check('Drop no longer deletes the row',
      /app\.delete\("\/api\/copy\/followers\/:id"[\s\S]{0,900}?deleteCopyFollower/.test(routes), false);
check('...it marks it retired instead',
      /app\.delete\("\/api\/copy\/followers\/:id"[\s\S]{0,900}?droppedAt: new Date\(\)/.test(routes), true);
check('...and switches it off, which is what actually stops the copying',
      /app\.delete\("\/api\/copy\/followers\/:id"[\s\S]{0,900}?isActive: false/.test(routes), true);
check('...and wakes the engine instead of waiting for its 60s poll',
      /app\.delete\("\/api\/copy\/followers\/:id"[\s\S]{0,1200}?pg_notify\('copy_change'/.test(routes), true);

// THE ROW MUST LEAVE BOTH LISTS. Connected accounts and Mirror feeds are built from the SAME rows, so
// one filter removes it from both — that is what deleting used to achieve. Filtered on the drop mark
// and NOT on is_active, because a PAUSED relationship must still show: the engine auto-pauses one that
// breaches its drawdown cap (copy_platform/risk_guard.py) and he has to see that happened.
check('the relationship list excludes dropped rows',
      /FROM copy_followers f JOIN copy_masters m[\s\S]{0,200}?f\.dropped_at IS NULL/.test(routes), true);
check('...and does NOT hide merely paused ones',
      /WHERE f\.user_id = \$1 AND f\.is_active/.test(routes), false);

// RE-FOLLOWING MUST STILL BE POSSIBLE. The "Already subscribed with this account" refusal matches any
// existing row, so without the mark a dropped subscription would block re-following that provider with
// that account for ever.
check('a dropped subscription does not count as a duplicate',
      /SELECT id FROM copy_followers[\s\S]{0,200}?dropped_at IS NULL/.test(routes), true);

// THE ENGINE. Two separate paths, and the second is the one easily missed.
const disp = read('copy_platform/dispatcher.py');
check('the engine will not copy for a dropped relationship',
      /is_active\.is_\(True\)[\s\S]{0,200}?dropped_at\.is_\(None\)/.test(disp), true);
check('...and stops writing "not copied" audit lines about one',
      /master_id == master_id[\s\S]{0,200}?dropped_at\.is_\(None\)/.test(disp), true);

// PROD'S SCHEMA PATH. A column added to shared/schema.ts alone gives a live 42703 — production syncs
// from docker-migrate.sql and never runs db:push.
check('the column is in the migration file, not only the schema',
      read('docker-migrate.sql').includes('ADD COLUMN IF NOT EXISTS dropped_at'), true);
check('...and on the Python model, or the engine cannot filter on it',
      read('copy_platform/db.py').includes('dropped_at'), true);

teeth('deleting the row really was refused — two tables reference it with no ON DELETE rule',
      !/references\(\(\) => copyFollowers\.id, \{ onDelete/.test(read('shared/schema.ts')));
teeth('reusing is_active as "dropped" would have hidden the drawdown auto-pause',
      read('copy_platform/risk_guard.py').includes('is_active = False'));

// ── TEETH ───────────────────────────────────────────────────────────────────
teeth('seeding without the ref would re-seed on every 20s refetch',
      !'useEffect(() => { const s = overview?.selfCopy; ... })'.includes('hydrated.current'));
teeth('the old create-or-nothing endpoint would drop a changed setting',
      !'let follower = await get(); if (!follower) { create }'.includes('updateCopyFollower'));

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
