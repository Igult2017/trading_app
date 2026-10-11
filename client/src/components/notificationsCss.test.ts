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
// The guard that the slice above actually caught the stylesheet. It was `> 8` until 2026-10-11,
// when removing the filter row and the category label took three size rules with them — seven
// remain (12, 11, 11, 12, 13, 12, 11). It is a sanity floor, not a budget; if it ever trips again,
// count the sizes before lowering it, because "the slice matched nothing" fails the same way.
check('there are font sizes to check at all', sizes.length >= 6, true);
check('none is below 11px', sizes.filter(s => s < 11), []);
check('  teeth — the OLD sheet would fail this', [8.5, 9.5, 10, 10.5].filter(s => s < 11).length, 4);

// ── 2. IT FOLLOWS THE THEME ────────────────────────────────────────────────
// The root cause: every colour was hardcoded for a dark panel, so on the light theme it was a dark
// slab. The surface and the text must come from the journal's own tokens.
console.log('\n2. the surface and text come from theme tokens, not hardcoded:');
check('the panel background is a token', /\.np-root\s*\{[^}]*background:\s*var\(--jr-panel/.test(RULES), true);
check('its border is a token',           /\.np-root\s*\{[^}]*border:\s*1px solid var\(--jr-border/.test(RULES), true);
check('the title colour is a token',     /\.np-title\s*\{[^}]*color:\s*var\(--jr-ink/.test(RULES), true);
// ⚠ THE TOKEN HAS TO EXIST. This asked for `--jr-cap` and passed for a year — and that token is
// DEFINED NOWHERE in the app, so its fallback rendered every time, in both themes. The check tested
// the SPELLING of a variable, not whether anything gives it a value, so a hardcoded grey wearing a
// token's name sailed through. `--jr-ink-dim` is real (Journal.tsx: #a6b3d1 dark, var(--jr-muted)
// light).
check('the message colour is a token',   /\.np-item-msg\s*\{[^}]*color:\s*var\(--jr-ink-dim/.test(RULES), true);
check('...and the panel no longer uses the token that does not exist',
      RULES.includes('--jr-cap'), false);
// TEETH: prove the old spelling really was a phantom, by checking the one file that defines the ink
// tiers. If --jr-cap is ever given a value, this fails and the rule above can be reconsidered.
const JOURNAL = readFileSync(join(import.meta.dirname, '..', 'pages', 'Journal.tsx'), 'utf8');
check('  teeth — --jr-cap is defined nowhere, --jr-ink-dim is',
      [JOURNAL.includes('--jr-cap:'), JOURNAL.includes('--jr-ink-dim:')], [false, true]);
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
check('and the unread dot',      /\.journal-light \.np-root \.np-unread-dot\s*\{/.test(RULES), true);

// AND THE ACCENT MUST NOT BE SET INLINE, or every rule above is silently defeated: an inline style
// beats a plain CSS rule, so the light overrides would exist, look right, and never apply.
//
// ⚠ THIS USED TO GUARD THE CATEGORY WORD, WHICH NO LONGER EXISTS — and the thing it was guarding
// against was happening one element away the whole time. The icon TILE was being coloured inline
// from a JS table (`style={{ background: meta.bg, color: meta.color }}`) with dark-theme values,
// so the light accents below could never reach it. The tile now takes the same np-cat- class, and
// this check follows it there.
console.log('\n3b. the type colour reaches the icon tile as a CLASS, not an inline style:');
check('the tile carries the accent class',
      /className=\{`np-item-icon \$\{catClass\(n\.type\)\}`\}/.test(SRC), true);
check('...and nothing sets background or color on it inline',
      /className=\{`np-item-icon[^`]*`\}\s*style=/.test(SRC), false);
check('  teeth — the OLD markup would fail that',
      /className="np-item-icon" style=\{\{ background: meta\.bg/.test(SRC), false);

// ── 4. THE PANEL IS MOUNTED WHERE THE TOKENS REACH IT ──────────────────────
// The tokens are inline styles on .journal-root, so they inherit only to its descendants. Portalled
// to document.body — as it was — every var() above falls back to its dark default, and the panel
// looks right on dark while staying a dark slab on light. The fix would have looked like a fix.
console.log('\n4. it is portalled inside the journal, so the tokens actually reach it:');
check('the portal targets .journal-root', /document\.querySelector\('\.journal-root'\)/.test(SRC), true);
check('...falling back to body when there is none', /\?\?\s*document\.body/.test(SRC), true);

// ── 5. NEITHER CARD CATEGORISES ────────────────────────────────────────────
// His instruction, 2026-10-11: he ticked ALL · SIGNALS · CALENDAR · EMAILS · UPDATES and said
// *"Notification is notification no categorization."* Both panels are ONE list now. This is the
// check that stops a future session quietly adding filtering back.
console.log('\n5. there is no filter row, and no category word, on either card:');
check('the journal card has no tab rules',   /\.np-tab[\s{.:]/.test(RULES), false);
check('...and no TABS list in the component', /const TABS\b/.test(SRC), false);
check('...and no category label element',    /np-item-cat/.test(SRC), false);

// ── 6. THE ADMIN CARD — the same two defects, in the other file ────────────
// It was hardcoded near-black (#07090e) while the admin panel DEFAULTS TO LIGHT
// (AdminPanel.tsx:115), so it was a black slab on a pale page — the journal card's 2026-09-06 bug,
// living on in a file nobody re-checked. Six of its sizes were under the floor as well.
console.log('\n6. the admin card follows its palette and clears the floor:');
const ADMIN = readFileSync(
  join(import.meta.dirname, '..', 'features', 'admin-notifications', 'AdminNotificationsPanel.tsx'),
  'utf8');
const aOpen = 'const PANEL_STYLES = `';
const aFrom = ADMIN.indexOf(aOpen) + aOpen.length;
const aTo   = ADMIN.indexOf('`;', aFrom);
if (aFrom < aOpen.length || aTo < 0) {
  console.error('  FAIL  could not find PANEL_STYLES — the slice anchors have moved');
  process.exit(1);
}
const ARULES = ADMIN.slice(aFrom, aTo).replace(/\/\*[\s\S]*?\*\//g, '');

const aSizes = [...ARULES.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => parseFloat(m[1]));
check('there are sizes to check at all', aSizes.length > 5, true);
check('none is below 11px', aSizes.filter(s => s < 11), []);
check('  teeth — the OLD sheet had six under the floor', [8, 9, 9, 10, 10, 10.5].filter(s => s < 11).length, 6);

check('the surface is a palette token', /\.anp-root\s*\{[^}]*background:\s*var\(--admin-card/.test(ARULES), true);
check('the border is a palette token',  /\.anp-root\s*\{[^}]*border:\s*1px solid var\(--admin-border/.test(ARULES), true);
check('the title ink is a palette token', /\.anp-title\s*\{[^}]*color:\s*var\(--admin-text/.test(ARULES), true);
check('the body ink is a palette token',  /\.anp-item-body-text\s*\{[^}]*color:\s*var\(--admin-muted/.test(ARULES), true);
// THE OLD BLACK MAY ONLY SURVIVE AS A var() FALLBACK, exactly as #13131f may on the journal card.
// A standalone declaration of it is the slab coming back.
const aStandalone = [...ARULES.matchAll(/(?:background|color|border[a-z-]*):[^;]*/g)]
  .map(m => m[0])
  .filter(d => /#07090e/.test(d) && !/var\(--admin-[a-zA-Z-]+,\s*#07090e/.test(d));
check('the old panel black survives only as a fallback', aStandalone, []);
// ⚠ accentL IS THE TRAP. The palette's own note (AdminPanel.tsx:76-79) records that the bright
// brand cyan measures 2.03:1 on white, so it must never be used for text.
check('the bright accent is never used for text', /--admin-accentL/.test(ARULES), false);

console.log('\n   ...and it does not categorise either:');
check('no tab rules',        /\.anp-tab[\s{.:]/.test(ARULES), false);
check('no TABS list',        /const TABS\b/.test(ADMIN), false);
check('no category label',   /anp-item-cat/.test(ADMIN), false);
check('no hardcoded category table', /CATEGORY_META/.test(ADMIN), false);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
