/**
 * isolation.test.ts — run with:
 *     npx tsx server/services/autoJournal/isolation.test.ts
 *
 * THE AUTOMATIC PIPELINE MUST NOT BE ABLE TO REACH THE MANUAL ONE.
 *
 * His instruction, 2026-09-02: *"when fixing autojournal sync and entry, please make it to be a
 * separate pipeline from the manual journal entry and calculations because the manual one is working
 * fine so dont tamper with it even a bit. Just create a different pipeline for autojournaling."*
 *
 * THE RULE THIS ENFORCES:
 *
 *     The automatic pipeline may CALL shared infrastructure. It must NEVER MODIFY it. Where
 *     automatic journaling needs different behaviour, it implements its own version inside
 *     services/autoJournal/.
 *
 * "Call" and "modify" are different things, and the distinction is what keeps this honest. Both
 * pipelines have to write to `journal_entries` — that table IS the journal, and a synced trade that
 * does not land in it is invisible, which was the original complaint. Both also need the SAME
 * account-level balance enrichment, or a synced trade and a typed one would be weighted differently
 * by the risk analytics. What must never be shared is the per-trade CALCULATION, because that is the
 * part being changed.
 *
 * This is a source-level test on purpose. The failure it guards against is someone editing a shared
 * helper to suit automatic journaling — which no behaviour test of the automatic path would catch,
 * because the automatic path would be working perfectly. The damage would be to the manual one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf-8');

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

console.log('\nPIPELINE ISOLATION — the manual journal is not touched by any of this\n');

const routes = read('server', 'routes.ts');
const idx    = read('server', 'services', 'autoJournal', 'index.ts');
const fields = read('server', 'services', 'autoJournal', 'fields.ts');
const risk   = read('server', 'services', 'autoJournal', 'risk.ts');
const sync   = read('server', 'services', 'brokerSyncService.ts');
const auto   = idx + fields + risk;

// ── 1. THE MANUAL ENDPOINT IS INTACT ───────────────────────────────────────
// Its shape, pinned by the things that make it what it is. If a future change to auto-journaling
// starts editing this handler, these fail.
const manual = routes.slice(routes.indexOf('app.post("/api/journal/entries"'),
                            routes.indexOf('app.put("/api/journal/entries/:id"'));
check('the manual endpoint still validates through its own schema',
      /insertJournalEntrySchema\.parse\(enriched\)/.test(manual), true);
check('...still enriches with balance itself', /enrichTradeWithBalance\(sessionId, sanitized\)/.test(manual), true);
check('...still defaults the risk percent to 1', /sanitized\.riskPercent = "1"/.test(manual), true);
check('...and still writes through storage.createJournalEntry',
      /storage\.createJournalEntry\(validatedData\)/.test(manual), true);

// The manual handler must not have grown a dependency on the automatic pipeline.
check('the manual endpoint calls nothing from autoJournal/',
      /autoJournal|journalSyncedTrade|computeRisk|buildJournalEntry/.test(manual), false);

// ── 2. THE AUTOMATIC PIPELINE OWNS ITS OWN CALCULATIONS ────────────────────
check('the automatic pipeline computes its own risk', /export function computeRisk/.test(risk), true);
check('...builds its own journal entry', /export function buildJournalEntry/.test(fields), true);
check('...and classifies its own outcome', /export function classifyOutcome/.test(fields), true);

// And the ingestion service no longer decides anything about a journal entry — that was the mixing.
check('brokerSyncService no longer builds a journal entry',
      /InsertJournalEntry\s*=\s*\{/.test(sync), false);
check('...and no longer classifies an outcome itself',
      /function classifyOutcome/.test(sync), false);
check('...it calls the pipeline instead', /journalSyncedTrade\(/.test(sync), true);

// ── 3. SHARED INFRASTRUCTURE IS CALLED, NEVER RE-IMPLEMENTED ───────────────
// Both directions are wrong: editing the shared helper (breaks manual), or copying it (two versions
// that drift). It must be imported and used as-is.
check('the automatic pipeline imports the SHARED balance enrichment',
      /import \{ enrichTradeWithBalance \} from '\.\.\/balanceTracker'/.test(idx), true);
check('...and does not define its own copy of it',
      /function enrichTradeWithBalance/.test(auto), false);
check('...nor its own journal-entry writer',
      /db\.insert\(journalEntries\)/.test(auto), false);

// ── 4. THE FILES THE MANUAL PATH DEPENDS ON ARE NOT EDITED FOR AUTO'S SAKE ─
// `balanceTracker` is shared. A comment or change in it that mentions the automatic pipeline is the
// smell this catches — it would mean auto's needs had started shaping manual's behaviour.
const balance = read('server', 'services', 'balanceTracker.ts');
check('balanceTracker carries no automatic-journal special-casing',
      /autoJournal|syncedTrade|autoJournaled/.test(balance), false);

// ── TEETH ──────────────────────────────────────────────────────────────────
console.log('\n  teeth — the checks can actually fail:');
check('  a manual handler that called the pipeline WOULD be caught',
      /autoJournal|journalSyncedTrade/.test('const e = await journalSyncedTrade(t);'), true);
check('  a copied balance helper WOULD be caught',
      /function enrichTradeWithBalance/.test('function enrichTradeWithBalance(a, b) {}'), true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
