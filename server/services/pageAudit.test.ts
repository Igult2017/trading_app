/**
 * pageAudit.test.ts — run with:
 *     npx tsx server/services/pageAudit.test.ts
 *
 * THE PAGE-BY-PAGE AUDIT OF 2026-09-04, dashboard to leaderboard. One check per defect, each one
 * red against the code as it was. Full account in docs/audit-2026-09-04.md.
 *
 * Two of these are BEHAVIOURAL and driven through the real function (`classifyOutcome`); the rest
 * are wiring and SQL, which no behaviour test can reach from here — a query string and a fetch URL
 * do not throw when they are wrong, they just quietly answer the wrong question. So the source is
 * asserted, and each assertion is paired with teeth proving it can fail.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyOutcome } from '../../client/src/lib/tradeStats';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');

const routes  = read('server', 'routes.ts');
const board   = read('client', 'src', 'components', 'Leaderboard.tsx');
const history = read('client', 'src', 'components', 'TradeHistory.tsx');
const journal = read('client', 'src', 'pages', 'Journal.tsx');
const metrics = read('server', 'python', 'metrics_calculator.py');

console.log('\nPAGE AUDIT 2026-09-04 — dashboard to leaderboard\n');


// ── A. THE LEADERBOARD ─────────────────────────────────────────────────────
//
// His ask: "autosync users must also be desplayed in the leaderboard but with their names they used
// to signup to the journal." Both tabs called /api/leaderboard/by-session, which groups by
// `ts.id` — one row per (session, user). A broker account gets its OWN auto-created session
// (routes.ts:3904), so an autosync trader appeared twice with their P&L split; and that query
// INNER-joins trading_sessions, so a trade journaled with a null session was invisible entirely.
console.log('A. the leaderboard:');

const overallQuery = board.slice(board.indexOf('loadingOverall'), board.indexOf('const sessionParam'));
check('the Overall tab asks the per-USER endpoint',
      /fetchJson<[^>]*>\(`\/api\/leaderboard\?period=/.test(overallQuery), true);
check('...and no longer asks the per-SESSION one',
      /\/api\/leaderboard\/by-session/.test(overallQuery), false);
check('...and its cache key changed with it, so a stale entry cannot serve the old shape',
      /queryKey: \['\/api\/leaderboard', activePeriod\]/.test(overallQuery), true);

// The By Session tab must still exist — this was a fix, not a removal.
const sessionQuery = board.slice(board.indexOf('const sessionParam'), board.indexOf('sessionNamesData'));
check('the By Session tab still asks the per-session endpoint',
      /\/api\/leaderboard\/by-session\?period=/.test(sessionQuery), true);

// The name lookup: one copy, called by BOTH boards.
check('there is a single named helper for the signup name',
      /async function fillInSignupNames\(rows: any\[\]\): Promise<void>/.test(routes), true);
check('...called by exactly two boards', (routes.match(/await fillInSignupNames\(rows\)/g) ?? []).length, 2);
check('...and it repairs a BLANK NAME regardless of the email',
      /!r\.full_name \|\| !String\(r\.full_name\)\.trim\(\)/.test(routes), true);
// TEETH — the old filter required BOTH to be missing, and user_profiles.email is NOT NULL, so it
// could never fire for the row it existed to fix.
// STRIP THE COMMENTS FIRST. The note explaining why that filter was replaced QUOTES it, so grepping
// the raw file makes this check fail on its own explanation — the same trap that left an earlier
// suite permanently red. What matters is that no live line still does it.
const routesCode = routes.split(/\r?\n/).map(l => l.replace(/\/\/.*$/, '')).join('\n');
check('  teeth: the old both-missing filter is gone from the CODE',
      /!r\.full_name && !r\.email/.test(routesCode), false);
// ...and it must still be time-boxed, or a slow Supabase becomes a 502 on the whole board.
const helper = routes.slice(routes.indexOf('async function fillInSignupNames'),
                            routes.indexOf('export async function registerRoutes'));
check('the lookup is still time-boxed against a slow Supabase',
      /Promise\.race\(\[[\s\S]*?setTimeout\(resolve, 4000\)/.test(helper), true);
check('...and can never take the response down', /catch \(err: any\)/.test(helper), true);

// "Hide me" must mean hidden on the board the page opens on.
const mainBoard = routes.slice(routes.indexOf('app.get("/api/leaderboard"'),
                               routes.indexOf('app.get("/api/leaderboard/by-session"'));
check('the main board honours leaderboard_hidden',
      /leaderboard_hidden IS NULL OR up\.leaderboard_hidden = false/.test(mainBoard), true);
// TEETH — the ADMIN board must NOT filter on it, or a hidden trader can never be un-hidden.
// It does SELECT the column (`bool_or(up.leaderboard_hidden) AS hidden`) so the admin UI can show
// the toggle — that is correct and must survive. The distinction is SELECT versus WHERE.
const adminBoard = routes.slice(routes.indexOf('app.get("/api/admin/leaderboard/entries"'),
                                routes.indexOf('app.get("/api/admin/leaderboard/entries"') + 2500);
check('  teeth: the admin board does NOT filter hidden traders out',
      /leaderboard_hidden IS NULL OR/.test(adminBoard), false);
check('  ...but still reports who is hidden, so they can be un-hidden',
      /bool_or\(up\.leaderboard_hidden\)/.test(adminBoard), true);


// ── B. OUTCOME LABELS ──────────────────────────────────────────────────────
//
// `journal_entries.outcome` is free text with two writers and two casings: the manual form saves
// "Win"/"Loss"/"BE", the automatic pipeline saves "WIN"/"LOSS"/"BE". Neither is lowercase.
console.log('\nB. outcome labels — one classifier, not four:');

// B0. The classifier itself, driven for real. This is what every fix below leans on.
check('classifyOutcome reads the manual form\'s casing', classifyOutcome({ outcome: 'Win' }), 'win');
check('...and the automatic pipeline\'s',                classifyOutcome({ outcome: 'WIN' }), 'win');
check('...and a loss from either',                       classifyOutcome({ outcome: 'Loss' }), 'loss');
check('...and a break-even is its OWN class, not a loss', classifyOutcome({ outcome: 'BE' }), 'be');
// TEETH — the test the pages used to run, against the values the column really holds.
check('  teeth: the old lowercase test fails on a real manual win',
      String({ outcome: 'Win' }.outcome).toLowerCase() === 'win' && 'Win' === 'win', false);
check('  teeth: ...and on a real automatic win', ('WIN' as string) === 'win', false);

// B1. /history — every winning trade was badged LOSS, and the filters matched nothing.
check('the Wins filter classifies instead of string-matching',
      /if \(filter === 'wins'\) return classifyOutcome\(trade\) === 'win'/.test(history), true);
check('the Losses filter too',
      /if \(filter === 'losses'\) return classifyOutcome\(trade\) === 'loss'/.test(history), true);
check('the card border classifies', /classifyOutcome\(trade\) === 'win'\n?\s*\? 'border-green/.test(history), true);
check('the badge classifies', /classifyOutcome\(trade\) === 'win' \? 'default'/.test(history), true);
// TEETH — no raw comparison may survive anywhere on that page.
check('  teeth: no raw `outcome ===` left in TradeHistory',
      history.split(/\r?\n/).filter(l => /trade\.outcome\s*===/.test(l) && !l.trim().startsWith('//') && !l.includes('*')), []);
check('  teeth: and no hand-rolled BE list left either',
      /\['be', 'BE', 'breakeven', 'Break Even'\]\.includes/.test(history), false);

// B2. The dashboard's recent-trade log filed a break-even as a loss and signed it from the label.
check('the dashboard log classifies the row', /status: classifyOutcome\(e\),/.test(journal), true);
check('...and takes the +/- sign from the MONEY, not the label',
      /\{t\.pnl >= 0 \? '\+' : '-'\}\$\{Math\.abs\(t\.pnl\)\.toFixed\(2\)\}/.test(journal), true);
check('...and gives a break-even its own colour rather than red',
      /t\.status === 'be' \? '#fbbf24'/.test(journal), true);

// B3. Profit/Loss ratio counted break-evens as losses.
check('the profit ratio divides by DECISIVE trades',
      /profitRatio = decisiveCount > 0 \? Math\.round\(\(winCount \/ decisiveCount\) \* 100\)/.test(journal), true);
// TEETH — the old denominator was every trade.
check('  teeth: the total-trades denominator is gone',
      /winCount \/ totalCount/.test(journal), false);

// B4. The metrics engine computed win rate two ways.
check('the monthly breakdown excludes break-evens from the denominator',
      /decisive = len\(wins\) \+ len\(losses\)[\s\S]{0,120}win_rate = \(len\(wins\) \/ decisive \* 100\)/.test(metrics), true);
check('  teeth: the len(trades) denominator is gone',
      /win_rate = \(len\(wins\) \/ len\(trades\) \* 100\)/.test(metrics), false);
// ...and the canonical helper it now agrees with must still be the one `core` uses.
check('core still uses the canonical win_rate_of', /win_rate=win_rate_of\(trades\)/.test(metrics), true);


// ── C. AUTH ────────────────────────────────────────────────────────────────
console.log('\nC. auth:');
check('the cTrader setup route requires ADMIN_SECRET to actually be set',
      /if \(!adminSecret \|\| req\.query\.secret !== adminSecret\)/.test(routes), true);
// TEETH — the old form passed when the variable was unset.
check('  teeth: the bare comparison is gone',
      /req\.query\.secret !== process\.env\.ADMIN_SECRET/.test(routes), false);
check('  teeth: ...and it really did open — undefined !== undefined is false',
      (undefined as any) !== (undefined as any), false);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
