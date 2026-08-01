/**
 * WCAG contrast auditor for the Journal light theme — static, no browser.
 *
 * WHY THIS EXISTS. The light theme is a hand-maintained override sheet in Journal.tsx: 283
 * `.journal-light` rules, 144 of them matching literal hex strings in inline styles. A colour nobody
 * remembered to remap renders dark-on-white or grey-on-grey, which is what "the white theme looks
 * blurred" actually is. Eyeballing cannot find those; the standing rule from the dark-theme pass is
 * measure, never eyeball. The Playwright MCP is also down, so this is the measurement that is
 * actually available.
 *
 * WHAT IT DOES NOT DO. It reads source, not a rendered page, so it cannot know which pairs actually
 * co-occur. It reports every FOREGROUND colour a panel hardcodes against the light canvas/surface —
 * the set a light-theme reader could hit. False positives are possible (a colour only ever used on a
 * dark child); false negatives are not, which is the direction that matters here.
 *
 *   node scripts/contrast-audit.mjs            # failures only
 *   node scripts/contrast-audit.mjs --all      # every pair
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const AA = 4.5;
const AA_LARGE = 3.0;

// The light canvas + card. Read from the theme so this cannot drift from the app.
function lightTheme() {
  const src = readFileSync(join(ROOT, 'client/src/hooks/useJournalSettings.ts'), 'utf8');
  const block = src.slice(src.indexOf('light: {'), src.indexOf('};', src.indexOf('light: {')));
  const grab = (k) => (block.match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1];
  return { bg: grab('bg'), surface: grab('surface'), text: grab('text'), textMuted: grab('textMuted'),
           border: grab('border') };
}

const hex = (h) => {
  let s = h.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (s.length === 8) s = s.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const ratio = (fg, bg) => {
  const a = hex(fg), b = hex(bg);
  if (!a || !b) return null;
  const l1 = lum(a), l2 = lum(b);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
};

// Panels reachable in the Journal light theme. Names match the user's list.
const TARGETS = [
  'client/src/pages/Journal.tsx',
  'client/src/pages/AccountsPage.tsx',
  'client/src/pages/AssetPage.tsx',
  'client/src/components/TradeVault.tsx',
  'client/src/components/TraderAI.tsx',
  'client/src/components/MetricsPanel.tsx',
  'client/src/components/TFMetricsPanel.tsx',
  'client/src/components/StrategyAudit.tsx',
  'client/src/components/Leaderboard.tsx',
  'client/src/components/DrawdownPanel.tsx',
  'client/src/components/TradeSync.tsx',
  'client/src/components/CopyManagementDashboard.tsx',
  'client/src/components/JournalHeader.tsx',
];

/**
 * Foreground colours a file hardcodes: `color: "#xxx"` / `color:#xxx` / fill/stroke.
 *
 * SKIPS the light-theme override sheet itself. Those lines are the FIX, not the problem: a rule
 * like `.journal-light [style*="color: #60a5fa"] { color: #1d4ed8 }` contains both a colour being
 * corrected and the correction, and counting either as a "foreground on white" is nonsense. Missing
 * this inflated the failure count from 190 to 232 the moment the remaps were added — the number
 * went UP because the fix landed.
 */
function foregrounds(src) {
  const out = new Map();
  const lines = src.split('\n');
  const re = /\b(?:color|fill|stroke)\s*:\s*["'`]?(#[0-9a-fA-F]{3,8})/g;
  lines.forEach((line, i) => {
    if (line.includes('journal-light')) return;      // the override sheet
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) {
      if (!out.has(m[1])) out.set(m[1], i + 1);
    }
  });
  return out;
}

// Importable: `ratio` is used by other checks, and running the whole audit on import made an
// `import { ratio }` print 200 lines of report before the caller's first statement.
const IS_MAIN = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('contrast-audit.mjs');
if (!IS_MAIN) { /* imported for its helpers only */ }

const T = lightTheme();
const args = process.argv.slice(2);
const showAll = args.includes('--all');

let fails = 0, checked = 0;
const summary = [];

if (IS_MAIN) {
console.log(`light canvas ${T.bg}   surface ${T.surface}   text ${T.text}   muted ${T.textMuted}\n`);

for (const rel of TARGETS) {
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }
  const fg = foregrounds(src);
  const bad = [];
  for (const [color, line] of fg) {
    for (const [bgName, bg] of [['canvas', T.bg], ['surface', T.surface]]) {
      const r = ratio(color, bg);
      if (r === null) continue;
      checked++;
      if (r < AA) {
        bad.push({ color, line, bgName, r });
        fails++;
      } else if (showAll) {
        bad.push({ color, line, bgName, r, ok: true });
      }
    }
  }
  if (bad.length) {
    summary.push([rel, bad.filter((b) => !b.ok).length]);
    console.log(`── ${rel}`);
    for (const b of bad.sort((x, y) => x.r - y.r)) {
      const tag = b.r < AA_LARGE ? 'FAIL ' : b.r < AA ? 'weak ' : 'ok   ';
      console.log(`   ${tag} ${b.color.padEnd(9)} on ${b.bgName.padEnd(7)} ${String(b.r).padStart(6)}:1   L${b.line}`);
    }
    console.log('');
  }
}

console.log('─'.repeat(58));
for (const [f, n] of summary.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${relative('client/src', f.replace('client/src/', ''))}`);
}
console.log(`\n${fails} foreground colours below ${AA}:1 (of ${checked} pairs checked)`);

// UNCOVERED is the metric that matters: a colour the override sheet never mentions renders as-is.
const sheet = readFileSync(join(ROOT, 'client/src/pages/Journal.tsx'), 'utf8')
  .split('\n').filter((l) => l.includes('journal-light')).join('\n').toLowerCase();
const distinct = new Set();
for (const rel of TARGETS) {
  try { for (const c of foregrounds(readFileSync(join(ROOT, rel), 'utf8')).keys()) distinct.add(c.toLowerCase()); }
  catch { /* file gone */ }
}
const uncovered = [...distinct].filter((c) => !sheet.includes(c));
console.log(`${distinct.size} distinct foregrounds · ${distinct.size - uncovered.length} remapped by the sheet · ` +
            `${uncovered.length} UNCOVERED`);
if (uncovered.length) console.log('  uncovered: ' + uncovered.sort().join(' '));
}
process.exitCode = 0;   // reporting tool — never fails a build
