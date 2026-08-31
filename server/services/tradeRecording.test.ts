/**
 * tradeRecording.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/tradeRecording.test.ts
 *
 * EVERY TRADE ON A CONNECTED ACCOUNT MUST END UP RECORDED, AND FILED UNDER THAT ACCOUNT.
 * His ask, 2026-08-31: *"make sure that all trades that are autotraded are recorded. I need each
 * added account to have a session in the session page under its name so that I can click on it and
 * see performance."*
 *
 * THE GAP THAT EXISTED. cTrader was skipped by the 15-minute sync — *"only sync on connect or manual
 * trigger, never on timer"* — which left the live push feed as the ONLY ongoing way a cTrader trade
 * was ever recorded. Fine while the feed is up, silently lossy when it is not: a dropped socket, a
 * deploy or a restart, and any trade closing in that gap was never recorded at all. Autotrade's own
 * trades close on exactly that path.
 *
 * WHY THE OLD REASON NO LONGER HOLDS: every cTrader socket Node opens now takes a lease from
 * `ctraderConnPool`, so these syncs queue instead of storming the broker.
 *
 * THESE ARE WIRING CHECKS, read off the source. The paths themselves need a live broker and a
 * database; what can be lost silently is the WIRING — a `continue` put back, a session id no longer
 * passed — and that is what is asserted here. Same reasoning as the copy-platform route guard.
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
const sync    = read('server', 'services', 'autoSyncService.ts');
const broker  = read('server', 'services', 'brokerSyncService.ts');
const routes  = read('server', 'routes.ts');
const grid    = read('client', 'src', 'components', 'CreateSession.tsx');
const adapter = read('server', 'services', 'brokerAdapters', 'ctrader.ts');

console.log('\nTRADE RECORDING — nothing is lost, and everything is filed under its account');

// ── 1. THE SAFETY NET ───────────────────────────────────────────────────────
const syncAll = sync.slice(sync.indexOf('async function syncAllAccounts'));
check('the periodic sync no longer skips cTrader',
      /if \(account\.platform\.toLowerCase\(\) === 'ctrader'\) continue;/.test(syncAll), false);
check('...and it still syncs every API account it finds',
      /syncAccount\(account\)/.test(syncAll), true);
check('the sync path takes a pooled connection, so re-enabling it cannot storm the broker',
      adapter.includes("acquire('task', 'trade-sync')"), true);

// ── 2. RECORDING TWICE MUST BE IMPOSSIBLE ───────────────────────────────────
// The live feed and the periodic sync now both file the same closed deal. Only the de-duplication
// stops that becoming two trades in his journal.
check('incoming trades are de-duplicated per account',
      broker.includes('getSyncedTradeByExternal(brokerAccountId, raw.externalId)'), true);
check('...and a duplicate is skipped rather than inserted',
      /if \(existing\) \{ duplicates\+\+; continue; \}/.test(broker), true);

// ── 3. FILED UNDER THE ACCOUNT ──────────────────────────────────────────────
check('every broker account is created with its own session',
      /const session = await storage\.createSession\(/.test(routes), true);
check('...and the account points at it', routes.includes('defaultSessionId: session.id'), true);
check('recorded trades are filed against that session',
      broker.includes('account?.defaultSessionId') &&
      broker.includes('autoJournalTrade(synced, defaultSessionId)'), true);

// ── 4. THE SESSIONS PAGE SHOWS THEM ─────────────────────────────────────────
check('the sessions list no longer filters broker-backed sessions out',
      grid.includes('allSessions.filter((s) => !s.brokerBacked)'), false);
check('...it shows them all', /const sessions = allSessions;/.test(grid), true);
check('the server still marks which sessions belong to an account',
      routes.includes('brokerBacked: brokerSessionIds.has(s.id)'), true);
check('a broker-backed card is labelled as an account', grid.includes('>account</span>'), true);

// A broker session must NOT be deletable from the grid: the account points at it, and its trades are
// filed under it, so removing it here would strand the account's whole history.
check('a broker-backed card offers no delete', grid.includes('Managed on the Accounts page'), true);
check('...while a manual session still does',
      grid.includes('button-delete-session-${session.id}'), true);

// ── TEETH ───────────────────────────────────────────────────────────────────
teeth('restoring the cTrader skip would be caught',
      /if \(account\.platform\.toLowerCase\(\) === 'ctrader'\) continue;/
        .test("if (account.platform.toLowerCase() === 'ctrader') continue;"));
teeth('re-adding the brokerBacked filter would be caught',
      'const sessions = allSessions.filter((s) => !s.brokerBacked);'
        .includes('allSessions.filter((s) => !s.brokerBacked)'));

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
