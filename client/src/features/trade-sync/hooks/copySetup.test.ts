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
check('the response carries a selfCopy block', /\n\s+selfCopy,\n/.test(routes), true);
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
check('...restoring the master', setup.includes('setMasterAccountId(s.masterBrokerAccountId)'), true);
check('...and the mirrors', setup.includes('setSelectedOwnAccounts(s.mirrorBrokerAccountIds'), true);
check('...and the instruments, sessions, drawdown and terms',
      ['setInstruments(s.symbolWhitelist)', 'setSessions(s.activeSessions)',
       'setDrawdown(String(s.maxDdPercent))', 'setAgreed(true)'].every(x => setup.includes(x)), true);

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
check('blockers apply only when starting', /const startBlockers = mirroring \? \[\] :/.test(setup), true);

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
      /const patch: Record<string, any> = \{ isActive: true \};/.test(routes), true);

// ── TEETH ───────────────────────────────────────────────────────────────────
teeth('seeding without the ref would re-seed on every 20s refetch',
      !'useEffect(() => { const s = overview?.selfCopy; ... })'.includes('hydrated.current'));
teeth('the old create-or-nothing endpoint would drop a changed setting',
      !'let follower = await get(); if (!follower) { create }'.includes('updateCopyFollower'));

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
