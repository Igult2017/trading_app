/**
 * engineSettings.test.ts — run with:
 *     npx tsx server/lib/engineSettings.test.ts
 *
 * THE ENGINE SETTINGS ON THE ADMIN PAGE (19 Nov 2026). Two things are proved:
 *  1. a value is checked against the shared list before it is saved — and the bad ones are REFUSED, since a saved
 *     risk of 50% or a typo'd pair is exactly what this page must never let through;
 *  2. reading and writing work on a REAL Postgres (PGlite) holding the real `platform_settings` table and the real
 *     seed rows, lifted from `docker-migrate.sql` — not a table written out by hand here.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';

process.env.DATABASE_URL ||= 'postgresql://x.invalid/x';   // `../db` needs one to load; nothing connects to it
const { checkValue, findSetting, readEngineSettings, writeEngineSetting } = await import('./engineSettings');

let n = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  n++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`);
  if (!ok) failures.push(name);
}
const S = (name: string) => findSetting(name)!;
const val = (name: string, raw: unknown) => { const r = checkValue(S(name), raw); return 'value' in r ? r.value : 'REFUSED'; };

console.log('\nENGINE SETTINGS — checked before saving; read and written on a real Postgres\n');

// ── 1. the checks ────────────────────────────────────────────────────────────────────────────────────────────────
check('an unknown name is not a setting', findSetting('database_url'), undefined);
check('pairs are tidied: trimmed, lower-case, no repeats', val('autotrade_symbols', ' EUR/USD, xau/usd ,eur/usd'), 'eur/usd,xau/usd');
check('an unknown pair is REFUSED', val('autotrade_symbols', 'eur/usd,doge/usd'), 'REFUSED');
check('an empty pair list is allowed (= every pair)', val('autotrade_symbols', ''), '');
check('an unknown strategy is REFUSED', val('autotrade_strategies', 'vix1,magic'), 'REFUSED');
check('PIX may be added to autotrade', val('autotrade_strategies', 'vix1,pix'), 'vix1,pix');
check('an unknown session is REFUSED', val('autotrade_sessions', 'london,moon'), 'REFUSED');
check('a cut-off is padded to HH:MM', val('autotrade_cutoff_utc', '9:30'), '09:30');
check('a cut-off of 24:00 is REFUSED', val('autotrade_cutoff_utc', '24:00'), 'REFUSED');
check('an empty cut-off is allowed (= no cut-off)', val('autotrade_cutoff_utc', ''), '');
check('risk 1.5% is saved', val('autotrade_risk_pct', '1.5'), '1.5');
check('risk 50% is REFUSED', val('autotrade_risk_pct', '50'), 'REFUSED');
check('risk "abc" is REFUSED', val('autotrade_risk_pct', 'abc'), 'REFUSED');
check('risk "" is REFUSED (not read as zero)', val('autotrade_risk_pct', ''), 'REFUSED');
check('2.5 trades a day is REFUSED (whole numbers only)', val('autotrade_max_per_day', '2.5'), 'REFUSED');
check('a switch saves as true / false', [val('scan_enabled', true), val('scan_enabled', 'false')], ['true', 'false']);
check('a switch given "yes" is REFUSED', val('scan_enabled', 'yes'), 'REFUSED');
check('per-strategy confidence over 1 is REFUSED', val('min_confidence_overrides', 'vix1:0.6,pix:1.4'), 'REFUSED');
check('per-strategy confidence is saved tidied', val('min_confidence_overrides', 'VIX1:0.60, pix:0.7'), 'vix1:0.6,pix:0.7');

// ── 2. on a real Postgres ────────────────────────────────────────────────────────────────────────────────────────
const sql = readFileSync(join(process.cwd(), 'docker-migrate.sql'), 'utf8');
const start = sql.indexOf('CREATE TABLE IF NOT EXISTS platform_settings');
const end = sql.indexOf('-- One row per signal offered', start);
const pg = new PGlite();
await pg.exec(sql.slice(start, end));
delete process.env.AUTOTRADE_RISK_PCT;
process.env.MIN_RR = '2.0';
let st = await readEngineSettings(pg as any);
const one = (name: string) => st.settings.find((x) => x.name === name)!;
check('the migration seeds auto-breakeven ON (it is on in Coolify today)', [one('auto_breakeven_enabled').value, one('auto_breakeven_enabled').source], ['true', 'admin']);
check('a value set in Coolify shows as from Coolify', [one('min_rr').value, one('min_rr').source], ['2.0', 'coolify']);
check('nothing set → the code default', [one('autotrade_risk_pct').value, one('autotrade_risk_pct').source], ['1.0', 'default']);
await writeEngineSetting(S('autotrade_risk_pct'), '1.5', 'tester', pg as any);
st = await readEngineSettings(pg as any);
check('saved → read back, marked from the admin page, with who changed it',
      [one('autotrade_risk_pct').value, one('autotrade_risk_pct').source, one('autotrade_risk_pct').updatedBy], ['1.5', 'admin', 'tester']);
await writeEngineSetting(S('autotrade_risk_pct'), '2', 'tester2', pg as any);
st = await readEngineSettings(pg as any);
check('saving again overwrites the one row', [one('autotrade_risk_pct').value, one('autotrade_risk_pct').updatedBy], ['2', 'tester2']);
await writeEngineSetting(S('autotrade_risk_pct'), null, 'tester', pg as any);
st = await readEngineSettings(pg as any);
check('Reset deletes the row → back to the default', [one('autotrade_risk_pct').value, one('autotrade_risk_pct').source], ['1.0', 'default']);
await pg.exec(`INSERT INTO platform_settings (key, value) VALUES ('autotrade_max_lots', '999')`);
st = await readEngineSettings(pg as any);
check('a bad row written some other way is NOT shown as in use (the engine ignores it too)', one('autotrade_max_lots').source, 'default');
const mode = await pg.query(`SELECT value FROM platform_settings WHERE key = 'trade_mode'`);
check('the trading switch row is untouched by any of this', mode.rows[0], { value: 'auto' });

// SABOTAGE — accept every value: the 50% risk must then get through, or check() was not what stopped it.
const realKind = S('autotrade_risk_pct').max;
S('autotrade_risk_pct').max = 1000;
check('TEETH — the range check is what refuses risk 50% (fails when broken)', val('autotrade_risk_pct', '50') !== 'REFUSED', true);
S('autotrade_risk_pct').max = realKind;

console.log(failures.length ? `\n${failures.length} of ${n} FAILED: ${JSON.stringify(failures)}` : `\nALL PASS (${n} checks)`);
// Close, then let Node exit by itself: a forced exit while PGlite shuts down crashes Node on Windows
// (exit 127) after every check passed — see server/services/journalEntryUniqueness.test.ts.
await pg.close();
process.exitCode = failures.length ? 1 : 0;
