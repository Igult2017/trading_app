/**
 * notificationsCss.test.ts — run with:
 *     npx tsx client/src/components/notificationsCss.test.ts
 *
 * THE NOTIFICATION PANEL MUST STAY READABLE, IN BOTH THEMES.
 *
 * His report, 2026-09-06: *"Can you fix this notification inbox for me. Make it look better and also
 * to be useful to users."* His screenshot showed it open on the LIGHT theme as a dark slab on a
 * white page, with text down to 8.5px.
 *
 * TWO DEFECTS, and both are the kind that come back. Every colour was hardcoded dark, so the panel
 * ignored the theme entirely; and almost every size was under the 11px floor that
 * docs/READABILITY.md records and that was removed everywhere else in the journal. Rendered and
 * measured afterwards, the light theme came out at 5.02:1 worst contrast and the dark at 7.03:1,
 * with nothing under 11px.
 *
 * THIS READS THE SOURCE AS TEXT rather than importing the component, for the same reason the
 * autoJournal suites do: the thing being protected is the stylesheet, and importing the component
 * would drag in React, lucide and react-query to check a string.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

let pass = 0, fail = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

const SRC = readFileSync(
  join(import.meta.dirname, 'Notifications.tsx'), 'utf8');

// The stylesheet, and ONLY it.
//
// THE SLICE IS ANCHORED ON THE BACKTICK, NOT ON WHAT FOLLOWS IT. My first version ended the slice
// at "`;\n\ntype TabKey" — which never matched, because this file is checked out with Windows line
// endings (\r\n). `indexOf` returned -1, `slice` read to the end of the file, and every check below
// was silently scanning the whole component instead of the stylesheet. It still passed, which is
// worse: a test that measures the wrong thing and agrees with you.
const OPEN = 'const PANEL_CSS = `';
const from = SRC.indexOf(OPEN) + OPEN.length;
const to   = SRC.indexOf('`;', from);
if (from < OPEN.length || to < 0) {
  console.error('  FAIL  could not find the PANEL_CSS template — the slice anchors have moved');
  process.exit(1);
}
const CSS = SRC.slice(from, to);

/** CSS with its comments stripped, so a size quoted in a note is not read as a rule. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\nTHE NOTIFICATION PANEL STAYS READABLE\n');

// ── 1. THE 11px FLOOR ──────────────────────────────────────────────────────
// The defect he could see. 8.5px on a white ground is not dim, it is gone.
console.log('1. nothing is under the 11px floor:');
const sizes = [...RULES.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => parseFloat(m[1]));
check('there are font sizes to check at all', sizes.length > 8, true);
check('none is below 11px', sizes.filter(s => s < 11), []);
check('  teeth — the OLD sheet would fail this', [8.5, 9.5, 10, 10.5].filter(s => s < 11).length, 4);

// ── 2. IT FOLLOWS THE THEME ────────────────────────────────────────────────
// The root cause: every colour was hardcoded for a dark panel, so on the light theme it was a dark
// slab. The surface and the text must come from the journal's own tokens.
console.log('\n2. the surface and text come from theme tokens, not hardcoded:');
check('the panel background is a token', /\.np-root\s*\{[^}]*background:\s*var\(--jr-panel/.test(RULES), true);
check('its border is a token',           /\.np-root\s*\{[^}]*border:\s*1px solid var\(--jr-border/.test(RULES), true);
check('the title colour is a token',     /\.np-title\s*\{[^}]*color:\s*var\(--jr-ink/.test(RULES), true);
check('the message colour is a token',   /\.np-item-msg\s*\{[^}]*color:\s*var\(--jr-cap/.test(RULES), true);
// THE OLD DARK VALUE MAY ONLY SURVIVE AS A FALLBACK. `var(--jr-panel, #13131f)` is correct — the
// fallback is what renders if the panel is ever mounted where the token does not reach. What must
// never come back is that colour as a STANDALONE declaration, which is what made it a dark slab on
// his light page. (My first version of this check just searched for the string and failed on the
// legitimate fallback — the assertion was wrong, not the code.)
const standalone = [...RULES.matchAll(/(?:background|color|border[a-z-]*):[^;]*/g)]
  .map(m => m[0])
  .filter(d => /#13131f/.test(d) && !/var\(--jr-[a-z-]+,\s*#13131f/.test(d));
check('the old panel colour survives only as a var() fallback', standalone, []);

// ── 3. THE LIGHT THEME HAS ITS OWN ACCENTS ─────────────────────────────────
// MEASURED, and this is why they exist: the category accents were chosen for a dark panel and came
// back at 1.92:1 and 2.15:1 against white, against a 4.5:1 minimum.
console.log('\n3. every accent has a light-theme value that clears AA:');
for (const type of ['trading_signal', 'economic_event', 'trading_session', 'email', 'update', 'default'])
  check(`${type} is darkened on light`,
        new RegExp(`\\.journal-light \\.np-root \\.np-cat-${type}\\s*\\{`).test(RULES), true);
check('the money is too — up',   /\.journal-light \.np-root \.np-pl-up\s*\{/.test(RULES), true);
check('...and down',             /\.journal-light \.np-root \.np-pl-down\s*\{/.test(RULES), true);
check('and the active tab, which measured 3.75:1 on dark',
      /\.journal-light \.np-root \.np-tab\.active\s*\{/.test(RULES), true);

// AND THE ACCENT MUST NOT BE SET INLINE, or every rule above is silently defeated: an inline style
// beats a plain CSS rule, so the light overrides would exist, look right, and never apply.
check('the category colour is NOT set inline on the element',
      /className=\{`np-item-cat np-cat-\$\{[^}]*\}`\}\s*\n?\s*style=\{\{\s*color/.test(SRC), false);

// ── 4. THE PANEL IS MOUNTED WHERE THE TOKENS REACH IT ──────────────────────
// The tokens are inline styles on .journal-root, so they inherit only to its descendants. Portalled
// to document.body — as it was — every var() above falls back to its dark default, and the panel
// looks right on dark while staying a dark slab on light. The fix would have looked like a fix.
console.log('\n4. it is portalled inside the journal, so the tokens actually reach it:');
check('the portal targets .journal-root', /document\.querySelector\('\.journal-root'\)/.test(SRC), true);
check('...falling back to body when there is none', /\?\?\s*document\.body/.test(SRC), true);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
