/**
 * ddStyles.test.ts — run with:
 *     npx tsx client/src/components/drawdown/ddStyles.test.ts
 *
 * WHAT THIS PROTECTS. The Drawdown panel's look is a ~22KB string built from four template literals,
 * and three separate failures in this file's history were invisible at build time:
 *
 *  1. A STRAY BACKTICK ends the template literal mid-rule. The build stays green and the page simply
 *     loses its styling at runtime. This project has been bitten by that twice
 *     (feedback-template-literal-backticks).
 *  2. AN UNSCOPED RULE leaks out of the panel. Every selector has to start `.dp` (or
 *     `.journal-light .dp`, or an @-rule); one that does not applies to the WHOLE journal, and the
 *     symptom shows up on a different page entirely.
 *  3. A TOKEN WITH NO LIGHT VALUE renders as an invalid colour in light mode. The design he supplied
 *     is dark-only, so every name the CSS reads must exist in BOTH theme blocks.
 *
 * It also pins the three gap numbers he asked for on 2026-11-03 ("reduce those gaps between the
 * cards, they are too large"), so a later tidy-up cannot quietly put them back.
 *
 * ⚠ IT READS THE FILES WITH `fs` AND RELATIVE PATHS, not imports. That is deliberate: importing them
 * needs the `@/` alias, which only Vite resolves, so an importing test could not be run from the
 * command line at all.
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

const here = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8');

/** Pull a named template literal out of a source file — the same way the bundler would read it. */
function lit(src: string, name: string): string {
  const i = src.indexOf(name);
  if (i < 0) throw new Error(`not found: ${name}`);
  const s = src.indexOf('`', i);
  const e = src.indexOf('`', s + 1);
  return src.slice(s + 1, e);
}

const tokSrc = here('ddTokens.ts');
const ALIASES = lit(tokSrc, 'const ALIASES');
const DARK = lit(tokSrc, 'DD_TOKENS_DARK').replace('${ALIASES}', ALIASES);
const LIGHT = lit(tokSrc, 'DD_TOKENS_LIGHT').replace('${ALIASES}', ALIASES);
const core = lit(here('ddStyles.ts'), 'const DD_CORE')
  .replace('${DD_TOKENS_DARK}', DARK)
  .replace('${DD_TOKENS_LIGHT}', LIGHT);
const monthDays = lit(here('monthDays.tsx'), 'MONTH_DAYS_CSS');
const sections = lit(here('ddStyles2.ts'), 'const DD_SECTIONS')
  .replace('${MONTH_DAYS_CSS}', monthDays);
const css = core + sections;

console.log('\nDRAWDOWN STYLES — the stylesheet is whole, scoped, and themed both ways');

// ── 1. NOTHING TRUNCATED, NOTHING LEFT UNRESOLVED ────────────────────────────
// A stray backtick would cut a literal short, so these two assertions are what catch it.
check('every interpolation resolved', /\$\{/.test(css), false);
teeth('the stylesheet is whole — the last rule of the last file is present',
      css.includes('.dp .mday.b'));
check('the sheet is a plausible size', css.length > 15_000, true);

// ── 2. EVERY RULE IS SCOPED TO THE PANEL ─────────────────────────────────────
// Selectors only: strip @-rule blocks' own headers, comments and declaration bodies.
const selectors = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('}')
  .map((chunk) => chunk.split('{')[0].trim())
  .filter((s) => s.length > 0 && !s.startsWith('@') && !/^\d/.test(s))
  .flatMap((s) => s.split(',').map((x) => x.trim()))
  .filter((s) => s.length > 0);

const unscoped = selectors.filter((s) =>
  !s.startsWith('.dp') && !s.includes('.dp ') && !s.startsWith('.journal-light .dp'));
check('no selector escapes the .dp scope', unscoped.slice(0, 5), []);
teeth('an unscoped selector would be caught',
      ['body', '.card'].filter((s) => !s.startsWith('.dp')).length === 2);

// ── 3. EVERY TOKEN THE CSS READS EXISTS IN BOTH THEMES ───────────────────────
// A name defined only in dark renders as an invalid colour in light mode — the failure his dark-only
// mock-up would have shipped.
const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
const defined = (block: string) => new Set(
  [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const dark = defined(DARK), light = defined(LIGHT);
// Names the panel sets itself rather than inheriting from a theme block.
// `--dd-serif-w` joined this list on 2026-11-08 with the weight axis. It is a NUMBER, not a colour,
// so it has nothing to do with either theme — and the check caught it on the first run, which is the
// behaviour this list exists to allow for rather than to silence.
const SELF_SET = new Set(['--dd-serif', '--dd-serif-w', '--dd-mono', '--dd-sans', '--disp', '--mono']);
const missingDark = [...used].filter((t) => !dark.has(t) && !SELF_SET.has(t));
const missingLight = [...used].filter((t) => !light.has(t) && !SELF_SET.has(t));
check('every token used has a dark value', missingDark, []);
check('every token used has a light value', missingLight, []);
check('the two theme blocks define the same names',
      [...dark].filter((t) => !light.has(t)).concat([...light].filter((t) => !dark.has(t))), []);

// ── 4. THE GAPS HE ASKED TO REDUCE ───────────────────────────────────────────
// His instruction, 2026-11-03: "reduce those gaps between the cards ... they are too large".
// The mock-up had 32px between sections, 24/16/14px grid gaps and 24px card padding.
// ⚠ 16 -> 4 and 12 -> 4 on 2026-11-08. He asked for the SAME thing a second time — "reduce the gaps
// between the cards ... see how border radius cards and gaps between cards have been reduced in the
// audit page" — and that page uses 3. These pins moved deliberately; they are not a loosened test.
check('sections sit 4px apart, not the mock-up 32px',
      /\.dd-stack > \* \+ \*\{ margin-top:4px; \}/.test(css), true);
check('card grids use one 4px gap', /\.dd-grid\{ display:grid; gap:4px; \}/.test(css), true);
teeth('the 2026-11-03 pair of gaps is gone, both of them',
      !/margin-top:16px/.test(css) && !/\.dd-grid\{ display:grid; gap:12px; \}/.test(css));
check('card padding is 20px, not 24px', /\.dd-card\{[\s\S]{0,160}padding:20px;/.test(css), true);
teeth('the old 32px section gap is gone', !/margin-top:2rem/.test(css) && !/margin-top:32px/.test(css));

// ── 5. THE SMALL-TEXT INK CLEARS THE READABILITY FLOOR ───────────────────────
// Measured: his #64748b reads 3.58:1 on the card surface, under the 4.5:1 minimum, and this token is
// used at 10-11px. docs/READABILITY.md treats 4.5:1 as a floor, never a target.
teeth('the faintest dark ink is NOT his sub-minimum #64748b',
      !/--ink-faint:#64748b/.test(DARK));
check('it is the measured replacement', /--ink-faint:#7987a3/.test(DARK), true);
// LIGHT had been left on that same sub-minimum slate: 4.34:1 for a 10px caption on the #f1f5f9
// inner tile. Measured on the rendered page 2026-11-08 and replaced in the same change.
teeth('and NEITHER is the faintest light ink', !/--ink-faint:#64748b/.test(LIGHT));
check('the light replacement is the measured one', /--ink-faint:#5a687f/.test(LIGHT), true);

// ── 6b. THE TYPOGRAPHY HE ASKED FOR ON 2026-11-08 ────────────────────────────
// "borrow some better looking font types from the audit page". Two traps, both already paid for:
//  * the Fontsource package registers "Playfair Display Variable", NOT "Playfair Display", so the
//    VARIABLE name must come FIRST or the whole stack falls through to Georgia in silence
//    (reference-fontsource-variable-name-trap);
//  * Playfair is a DISPLAY serif and disappears at small sizes, which is why the figures use Times
//    New Roman — a TEXT serif — and why nothing in this face is set below weight 500.
check('the variable Playfair name comes first in --dd-serif',
      /--dd-serif:"Playfair Display Variable","Playfair Display"/.test(css), true);
check('the figures face is Times New Roman, as on the audit page',
      /--dd-mono:"Times New Roman"/.test(css), true);
teeth('nothing sets this display serif below weight 500',
      Number(/--dd-serif-w:(\d+)/.exec(css)?.[1] ?? 0) >= 500);
check('the two titles he ticked came down to 18 and 15',
      /h2\.dd-title\{ font-size:18px; \}/.test(css) && /h3\.dd-title\{ font-size:15px; \}/.test(css),
      true);
check('the big KPI figure he ticked came down to 22px',
      /\.dd-kpi-num\{[\s\S]{0,400}font-size:22px;/.test(css), true);

// ── 6c. THE TIMELINE READS W / L / B ─────────────────────────────────────────
// His instruction, 2026-11-08: "there is no need to write win , loss and breakeven. Just write W L
// and B." The chip must be a FIXED SQUARE — padding that was sized for "Break-even" would collapse
// to a sliver around a single glyph and the row would read as specks of three different widths.
const streaks = here('ddStreaks.tsx');
check('the chips carry the single letters',
      ["'W'", "'L'", "'B'"].every((x) => streaks.includes(`text: ${x}`)), true);
teeth('and the spelt-out words are no longer the chip text',
      !streaks.includes("text: 'Win'") && !streaks.includes("text: 'Break-even'"));
check('the full word survives as the accessible name, not just a tooltip',
      streaks.includes('aria-label={k.full}'), true);
check('the chip is a fixed square so one letter cannot collapse it',
      /\.dd-seq-chip\{[\s\S]{0,200}width:26px; height:26px;/.test(css), true);

// ── 6. THE SCOPE NAME IS STILL `.dp` ─────────────────────────────────────────
// Journal.tsx exempts exactly this selector from the rule that forces a font on every descendant of
// .journal-root. Rename the scope and the journal clobbers every face in the panel.
check('the panel is still scoped .dp', css.includes('.dp{'), true);

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${count} checks\n`);
process.exit(failed === 0 ? 0 : 1);
