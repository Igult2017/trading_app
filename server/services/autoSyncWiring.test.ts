/**
 * autoSyncWiring.test.ts — run with:
 *     npx tsx server/services/autoSyncWiring.test.ts
 *
 * WHY AN AUTOTRADED TRADE NEVER REACHED THE JOURNAL, AND THE GUARD AGAINST IT RETURNING.
 *
 * His report, 2026-09-02: *"autosync of ctrader placed trades in the journal. We fixed it yesterday
 * and since then it has not autorecorded anything meaning its not working."*
 *
 * THE ROOT CAUSE, measured from the production log on 02 Sep:
 *
 *     [Sync] had GBPUSD 317367514 - closed 11:09:58.654Z, stored 11:09:58.764Z (0 min later),
 *            journal entry NO
 *
 * **Capture was never the problem.** The live feed stored the trade 110 MILLISECONDS after the
 * broker closed it. Writing the JOURNAL ENTRY was, and it was refused by one word: the gate read
 * `if (openTime && closeTime)`. Both of his recent trades arrived with no open time and were
 * therefore never journaled - and the journal is the thing he actually looks at, so "stored" and
 * "recorded" came apart without a single error anywhere.
 *
 * TWO WRONG THEORIES CAME FIRST, and they are why the rest of this file exists:
 *
 *   1. `connection_type` left at 'webhook' - disproved by the log (`sweep: 2 API-connected
 *      account(s)`, both feeds attached, no repair line). The two cTrader OAuth writes genuinely
 *      never set the field, so it stays a LATENT defect for the next account connected, and the
 *      checks below pin it. It was not this bug.
 *   2. stored-but-unjournaled, healed only when an open time was present - the heal copied the
 *      create path's condition and so skipped exactly the rows it existed to rescue.
 *
 * Each wrong theory died to a log line that did not exist that morning. The observability checks
 * below are therefore not decoration: a sync that says nothing on success cannot be diagnosed, and
 * "2 already had" was equally true of a sync working perfectly and one that had missed everything.
 *
 * This defect is a MISSING LINE, which no behaviour test can catch — the code does not throw, it
 * quietly matches nothing. So the source itself is asserted here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) console.log(`        got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

console.log('\nAUTOSYNC WIRING — an account that finished OAuth must be filed as API-connected\n');

// ── 1. THE MISSING LINE, AT BOTH PLACES OAUTH COMPLETES ────────────────────
const routes = read('server/routes.ts');

/** The body of the `updateBrokerAccount` call that finalises OAuth, found by its own fields. */
function oauthUpdateBlock(anchor: string): string {
  const i = routes.indexOf(anchor);
  if (i < 0) throw new Error(`anchor not found — the OAuth path moved: ${anchor}`);
  return routes.slice(i, routes.indexOf('});', i));
}

// The single-account callback: /api/broker/ctrader/callback
const cb = oauthUpdateBlock('loginId:     traderLogin,');
check('the OAuth callback records the account as API-connected',
      /connectionType:\s*'api'/.test(cb), true);
check('...and still stores the credentials that make it one',
      /passwordEnc:\s*safeEncrypt\(credJson\)/.test(cb), true);

// The multi-account chooser: POST /api/broker/ctrader/select-account
const sel = oauthUpdateBlock('loginId:     String(chosen.traderLogin');
check('select-account records the account as API-connected',
      /connectionType:\s*'api'/.test(sel), true);

// ── 2. THE THREE GATES THAT MADE IT FATAL ARE STILL THERE ──────────────────
// They are correct — an account with no API credentials must not be swept or fed. The test pins
// them so that if one is ever loosened instead of the label being set, that is a deliberate act.
const auto = read('server/services/autoSyncService.ts');
const feed = read('server/services/ctraderRealtime.ts');

check('the sweep still selects only API-connected accounts',
      /connectionType,\s*'api'/.test(auto), true);
check('the live feed still requires an API-connected account',
      /account\.connectionType\s*!==\s*'api'/.test(feed), true);

// ── 3. AND THE FEED NO LONGER REFUSES IN SILENCE ───────────────────────────
// The refusal was a bare `return`. A defect that produces no output cannot be found from a log,
// which is why this one survived a day and a manual sync that reported success.
const openFeed = feed.slice(feed.indexOf('async function openFeed'),
                            feed.indexOf('async function openFeed') + 900);
check('a refused feed says so in the log',
      /connectionType\s*!==\s*'api'\)\s*\{[\s\S]{0,400}?console\.(warn|error)/.test(openFeed), true);

// ── 4. NOTHING ON THE SYNC PATH SWALLOWS ITS ERROR ANY MORE ────────────────
// `.catch(() => {})` around the sweep meant one failed database read stopped every sync for ever,
// on the boot run and on every 15-minute tick after it, without a character in the log.
const swallows = auto.split('\n')
  .map((l, i) => [i + 1, l.replace(/\/\/.*$/, '')] as const)   // the comments QUOTE the old code
  .filter(([, l]) => /\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(l))
  // The balance refresh is deliberately best-effort: it is cosmetic, it must never fail a sync,
  // and it already logs inside `updateCTraderBalance`.
  .filter(([, l]) => !/updateCTraderBalance/.test(l))
  .map(([n, l]) => `${n}: ${l.trim()}`);
check('no silent .catch(() => {}) left on the sync path', swallows, []);

const syncRoute = routes.slice(routes.indexOf("app.post(\"/api/broker-accounts/:id/sync"),
                               routes.indexOf("app.post(\"/api/broker-accounts/:id/sync") + 2600);
check('the manual Sync button awaits the sync instead of firing and forgetting',
      /await\s+Promise\.race\(\[\s*syncAccount\(/.test(syncRoute), true);
check('...and reports what was actually recorded',
      /outcome\.created/.test(syncRoute), true);

// ── 5. A MISSED TRADE CAN HEAL ITSELF ──────────────────────────────────────
// The incremental window only looked back 2 hours from the last sync, so a trade missed ONCE fell
// behind it and was never looked at again. Recording de-duplicates on externalId, so a wider
// periodic window cannot double-record.
check('a periodic deep sweep exists', /const DEEP_LOOKBACK_MS/.test(auto), true);
check('...and it reaches back further than the incremental window',
      /DEEP_LOOKBACK_MS\s*=\s*7\s*\*\s*24\s*\*\s*3_600_000/.test(auto), true);
check('the repair for accounts already mislabelled runs at boot',
      /repairApiConnectionType\(\)[\s\S]{0,220}\.finally\(sweep\)/.test(auto), true);
check('...and it keys on the CREDENTIALS, not on the label it is fixing',
      /c\.accessToken\s*&&\s*c\.ctraderId/.test(auto), true);

// ── 6. A CLOSED TRADE REACHES THE JOURNAL EVEN WITH NO OPEN TIME ───────────
//
// THE ACTUAL CAUSE of "it has not autorecorded anything", measured from production on 02 Sep:
//
//   [Sync] had GBPUSD 317367514 — closed 11:09:58.654Z, stored 11:09:58.764Z (0 min later),
//          journal entry NO
//
// Capture was never the problem — the live feed stored the trade 110 MILLISECONDS after the broker
// closed it. Writing the journal entry was, and it was refused by one word: the gate read
// `if (openTime && closeTime)`. Both of his recent trades reached the database with no open time
// and were therefore never journaled, for ever — and the journal is the thing he looks at.
const sync = read('server/services/brokerSyncService.ts');

const createGate = sync.slice(sync.indexOf('// A TRADE THAT HAS CLOSED BELONGS'),
                              sync.indexOf('// A TRADE THAT HAS CLOSED BELONGS') + 1400);
check('the journal gate needs only a CLOSE time', /\n\s*if \(closeTime\) \{/.test(createGate), true);
check('...and does NOT also demand an open time',
      /if \(openTime && closeTime\)/.test(sync), false);

const healGate = sync.slice(sync.indexOf('if (!existing.journalEntryId'),
                            sync.indexOf('if (!existing.journalEntryId') + 120);
check('the heal gate does not repeat the same requirement',
      /existing\.openTime/.test(healGate), false);
check('...and still refuses to touch a trade that already has an entry',
      /!existing\.journalEntryId/.test(healGate), true);

// A missing open time must not silently file the trade under the wrong session: detectSession(null)
// returns SYDNEY, which would corrupt the Sessions page rather than leave a field blank.
check('the session falls back to the close time, not to a default',
      /const at = openTime \?\? closeTime;/.test(sync), true);
check('...and the session is read from that fallback', /detectSession\(at\)/.test(sync), true);
check('the duration stays blank when the open time is unknown',
      /tradeDuration = openTime && closeTime/.test(sync), true);

// ── TEETH ──────────────────────────────────────────────────────────────────
// Prove the checks can fail: the same assertions against the code as it was must NOT pass.
console.log('\n  teeth — the same checks against the broken version:');
const before = cb.replace(/\s*connectionType: 'api',/, '');
check('  the old callback FAILS the connectionType check',
      /connectionType:\s*'api'/.test(before), false);
check('  the OLD journal gate (openTime && closeTime) FAILS the close-only check',
      '    if (openTime && closeTime) {'.includes('if (closeTime) {'), false);
check('  a bare silent return FAILS the log check',
      /connectionType\s*!==\s*'api'\)\s*return;[\s\S]{0,50}console\.(warn|error)/
        .test("if (account.connectionType !== 'api') return;"), false);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
