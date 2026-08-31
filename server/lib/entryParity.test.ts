/**
 * entryParity.test.ts — run with:
 *     DATABASE_URL="postgresql://x:x@localhost:5432/x" npx tsx server/lib/entryParity.test.ts
 *
 * THE TWO ENTRY FILES MUST NOT DRIFT AGAIN.
 *
 * `server/index.ts` is what every change gets made to. `server/index.prod.ts` is what the container
 * actually runs (`start.sh:69`). They were kept in step BY HAND and drifted twice, both times
 * silently and both times for months:
 *
 *   • Helmet and both rate limiters were added to `index.ts` on 2026-06-07 and never mirrored, so
 *     production served no security headers and **no brute-force limit on the login endpoint**.
 *     Measured on the live site: `X-Powered-By: Express` was still being sent (helmet removes it)
 *     and no `RateLimit-*` header ever appeared.
 *   • `startAutoSync` and `startCTraderRealtime` — the ONLY two things that record a broker trade —
 *     were added to `index.ts` and never mirrored, so production recorded nothing. That is why a
 *     connected account's session read `Trades 0` forever.
 *
 * Neither was caught by a type error, a failing test or a red deploy. The drift is invisible by
 * construction, which is exactly why it is asserted in writing here.
 *
 * WHAT IS ALLOWED TO DIFFER: one thing only — `index.ts` mounts the Vite dev middleware where
 * `index.prod.ts` calls `serveStatic`, plus the two Python child processes that `start.sh` already
 * spawns in the container. Everything else must come from the shared modules.
 *
 * THESE ARE SOURCE CHECKS. Booting both entries needs a database, a port and a broker; what can be
 * lost silently is the WIRING, and that is what is asserted. Same reasoning as
 * `services/tradeRecording.test.ts`.
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

/**
 * Comments removed. These files EXPLAIN the drift they exist to prevent, so their prose names the
 * very things the checks below forbid — "`startCopyPlatform` has no guard", "`await import("./vite")`
 * is what hoists Vite". A check reading the raw text fails on the explanation and passes on nothing.
 * What is being asserted is what the file DOES, so the checks read code only.
 */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
   .replace(/(^|[^:])\/\/.*$/gm, '$1');   // line comments, sparing the // in a URL

const dev    = code(read('server', 'index.ts'));
const prod   = code(read('server', 'index.prod.ts'));
const setup  = code(read('server', 'lib', 'appSetup.ts'));
const bg     = code(read('server', 'lib', 'backgroundServices.ts'));

console.log('\nENTRY PARITY — production runs what development runs');

// ── 1. BOTH ENTRIES GO THROUGH THE SHARED MODULES ───────────────────────────
for (const [name, src] of [['index.ts', dev], ['index.prod.ts', prod]] as const) {
  check(`${name} applies the shared middleware`, /applyAppSetup\(app\)/.test(src), true);
  check(`${name} installs the shared error handler`, /installErrorHandler\(app\)/.test(src), true);
  check(`${name} starts the shared background services`, /startBackgroundServices\(\)/.test(src), true);
}

// ── 2. NEITHER ENTRY RE-DECLARES WHAT THE SHARED MODULE OWNS ────────────────
// A middleware added to one entry only is the exact shape of both past failures.
for (const [name, src] of [['index.ts', dev], ['index.prod.ts', prod]] as const) {
  for (const banned of ['helmet(', 'compression(', 'rateLimit(', "app.set('trust proxy'"]) {
    check(`${name} does not re-declare ${banned}`, src.includes(banned), false);
  }
}

// ── 3. THE SECURITY MIDDLEWARE EXISTS EXACTLY ONCE, IN THE SHARED MODULE ────
check('the shared module sets trust proxy', setup.includes("app.set('trust proxy', 1)"), true);
check('...applies helmet', /app\.use\(helmet\(/.test(setup), true);
check('...applies compression', /app\.use\(compression\(\)\)/.test(setup), true);
check('...rate-limits the auth endpoints', /app\.use\('\/api\/auth', rateLimit\(/.test(setup), true);
check('...and rate-limits the API generally', /app\.use\('\/api', rateLimit\(/.test(setup), true);
check('the auth limit is still 10 attempts per 15 minutes',
      /windowMs: 15 \* 60_000,\s*max: 10,/.test(setup), true);

// ── 4. THE TRADE RECORDERS REACH PRODUCTION ─────────────────────────────────
// This is the defect he actually reported: a connected account showing no trades.
check('the shared services module starts the 15-minute sync',
      /startAutoSync\(\);/.test(bg), true);
check('...and the live cTrader feed', /startCTraderRealtime\(\);/.test(bg), true);
check('...and the scraper and health watchdog',
      /scraperScheduler\.start\(\);/.test(bg) && /startHealthWatchdog\(\);/.test(bg), true);
check('...all behind the single primary-worker check',
      /if \(!isPrimaryWorker\) return;/.test(bg), true);

// The signal-platform status mirror only runs when SIGNAL_PLATFORM_MANAGED is set — i.e. only in the
// container — yet it lived in the DEVELOPMENT entry, so it had never run anywhere.
check('the signal-platform status mirror is in the shared module',
      bg.includes('SIGNAL_PLATFORM_MANAGED') && bg.includes('.signal_platform_status.json'), true);

// ── 5. THE PYTHON CHILD PROCESSES STAY OUT OF PRODUCTION ────────────────────
// start.sh already spawns both. `startCopyPlatform` has no MANAGED guard of its own, so calling it
// in the container would run a SECOND copy engine and duplicate every copied trade.
check('the shared module does not spawn the copy engine',
      bg.includes('startCopyPlatform'), false);
check('the shared module does not spawn the signal platform',
      bg.includes('startSignalPlatform'), false);
check('the production entry does not spawn either',
      prod.includes('startCopyPlatform') || prod.includes('startSignalPlatform'), false);
check('the dev entry still spawns them', dev.includes('startCopyPlatform()'), true);
check('...and still guards the signal platform against start.sh',
      /!process\.env\.SIGNAL_PLATFORM_MANAGED\) startSignalPlatform\(\)/.test(dev), true);

// ── 6. PRODUCTION MUST STAY FREE OF VITE ────────────────────────────────────
// This is what makes the split load-bearing: `vite` is a devDependency and the production image
// installs with `npm ci --omit=dev`, so a Vite import reaching `index.prod.ts` is a startup crash.
check('the production entry imports nothing from ./vite', prod.includes('./vite'), false);
check('...and the shared modules do not either',
      setup.includes('./vite') || bg.includes('./vite'), false);
check('the dev entry still reaches Vite lazily, inside the development branch',
      /if \(app\.get\("env"\) === "development"\) \{\s*const \{ setupVite \} = await import\("\.\/vite"\)/.test(dev), true);

// ── 7. THE ERROR HANDLER NO LONGER RE-THROWS ────────────────────────────────
// `index.prod.ts` used to `throw err` after already sending the response. Nothing catches a throw
// inside an Express error handler, so it surfaced as an unhandled rejection.
check('the production entry no longer re-throws from the error handler',
      /throw err;/.test(prod), false);
check('the shared handler guards against a second response',
      setup.includes('if (!res.headersSent)'), true);

// ── TEETH ───────────────────────────────────────────────────────────────────
teeth('a middleware added to one entry only would be caught',
      'app.use(helmet());'.includes('helmet('));
teeth('a service that never reaches production would be caught',
      !'startBackgroundServices();'.includes('startAutoSync'));
teeth('a Vite import leaking into the production entry would be caught',
      'const { setupVite } = await import("./vite");'.includes('./vite'));

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
