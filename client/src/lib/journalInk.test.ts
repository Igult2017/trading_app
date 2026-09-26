/**
 * journalInk.test.ts — run with:
 *     npx tsx client/src/lib/journalInk.test.ts
 *
 * THE FIVE DARK THEMES MUST RENDER BYTE-IDENTICALLY, and this is what makes that a fact rather than a
 * hope.
 *
 * His white theme was unreadable and his dark themes were not — so a fix that repaints the dark themes
 * to reach the white one has traded a complaint for a worse complaint. The mechanism chosen avoids that
 * by CONSTRUCTION rather than by inspection:
 *
 *     color: 'var(--jr-up, #34d399)'
 *
 * `--jr-up` is defined only on `.journal-light`. In a dark theme the custom property does not exist, so
 * CSS falls through to the second argument — the literal that was always there. Nothing about the dark
 * rendering can change unless someone defines a dark value, and test 1 below is the thing that notices
 * if they ever do.
 *
 * That property is also what lets many different dark greens share one light `--jr-up`: the dark themes
 * keep every shade they had, and only the white theme collapses to the small measured palette that the
 * eco-friendly marketplace's approach is built on.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { LIGHT_INK, LIGHT_BRAND, inkVars, brandVar } from './journalInk';

let failed = 0, count = 0;

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

// ── colour maths, independent of the audit script so a bug there cannot hide one here ──
const rgb = (h: string): [number, number, number] => {
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
};
const lum = (c: [number, number, number]) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const l1 = lum(rgb(a)), l2 = lum(rgb(b));
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};
/** `fg` at `alpha` laid over `bg`. */
const over = (fg: string, alpha: number, bg: string): string => {
  const f = rgb(fg), b = rgb(bg);
  return '#' + [0, 1, 2].map((i) =>
    Math.round(alpha * f[i] + (1 - alpha) * b[i]).toString(16).padStart(2, '0')).join('');
};

console.log();
console.log('JOURNAL INK — the white theme reads, and the dark themes cannot have moved');

const WHITE = '#FFFFFF', CANVAS = '#FFFEFB';

// ── 1. THE ONE THING THAT KEEPS THE DARK THEMES SAFE ───────────────────────
console.log('\n1. a dark theme is given no tokens at all:');
check('inkVars(dark) is empty', inkVars(true, '#141310', '#5C5646'), {});
check('...so a var() fallback is the only value left, which is the literal that was always there',
      Object.keys(inkVars(true, '#141310', '#5C5646')).length, 0);
const light = inkVars(false, '#141310', '#5C5646');
check('the light theme defines every token', Object.keys(light).length > 10, true);
check('...including the theme\'s own two, so a panel can reach them from an inline style',
      [light['--jr-ink-text'], light['--jr-ink-mute']], ['#141310', '#5C5646']);
teeth('a dark theme that started defining tokens would be caught here',
      Object.keys(inkVars(true, '#141310', '#5C5646')).length === 0);

// AND NO TOKEN MAY BE DEFINED OUTSIDE `.journal-light`. The whole safety argument is that the five dark
// themes cannot see these, so a `--jr-up:` anywhere that is not light-scoped would silently undo it.
console.log('\n2. no --jr ink token is defined outside the light theme:');
const journal = readFileSync(join(process.cwd(), 'client/src/pages/Journal.tsx'), 'utf8');
const INK_TOKENS = ['--jr-up', '--jr-down', '--jr-warn', '--jr-info', '--jr-alt', '--jr-pink',
                    '--jr-teal', '--jr-ink-faint', '--jr-on-fill'];
for (const t of INK_TOKENS) {
  // A definition is `'--jr-up':` or `--jr-up:`; a USE is `var(--jr-up`. Only definitions matter.
  const defs = [...journal.matchAll(new RegExp(String.raw`\[?'?${t}'?\s*(?:as any\])?\s*:`, 'g'))];
  check(`${t} is not defined in Journal.tsx (it comes from inkVars, light only)`, defs.length, 0);
}

// ── 3. EVERY LIGHT VALUE CLEARS AA, ON BOTH GROUNDS ────────────────────────
console.log('\n3. the light palette measures:');
for (const [role, value] of Object.entries(LIGHT_INK)) {
  const onSurface = ratio(value, WHITE), onCanvas = ratio(value, CANVAS);
  check(`${role} ${value} clears 4.5:1 on the surface and the canvas`,
        [onSurface >= 4.5, onCanvas >= 4.5], [true, true]);
}
// AND ON ITS OWN TINTED CHIP, which is where a status colour actually sits. A 20% wash of the dark
// value over white is the pale ground the badges become in the light theme — the same pairing the
// eco-friendly marketplace uses (#D1F0E0 behind #2D7A5F).
console.log('\n4. a status ink on its own 20% wash, which is where badges put it:');
const WASH: Array<[keyof typeof LIGHT_INK, string]> = [
  ['up', '#10b981'], ['down', '#ef4444'], ['warn', '#f59e0b'],
  ['info', '#3b82f6'], ['alt', '#8b5cf6'], ['pink', '#ec4899'], ['teal', '#22d3ee'],
];
for (const [role, washSource] of WASH) {
  const ground = over(washSource, 0.2, WHITE);
  check(`${role} on a 20% ${washSource} wash (${ground})`, ratio(LIGHT_INK[role], ground) >= 4.5, true);
}

// ── 5. BRAND MARKS TAKE TEXT'S BAR, NOT A GRAPHIC'S ────────────────────────
//
// A logo on its own would be a graphic at 3:1. These are not: `PLATFORM_ICON_META` in AccountsPage
// gives each platform a `color` AND a `letters` fallback — 'BN', 'CT', 'MT5' — so when the icon is
// absent the same value paints a two-letter text mark. That is text, so 4.5:1 is the bar, and it is
// what caught cTrader's #F05A22: at 3.39:1 it clears a graphic's bar and fails a letter-mark's, which
// is exactly the "one colour doing two jobs" trap docs/READABILITY.md records about the footer.
console.log('\n5. every brand mark goes from failing to passing at TEXT contrast:');
for (const [dark, lightHex] of Object.entries(LIGHT_BRAND)) {
  const was = ratio(dark, WHITE), now = ratio(lightHex, WHITE);
  check(`${dark} ${was}:1 -> ${lightHex} ${now}:1`, [was < 4.5, now >= 4.5], [true, true]);
  check(`...and it has a token`, light[brandVar(dark)], lightHex);
}
// COINBASE IS DELIBERATELY ABSENT. It already reads at 5.75:1 on white, and changing a colour that
// works is how a fix acquires a regression.
check('Coinbase #0052FF is left alone because it already passes',
      [ratio('#0052FF', WHITE) >= 4.5, '#0052FF' in LIGHT_BRAND], [true, false]);

// ── 6. NO RAW FAILING LITERAL IS LEFT IN A JOURNAL SURFACE ─────────────────
//
// The audit script measures this properly, with the fill-behind-the-text and comment handling that
// needs. This is the blunt version, so a `git commit` without running the audit still trips: any
// `color:` in a journal panel whose value is a bare light-grey or white literal.
console.log('\n6. no bare near-white ink is left in an inline style:');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!/node_modules|\/ui$/.test(p)) walk(p, out); }
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}
// Files the audit treats as self-grounded paint their own dark ground and are exempt for the reasons
// recorded in scripts/contrast-audit.mjs.
const EXEMPT = /TradingChart|AdminPanel|TradeSyncPage|journalInk/;
const NEAR_WHITE = /(?<![-\w])color\s*:\s*["'`](#(?:f{3,6}|[ef][0-9a-f]{5})|white)["'`]/gi;
const offenders: string[] = [];
for (const f of walk(join(process.cwd(), 'client/src'))) {
  if (EXEMPT.test(f)) continue;
  const src = readFileSync(f, 'utf8');
  if (!/journal-root|journal-light|JournalHeader|jr-ink/.test(src)) continue;   // journal surfaces only
  for (const m of src.matchAll(NEAR_WHITE)) {
    const line = src.slice(0, m.index).split('\n').length;
    // On a declared fill in the same object, white is correct in every theme.
    const ctx = src.split('\n')[line - 1];
    if (/background/.test(ctx)) continue;
    offenders.push(`${f.split('client/src/')[1]}:${line}`);
  }
}
check('none', offenders, []);

console.log();
if (failed) { console.log(`${failed} of ${count} FAILED`); process.exit(1); }
console.log(`ALL PASS (${count} checks)`);
