/**
 * plInput.test.ts — run with:
 *     npx tsx client/src/components/plInput.test.ts
 *
 * HIS REPORT, 2026-09-05: *"Im not able to edit P&L, i wanted to edit it to negative and that is not
 * happening."*
 *
 * It was not a refusal — it was a SILENT ZERO, and it reached the database. His EURUSD trade of
 * 01 Sep, which the broker records as a $51.03 loss, is stored as `0`; the session's whole
 * `SUM(profit_loss)` came to −1.88 across two trades, which is only possible if that one is nought.
 *
 * The old box did three things wrong in five lines:
 *
 *     value={Math.abs(form.pl)}          showed the number WITHOUT its sign, so a typed minus was
 *                                        wiped on the very next render
 *     parseFloat(e.target.value) || 0    a `type="number"` input reports a half-typed "-" as the
 *                                        EMPTY STRING; parseFloat("") is NaN and `|| 0` made it 0
 *     outcome === "LOSS" ? -val : val    negated a value that was already signed
 *
 * The box is now plain text and `plValue` decides — strictly — whether what is in it is a number
 * yet. THE WHOLE POINT IS WHAT IT REFUSES: a partial entry must come back as null, never as zero,
 * because zero is a number a trader might mean.
 */

/** Mirrors `plValue` in TradeVault.tsx. Kept in step by the source check at the bottom. */
function plValue(text: string): number | null {
  const s = String(text ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

console.log('\nTHE P/L BOX KEEPS WHAT HE TYPES\n');

// ── 1. HIS ACTUAL CASE, KEYSTROKE BY KEYSTROKE ─────────────────────────────
// Typing "-51.03" into the old box: the "-" became 0 and the sign never survived. Every one of these
// intermediate states must be held, not corrected.
console.log('1. typing -51.03, one keystroke at a time:');
const keystrokes = ['-', '-5', '-51', '-51.', '-51.0', '-51.03'];
const parsed = keystrokes.map(plValue);
check('the states on the way are held, not read as a number',
      parsed, [null, -5, -51, null, -51, -51.03]);
check('and the finished figure is exactly what he typed',
      plValue('-51.03'), -51.03);

// THE ONE THAT MATTERS. A minus on its own is NOT zero — the old code said it was, and that is how
// a $51.03 loss became a nought in his journal.
check('a lone minus sign is NOT a number, and above all is NOT zero', plValue('-'), null);
check('nor is an empty box', plValue(''), null);
check('nor is a lone decimal point', plValue('.'), null);

// ── 2. ZERO IS A REAL ANSWER ───────────────────────────────────────────────
// A break-even trade is genuinely 0. The distinction the old code could not make is between "he
// means zero" and "he is halfway through typing".
console.log('\n2. zero typed on purpose is kept:');
check('"0" is the number zero',    plValue('0'),    0);
check('"0.00" too',                plValue('0.00'), 0);
check('"-0" too',                  plValue('-0'),   -0);

// ── 3. RUBBISH IS REFUSED RATHER THAN GUESSED ──────────────────────────────
console.log('\n3. nothing is invented from rubbish:');
for (const junk of ['abc', '5-1', '--5', '1.2.3', '5e3', ' ', '$51', '51,03'])
  check(`"${junk}" is not a number`, plValue(junk), null);
// A number with spaces around it IS one — that is a paste, not a mistake.
check('" -51.03 " pasted with spaces still reads', plValue(' -51.03 '), -51.03);

// ── 4. THE SIGN IS HIS, NOT THE LABEL'S ────────────────────────────────────
// Save used to be `outcome === "LOSS" ? -Math.abs(pl) : Math.abs(pl)`, so the box could never hold
// anything the outcome disagreed with and "edit it to negative" was impossible by construction.
console.log('\n4. the source no longer derives the sign from the outcome:');
const src = await import('fs').then(fs =>
  fs.readFileSync(new URL('./TradeVault.tsx', import.meta.url), 'utf8'));
check('the save no longer re-signs from the outcome',
      /outcome === "LOSS" \? -Math\.abs\(form\.pl\)/.test(src), false);
check('the box is text, so a partial entry is a legal state',
      /type="text"[\s\S]{0,120}value=\{form\.plText\}/.test(src), true);
// COMMENTS ARE STRIPPED FIRST. The note above the input quotes the old broken line verbatim so the
// next reader knows what this replaced — and a naive source search then finds its own explanation
// and reports the bug as still present. Scan the CODE.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')                 // block comments, JSX {/* … */} included
   .split('\n').filter(l => !/^\s*\/\//.test(l))     // and line comments
   .join('\n');
const code = stripComments(src);
check('...and nothing coerces the input to 0 any more',
      /parseFloat\(e\.target\.value\) \|\| 0/.test(code), false);
check('  teeth — stripping keeps live code and drops the quoted old line',
      [/const val = parseFloat/.test(stripComments('  const val = parseFloat(x) || 0;')),
       /const val = parseFloat/.test(stripComments('  {/* const val = parseFloat(x) || 0; */}'))],
      [true, false]);
check('a half-typed figure cannot be saved at all',
      /disabled=\{isPending \|\| parsedPl === null\}/.test(src), true);
// The copy above must stay in step with the real one.
check('this test mirrors the real plValue',
      /if \(!\/\^-\?\\d\+\(\\\.\\d\+\)\?\$\/\.test\(s\)\) return null;/.test(src), true);

// ── 5. AND A WAY BACK FROM A WRONG CORRECTION ──────────────────────────────
// Every field he corrects is pinned so the sync stops undoing it — which froze this zero in place
// for ever. `releaseLock` clears the pins so the next sync re-derives from the broker.
console.log('\n5. a hand edit can be undone:');
const routes = await import('fs').then(fs => fs.readFileSync('server/routes.ts', 'utf8'));
check('the endpoint accepts a release instruction',
      /releaseLock === true/.test(routes), true);
check('...and it is stripped from the update, never written as a column',
      /releaseLock: _release, \.\.\.rest/.test(routes), true);
check('...and it clears the whole lock list',
      /delete mf\[EDIT_LOCK_KEY\]/.test(routes), true);
check('the vault offers it, but only on a trade the broker put there',
      /synced && onRelease/.test(src), true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
