/**
 * THE ACCOUNT LIMIT IS ENFORCED BY THE SERVER, FROM THE ADMIN SETTING (22 Nov 2026, sync plan step 8).
 * Run: DATABASE_URL=postgresql://x.invalid/x npx tsx server/services/__tests__/accountLimit.check.ts
 *
 * In words: the limit is the admin page's value when it is a valid whole number in 1-1000, otherwise the
 * Coolify variable if valid, otherwise 20 — never a value outside the limits; and the ONE route that creates
 * an account asks for it and refuses BEFORE anything is created (a session row included).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { serverInt } from '../../lib/engineSettings';

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const db = (value?: string) => ({ query: async () => ({ rows: value === undefined ? [] : [{ value }] }) }) as any;
const broken = { query: async () => { throw new Error('no table'); } } as any;

console.log('\nTHE ACCOUNT LIMIT\n');
delete process.env.MAX_ACCOUNTS_PER_USER;
check('no admin row, no variable → 20', await serverInt('max_accounts_per_user', db()), 20);
check('the admin row wins', await serverInt('max_accounts_per_user', db('35')), 35);
check('a row outside 1-1000 is ignored → 20', await serverInt('max_accounts_per_user', db('5000')), 20);
check('a row that is not a whole number is ignored → 20', await serverInt('max_accounts_per_user', db('lots')), 20);
process.env.MAX_ACCOUNTS_PER_USER = '50';
check('no row → the Coolify variable', await serverInt('max_accounts_per_user', db()), 50);
check('an unreadable table → the variable, never a crash', await serverInt('max_accounts_per_user', broken), 50);
process.env.MAX_ACCOUNTS_PER_USER = '0';
check('an invalid variable is ignored too → 20', await serverInt('max_accounts_per_user', db()), 20);
delete process.env.MAX_ACCOUNTS_PER_USER;

// The route: assert the CALLS, in order, inside the create handler — not merely that the words exist.
const routes = readFileSync(join(process.cwd(), 'server/routes.ts'), 'utf8');
const start = routes.indexOf('app.post("/api/broker-accounts", async');
const body = routes.slice(start, routes.indexOf('app.put("/api/broker-accounts/:id"', start));
const asks = body.indexOf('await serverInt("max_accounts_per_user")');
const refuses = body.indexOf('if (held >= limit)');
const session = body.indexOf('await storage.createSession(');
const creates = body.indexOf('await storage.createBrokerAccount(');
check('the create route asks for the limit, refuses, and only then creates the session and the account',
      [asks > 0, refuses > asks, session > refuses, creates > session], [true, true, true, true]);
const callers = (routes.match(/await storage\.createBrokerAccount\(/g) ?? []).length;
check('...and it is the ONLY place an account is created', callers, 1);

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
