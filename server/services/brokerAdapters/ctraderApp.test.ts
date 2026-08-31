/**
 * ctraderApp.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/services/brokerAdapters/ctraderApp.test.ts
 *
 * WHAT BROKE. A user clicking "Add Account" was sent to connect.spotware.com and got a bare
 * **404 NOT FOUND**. The sign-in link carried `client_id=34053_…`, which is the SECOND cTrader app
 * ("Journal Trade Sync") — the one Spotware has never approved.
 *
 * `newConnectApp()` returned 'sync' whenever that app's id and secret were merely PRESENT, and they
 * have been present in production since the apps were split. Being configured is not the same as
 * being approved, and nothing enforced the difference. The function's own comment even said to
 * "deploy the cutover only once the portal shows the app Active" — but setting the variables WAS
 * the cutover, so the warning had nothing behind it.
 *
 * Approval is now its own switch. These checks pin both halves: unapproved must never be chosen,
 * and the read path for accounts already connected under the sync app must not change.
 */
import { newConnectApp, appCreds } from './ctrader';

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

const E = process.env;
const save = {
  id: E.CTRADER_SYNC_CLIENT_ID, secret: E.CTRADER_SYNC_CLIENT_SECRET,
  approved: E.CTRADER_SYNC_APP_APPROVED,
  legacyId: E.CTRADER_CLIENT_ID, legacySecret: E.CTRADER_CLIENT_SECRET,
};

function setEnv(v: Partial<Record<string, string | undefined>>) {
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined) delete E[k]; else E[k] = val;
  }
}

console.log('\nCTRADER APP CHOICE — configured is not approved');

setEnv({ CTRADER_CLIENT_ID: '30153_legacy', CTRADER_CLIENT_SECRET: 'legacysecret' });

// ── THE LIVE 404 ────────────────────────────────────────────────────────────
// Exactly production's state on 31 Aug: both sync variables set, approval never granted.
setEnv({ CTRADER_SYNC_CLIENT_ID: '34053_sync', CTRADER_SYNC_CLIENT_SECRET: 'syncsecret',
         CTRADER_SYNC_APP_APPROVED: undefined });
check('sync configured but NOT approved -> legacy (this is the 404 fix)', newConnectApp(), 'legacy');
check('...and the sign-in link therefore carries the legacy client id',
      appCreds(newConnectApp()).clientId, '30153_legacy');

// ── APPROVAL MUST BE EXPLICIT ───────────────────────────────────────────────
for (const v of ['false', 'FALSE', '', '1', 'yes', 'TRUE ']) {
  setEnv({ CTRADER_SYNC_APP_APPROVED: v });
  const want = v.trim().toLowerCase() === 'true' ? 'sync' : 'legacy';
  check(`CTRADER_SYNC_APP_APPROVED=${JSON.stringify(v)} -> ${want}`, newConnectApp(), want);
}

setEnv({ CTRADER_SYNC_APP_APPROVED: 'true' });
check('approved AND configured -> sync (the day Spotware says yes)', newConnectApp(), 'sync');
check('...and it uses the sync client id', appCreds(newConnectApp()).clientId, '34053_sync');

// Approved but not configured must still fall back rather than send an empty client id.
setEnv({ CTRADER_SYNC_CLIENT_ID: undefined, CTRADER_SYNC_CLIENT_SECRET: undefined });
check('approved but NOT configured -> legacy', newConnectApp(), 'legacy');

// ── THE READ PATH MUST NOT CHANGE ───────────────────────────────────────────
// Accounts already connected under the sync app carry `app: "sync"`, and their tokens only
// authenticate under that app's credentials. Unsetting the sync variables — the other obvious fix —
// would have silently rerouted them to the legacy pair, because appCreds falls back.
setEnv({ CTRADER_SYNC_CLIENT_ID: '34053_sync', CTRADER_SYNC_CLIENT_SECRET: 'syncsecret',
         CTRADER_SYNC_APP_APPROVED: undefined });
check('an account stored as app="sync" STILL reads with the sync credentials',
      appCreds('sync').clientId, '34053_sync');
check('an account stored as app="legacy" reads with the legacy credentials',
      appCreds('legacy').clientId, '30153_legacy');
check('an account with no app recorded reads with the legacy credentials',
      appCreds(undefined).clientId, '30153_legacy');

// ── TEETH ───────────────────────────────────────────────────────────────────
const old = () => (E.CTRADER_SYNC_CLIENT_ID && E.CTRADER_SYNC_CLIENT_SECRET ? 'sync' : 'legacy');
teeth('the old rule chose the UNAPPROVED app in production\'s exact state', old() === 'sync');
teeth('...while the new rule chooses legacy in that same state', newConnectApp() === 'legacy');

setEnv(save as any);
console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
