/**
 * WCAG contrast auditor for the Journal LIGHT theme — static, no browser, no database.
 *
 * ══ WHY THE LIGHT THEME BREAKS, MEASURED RATHER THAN ASSUMED ════════════════════════════════════
 *
 * The light theme was a 283-rule override sheet in `Journal.tsx` matching literal hex strings inside
 * inline styles — `.journal-light [style*="color:#60a5fa"] { color:#1d4ed8 }`. **That half of the
 * sheet never matched anything.** React applies inline styles through the CSSOM, and the CSSOM
 * serialises a colour to `rgb()`. Probed in this container's Chromium, 2026-09-26:
 *
 *     el.style.color = '#0d1117'
 *     el.getAttribute('style')                          -> "color: rgb(13, 17, 23);"
 *     el.matches('[style*="color:#0d1117"]')            -> FALSE
 *     el.matches('[style*="color: #0d1117"]')           -> FALSE
 *     el.matches('[style*="rgb(13, 17, 23)"]')          -> TRUE
 *
 * So every remap keyed on a hex string was dead, for foregrounds AND backgrounds. `Journal.tsx` has
 * recorded the `color` half of this since 2026-08-08 and named the answer — a CSS VARIABLE, resolved
 * per theme at the root, because an inline `var(--jr-ink)` is correct in both themes — and then only
 * two variables were ever introduced. The rest of the app went on hardcoding dark-theme literals.
 *
 * ══ WHAT THIS TOOL DOES, AND THE THREE THINGS THE OLD VERSION GOT WRONG ═════════════════════════
 *
 *   1. IT SEES WHITE `rgba()` TEXT. `color:'rgba(255,255,255,0.35)'` composited on a white ground is
 *      `rgb(255,255,255)` — exactly 1:1, invisible at ANY alpha. A hex-only regex cannot see it and
 *      14 such usages were sitting unreported.
 *   2. IT READS THE FILL BEHIND THE TEXT. White text on `background:'#3b82f6'` is correct and was
 *      being reported as a 1:1 failure. A `color` is now measured against a `background` declared in
 *      the SAME inline-style object where there is one, and against the light canvas otherwise.
 *      Translucent fills are composited down (the readability tool's own old bug — see
 *      docs/READABILITY.md, "if it ever reports exactly 1:1, suspect the tool before the page").
 *   3. ITS TARGET LIST IS DERIVED, NOT TYPED. The hand-maintained array had drifted: it was missing
 *      CreateSession, JournalPaywall, TradingCalendar, Notifications and TradeSyncPage, which between
 *      them held 40 failures. The list is now walked from `Journal.tsx`'s own imports, so a panel
 *      added to the journal cannot be absent from the audit.
 *
 * ══ HOW TO RUN ═════════════════════════════════════════════════════════════════════════════════
 *
 *     node scripts/contrast-audit.mjs            # failures only; exits 1 if any remain
 *     node scripts/contrast-audit.mjs --all      # every pair, including the passes
 *     node scripts/contrast-audit.mjs --tokens   # token coverage per file
 *
 * It reads source, not a rendered page, so it cannot know which pairs truly co-occur. It errs toward
 * reporting: a false positive costs a look, a false negative ships an unreadable label.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const AA = 4.5;          // body text
const AA_GRAPHIC = 3.0;  // icons, large text, and a fill's own edge

// ── colour maths ─────────────────────────────────────────────────────────────
const hex = (h) => {
  let s = h.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (s.length === 4) s = s.slice(0, 3).split('').map((c) => c + c).join('');
  if (s.length === 8) s = s.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

/** Any CSS colour this codebase actually writes -> [r,g,b,a]. */
function parse(css) {
  const s = String(css).trim().toLowerCase();
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'black') return [0, 0, 0, 1];
  if (s === 'transparent') return [0, 0, 0, 0];
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  if (s.startsWith('#')) {
    const rgb = hex(s);
    if (!rgb) return null;
    // An 8-digit hex carries its alpha in the last pair — #4e8cff80 is 50% blue.
    const a = s.replace('#', '').length === 8 ? parseInt(s.slice(-2), 16) / 255 : 1;
    return [...rgb, a];
  }
  return null;
}

/** Lay `fg` (with alpha) over an opaque `bg`. */
const composite = (fg, bg) =>
  [0, 1, 2].map((i) => Math.round(fg[3] * fg[i] + (1 - fg[3]) * bg[i]));

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contrast of a possibly-translucent foreground over an opaque ground. */
export function ratio(fg, bg) {
  const f = typeof fg === 'string' ? parse(fg) : fg;
  const b = typeof bg === 'string' ? parse(bg) : bg;
  if (!f || !b) return null;
  const ink = f[3] === 1 ? f.slice(0, 3) : composite(f, b.slice(0, 3));
  const l1 = lum(ink), l2 = lum(b.slice(0, 3));
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
}

// ── the light theme, read from the app so this cannot drift ───────────────────
export function lightTheme() {
  const src = readFileSync(join(ROOT, 'client/src/hooks/useJournalSettings.ts'), 'utf8');
  const block = src.slice(src.indexOf('light: {'), src.indexOf('};', src.indexOf('light: {')));
  const grab = (k) => (block.match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1];
  return { bg: grab('bg'), surface: grab('surface'), text: grab('text'),
           textMuted: grab('textMuted'), border: grab('border') };
}

/**
 * SELF-GROUNDED SUBTREES — a panel that paints its own opaque dark ground and is exempt from the
 * journal's theming. Light text on it is CORRECT, and measuring it against the journal's white
 * canvas is the false positive this list exists to remove. Each entry is a judgement, so each says
 * why; nothing is inferred, because inferring it wrong hides real failures.
 */
export const SELF_GROUNDED = {
  'client/src/lib/journalInk.ts':
    'It DEFINES the light palette. Its header tabulates the dark literals it replaces and their '
    + 'measured light values, so reading those as ink on white measures the documentation.',
  'client/src/components/TradingChart.tsx':
    'It paints its own opaque #080c10 on the chart wrapper (L895) and in the lightweight-charts layout '
    + '(L478), and takes no theme prop. A price chart is a dark instrument panel in both themes by '
    + 'design, so its 106 series and overlay colours are correct on their own ground.',
  'client/src/pages/AdminPanel.tsx':
    'It has its own palette (--admin-*, five themes with their own status colours) and its own white '
    + 'theme was measured to zero failures on 2026-09-10 — 482 elements, 113 failures fixed. It is '
    + 'reachable from this import graph but never renders on the journal canvas.',
  'client/src/pages/TradeSyncPage.tsx':
    '.ts-page sets its own --ink:#090C15 ground and Journal.tsx exempts .ts-page from theming; its '
    + '--text:#EEF0F7 reads 17:1 on it. Only the .ts-wizard-root subtree is lightened, and that is '
    + 'done with variables already.',
};

// ── which files the journal can actually render ───────────────────────────────
/** Every `@/…` import of a file, resolved to a path under client/src. */
function importsOf(rel) {
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { return []; }
  const out = new Set();
  // BOTH QUOTE STYLES. A single-quote-only pattern missed `import { Notifications } from
  // "@/components/Notifications"` — 10 failures in a panel that opens over every journal page.
  for (const m of src.matchAll(/from\s+["'](@\/[^"']+)["']|import\(\s*["'](@\/[^"']+)["']\s*\)/g)) {
    const spec = (m[1] ?? m[2]).replace('@/', 'client/src/');
    for (const ext of ['.tsx', '.ts']) {
      try { readFileSync(join(ROOT, spec + ext), 'utf8'); out.add(spec + ext); break; } catch { /* next */ }
    }
  }
  return [...out];
}

/**
 * The journal's own surface set, two levels deep from Journal.tsx.
 *
 * TWO LEVELS, deliberately: one level misses Notifications and CopyManagementDashboard (imported by
 * JournalHeader), which between them hold 20 failures. Deeper pulls in hooks, lib and the whole ui/
 * primitive folder, none of which sets a colour.
 */
export function reachable() {
  const entry = 'client/src/pages/Journal.tsx';
  const set = new Set([entry]);
  for (const a of importsOf(entry)) {
    set.add(a);
    for (const b of importsOf(a)) if (/\/(components|pages|features)\//.test(b)) set.add(b);
  }
  return [...set].filter((f) => !f.includes('/ui/') && !f.includes('/skeletons/')).sort();
}

/**
 * Every foreground a file declares, with the fill behind it where one is declared alongside.
 *
 * THE FILL IS THE POINT. `color:'#fff'` on `background:'#3b82f6'` is correct in every theme; the old
 * audit reported 16 of those as 1:1 failures and they drowned the real ones. The pairing is textual —
 * the nearest `background`/`backgroundColor` within the same `{…}` inline-style object — which is how
 * these are actually written in this codebase.
 */
export function foregrounds(src) {
  const out = [];
  const lines = src.split('\n');
  const branched = themeBranchedLines(src);
  const covered = lightCoveredClasses(src);
  const comments = commentLines(src);
  // A colour value: hex, rgb()/rgba(), or the two keywords.
  const VAL = String.raw`#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|white|black`;
  // `(?<![-\w])` IS LOAD-BEARING. `\bcolor` matches the `color` inside `border-color`, because `-` is a
  // word boundary — so a focus ring at `border-color: rgba(99,102,241,0.6)` was reported as unreadable
  // ink three times over. A border is not text and has its own 3:1 bar against its own neighbours.
  // `background-color`, `outline-color`, `caret-color` and `text-decoration-color` were all caught by
  // the same slip. docs/READABILITY.md: *"if it ever reports exactly 1:1, suspect the tool first."*
  const FG = new RegExp(String.raw`(?<![-\w])(?:color|fill|stroke)\s*:\s*["'\`]?(${VAL})`, 'gi');
  const BG = new RegExp(String.raw`\bbackground(?:-?[Cc]olor)?\s*:\s*["'\`]?(${VAL})`, 'g');
  const GRADIENT = /\bbackground[^,;]*(?:linear|radial)-gradient/;

  lines.forEach((line, i) => {
    // The override sheet is the FIX, not the problem: a remap rule carries both the colour being
    // corrected and the correction, and counting either as ink on white is nonsense.
    if (line.includes('journal-light')) return;
    if (branched.has(i + 1)) return;            // a per-theme palette already answers for it
    // A COMMENT IS NOT A RENDERED COLOUR. This codebase's prose quotes the literals it fixed, so
    // reporting those measures the documentation rather than the page. See commentLines().
    if (comments.has(i + 1)) return;
    // A CSS rule whose own class already has a light override needs nothing from this tool.
    const selector = line.slice(0, line.indexOf('{'));
    if (line.includes('{') && [...selector.matchAll(/\.([A-Za-z][\w-]*)/g)].some((c) => covered.has(c[1]))) return;
    FG.lastIndex = 0;
    let m;
    while ((m = FG.exec(line))) {
      // Already a token — that is the fix, and its light value is measured where it is defined.
      if (/var\(\s*--/.test(line.slice(Math.max(0, m.index - 24), m.index))) continue;
      BG.lastIndex = 0;
      const bgs = [...line.matchAll(BG)].map((x) => x[1]);
      const opaque = bgs.map(parse).filter((c) => c && c[3] === 1).pop() ?? null;
      out.push({
        color: m[1],
        line: i + 1,
        // A gradient fill is opaque and saturated; its exact stops are not worth parsing, and text
        // on one is a deliberate pairing rather than an accident.
        onFill: opaque ? opaque : (GRADIENT.test(line) ? 'gradient' : null),
      });
    }
  });
  return out;
}

/**
 * Line ranges holding a THEME-BRANCHED palette — `darkMode ? {…dark…} : {…light…}`.
 *
 * THIS IS THE PATTERN THE FIX ADOPTS, so its dark half must not be reported as a defect.
 * `SignalPlatformStatus.tsx` already does it properly — one object per theme, light values measured —
 * and a static reader cannot otherwise tell its `text:"#c8d8e8"` (correct, dark branch) from
 * `AccountsPage`'s `color:"#e2e8f0"` (a dark literal with no light answer at all). Ten false
 * positives in a compliant file teach the next reader to ignore the tool.
 *
 * Brace-counted from the `?` to the end of the second branch, so a nested object inside either half
 * is covered. Over-reporting outside such a block is the safe direction and is left alone.
 */
export function themeBranchedLines(src) {
  const skip = new Set();
  const re = /\b(?:darkMode|isDark|dark|T\.dark)\s*\?/g;
  let m;
  while ((m = re.exec(src))) {
    let i = src.indexOf('{', m.index);
    if (i < 0 || i > src.indexOf('\n', src.indexOf(':', m.index)) + 400) continue;
    let depth = 0, end = i, branches = 0;
    for (; end < src.length && branches < 2; end++) {
      const c = src[end];
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { branches++; } }
    }
    const from = src.slice(0, i).split('\n').length;
    const to = src.slice(0, end).split('\n').length;
    if (to - from > 40) continue;            // not a palette object; a big conditional block
    for (let l = from; l <= to; l++) skip.add(l);
  }
  return skip;
}

/**
 * Colours already answered by a CLASS-SCOPED `.journal-light` rule in the same file.
 *
 * THE DISTINCTION THIS DRAWS IS THE WHOLE POINT OF THE REWRITE. Two kinds of override live in this
 * codebase and they do not have the same fate:
 *
 *   `.journal-light [style*="color:#34d399"] { … }`   DEAD — the CSSOM serialises to rgb(), probed
 *   `.journal-light .np-pl-up { color:#047857 }`      WORKS — an ordinary class selector
 *
 * `Notifications.tsx` does the second properly: its accents are set in a `<style>` block precisely so
 * a light override can reach them (*"an inline style beats a plain CSS rule… one place, two themes"*),
 * with the light values measured. Reporting those 12 as failures would teach the next reader that this
 * tool cries wolf, and the fix it was pointing at was already there.
 *
 * Matched on the CLASS TOKEN, not the colour: a light rule naming `.np-cat-email` covers whatever the
 * base `.np-cat-email` rule sets, which is what a stylesheet actually does.
 */
function lightCoveredClasses(src) {
  const covered = new Set();
  for (const line of src.split('\n')) {
    if (!line.includes('journal-light')) continue;
    if (!/\bcolor\s*:/.test(line)) continue;
    for (const m of line.matchAll(/\.([A-Za-z][\w-]*)/g)) {
      if (m[1] !== 'journal-light') covered.add(m[1]);
    }
  }
  return covered;
}

/**
 * Line numbers that are inside a comment.
 *
 * TRACKED, NOT PATTERN-MATCHED. A `^\s*\*` test catches a JSDoc block and misses the shape this
 * codebase actually writes — a `/* … *\/` block whose continuation lines are plain prose with no
 * leading star. Two such lines survived every earlier filter, and both were this codebase explaining
 * the very defect being fixed: JournalForm's account of `color: #e8edf9 !important` flattening its
 * section headings, and Journal.tsx's note that `[style*="color: #fff"]` also matches
 * `background-color: #fff`. Measuring a paragraph about a colour is not measuring the colour.
 *
 * Deliberately naive about strings: a `/*` inside a CSS template literal opens a real CSS comment
 * anyway, so treating it as one is right for this codebase's `<style>` blocks.
 */
function commentLines(src) {
  const out = new Set();
  let inBlock = false;
  src.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (inBlock) out.add(n);
    let j = 0;
    while (j < line.length) {
      if (!inBlock && line.startsWith('//', j)) { out.add(n); break; }
      if (!inBlock && line.startsWith('/*', j)) { inBlock = true; out.add(n); j += 2; continue; }
      if (inBlock && line.startsWith('*/', j)) { inBlock = false; j += 2; continue; }
      j++;
    }
  });
  return out;
}

/** How much of a file already speaks in tokens. */
function tokenUse(src) {
  return (src.match(/var\(\s*--jr-[a-z-]+/g) ?? []).length;
}

// IMPORTABLE. `scripts/ink-codemod.mjs` reads the same target list, the same self-grounded
// exclusions and the same extraction this report uses, so the fix and the measurement can never
// disagree about what counts. Running the report on import would print 200 lines before the caller's
// first statement, so it is guarded.
const IS_MAIN = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('contrast-audit.mjs');
if (IS_MAIN) main();

function main() {
const T = lightTheme();
const args = process.argv.slice(2);
const showAll = args.includes('--all');
const showTokens = args.includes('--tokens');

console.log(`light canvas ${T.bg}   surface ${T.surface}   ink ${T.text}   dim ${T.textMuted}\n`);

let fails = 0, checked = 0, skippedOnFill = 0;
const summary = [];
const tokenRows = [];

for (const rel of reachable()) {
  if (SELF_GROUNDED[rel]) continue;
  let src;
  try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch { continue; }
  tokenRows.push([rel, tokenUse(src), foregrounds(src).length]);

  const bad = [];
  for (const { color, line, onFill } of foregrounds(src)) {
    if (onFill) { skippedOnFill++; continue; }   // measured against its own fill, not the canvas
    for (const [bgName, bg] of [['canvas', T.bg], ['surface', T.surface]]) {
      const r = ratio(color, bg);
      if (r === null) continue;
      checked++;
      if (r < AA) { bad.push({ color, line, bgName, r }); fails++; }
      else if (showAll) bad.push({ color, line, bgName, r, ok: true });
    }
  }
  if (bad.length) {
    summary.push([rel, bad.filter((b) => !b.ok).length]);
    console.log(`── ${rel}`);
    const seen = new Set();
    for (const b of bad.sort((x, y) => x.r - y.r)) {
      const key = b.color + b.bgName;
      if (seen.has(key)) continue;
      seen.add(key);
      const tag = b.r < AA_GRAPHIC ? 'FAIL ' : b.r < AA ? 'weak ' : 'ok   ';
      console.log(`   ${tag} ${b.color.padEnd(22)} on ${b.bgName.padEnd(7)} ${String(b.r).padStart(6)}:1   L${b.line}`);
    }
    console.log('');
  }
}

if (showTokens) {
  console.log('─'.repeat(72));
  console.log('  tokens  raw  file');
  for (const [f, t, raw] of tokenRows.sort((a, b) => b[2] - a[2])) {
    if (t || raw) console.log(`  ${String(t).padStart(6)}  ${String(raw).padStart(3)}  ${f}`);
  }
  console.log('');
}

console.log('─'.repeat(72));
for (const [f, n] of summary.sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`);
for (const [f, why] of Object.entries(SELF_GROUNDED)) console.log(`    -  ${f}  (self-grounded: ${why.split('.')[0]})`);
console.log(`\n${fails} failing foreground/ground pairs (of ${checked} checked)`);
console.log(`${skippedOnFill} foregrounds measured against their own declared fill instead of the canvas`);

// A REPORTING TOOL THAT CANNOT FAIL IS A TOOL NOBODY RUNS TWICE. The light theme reached zero on
// 2026-09-26; a non-zero exit is how it stays there.
process.exitCode = fails ? 1 : 0;
}
