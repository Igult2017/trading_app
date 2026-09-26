/**
 * Convert the journal's hardcoded dark-theme foregrounds into the light-theme ink tokens.
 *
 *     node scripts/ink-codemod.mjs            # dry run — what it would rewrite, and to which token
 *     node scripts/ink-codemod.mjs --write    # apply
 *
 * ══ WHAT IT WRITES, AND WHY THAT IS SAFE ════════════════════════════════════════════════════════
 *
 * `color: '#34d399'` becomes `color: 'var(--jr-up, #34d399)'` — the literal STAYS as the fallback.
 * `--jr-up` is defined only on `.journal-light` (client/src/lib/journalInk.ts), so the five dark themes
 * resolve to the original literal and render byte-identically. That is what makes this a mechanical
 * change rather than a repaint, and it is why many different dark greens can share one light token.
 *
 * It only touches what `scripts/contrast-audit.mjs` reports as FAILING on the light ground, using that
 * script's own extraction — so it cannot rewrite a foreground on its own declared fill, the dark half of
 * a theme ternary, a self-grounded panel, a comment, or the `.journal-light` sheet itself.
 *
 * ══ IT REWRITES INSIDE THE VALUE REGION, NOT BY ADJACENCY ═══════════════════════════════════════
 *
 * An earlier version matched `color:` and the literal next to each other. Both of these are normal in
 * this codebase and both slipped through it:
 *
 *     color: isToday ? '#38bdf8' : c.color      the literal is not next to the colon
 *     color: #c9d1d9 !important;                nor next to the terminator
 *
 * The first is the dashboard calendar's "today" ring — the one cell a reader looks for — and it stayed
 * at 2.14:1 through a pass that reported the file clean. Only the RENDERED measurement found it. The
 * region now comes from the audit's own `valueRegions`, so the fix and the measurement agree on where a
 * colour value begins and ends, and a literal in the same line's `background` or `border` is outside
 * every region and cannot be touched.
 *
 * ══ HOW A COLOUR IS GIVEN A ROLE ════════════════════════════════════════════════════════════════
 *
 * By HUE, because that is what this codebase already means by them: every green is profit, every red is
 * loss, every amber a warning. A neutral is ink, and which of the three ink tiers depends on how light
 * it was — a dark theme's `#f1f5f9` was primary text and its `#94a3b8` a caption, and that distinction
 * has to survive or every label lands on the same weight.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lightTheme, reachable, foregrounds, SELF_GROUNDED, ratio, valueRegions }
  from './contrast-audit.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WRITE = process.argv.includes('--write');
const AA = 4.5;

/** Brand marks keep their identity and get their own token — see LIGHT_BRAND in lib/journalInk.ts. */
const BRAND = new Set(['#f3ba2f', '#f7a600', '#00cdd1', '#ff6b35', '#00a0df', '#f05a22']);

/** The token module itself: its header tabulates the literals it replaces, so it must not be edited. */
const NEVER = new Set(['client/src/lib/journalInk.ts']);

function toHsl(css) {
  const s = css.trim().toLowerCase();
  let r, g, b;
  if (s === 'white') [r, g, b] = [255, 255, 255];
  else if (s === 'black') [r, g, b] = [0, 0, 0];
  else if (s.startsWith('rgb')) {
    const m = s.match(/([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    [r, g, b] = [+m[1], +m[2], +m[3]];
  } else {
    let h = s.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    h = h.slice(0, 6);
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  const l = (mx + mn) / 2;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d !== 0) {
    const R = r / 255, G = g / 255, B = b / 255;
    if (mx === R) hue = 60 * (((G - B) / d) % 6);
    else if (mx === G) hue = 60 * ((B - R) / d + 2);
    else hue = 60 * ((R - G) / d + 4);
  }
  return { h: (hue + 360) % 360, s: sat, l, chroma: Math.max(r, g, b) - Math.min(r, g, b) };
}

/**
 * Which token a colour belongs to.
 *
 * ══ NEUTRAL vs CHROMATIC IS DECIDED BY CHROMA, NOT HSL SATURATION ═══════════════════════════════
 *
 * HSL saturation is divided by `1 - |2L - 1|`, so it explodes towards the white and black ends: the
 * near-white ink `#E8EDF5` reports **s ≈ 0.40** and reads as a saturated blue, even though its channels
 * span only 13 of 255. An earlier version used an `s < 0.22` floor and therefore routed that ink to
 * `--jr-info`, turning the calendar's status line BLUE in the light theme. The rendered measurement is
 * what caught it — the source audit saw a token and was satisfied.
 *
 * Chroma — `max - min` on the raw 0-255 channels — does not have that failure mode. `#E8EDF5` scores 13
 * and is ink; `#38bdf8` scores 192 and is a colour; `#94a3b8` scores 36 and stays ink, which is what it
 * was (a caption, not a status). 40 is the cut.
 */
const CHROMA_FLOOR = 40;

export function roleOf(css) {
  const bare = css.trim().toLowerCase();
  if (BRAND.has(bare)) return `--jr-brand-${bare.replace('#', '')}`;
  const { h, s, l, chroma } = toHsl(css);
  if (chroma < CHROMA_FLOOR) {
    // WHITE TEXT'S TIER IS ITS ALPHA, NOT ITS LIGHTNESS. A dark panel dims a label by fading pure
    // white, so `rgba(255,255,255,0.35)` is a caption and `0.9` is a heading — and every one of those
    // has the same lightness, so grading them by lightness flattens three levels into one. On the light
    // ground they are all identical anyway (white over white is 1:1 at every alpha), so the alpha is
    // the only surviving record of which tier was meant.
    const alpha = (css.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/) ?? [])[1];
    if (alpha !== undefined && l > 0.9) {
      const a = +alpha;
      if (a >= 0.75) return '--jr-ink-text';
      if (a >= 0.45) return '--jr-ink-mute';
      return '--jr-ink-faint';
    }
    if (l >= 0.82) return '--jr-ink-text';    // #fff, #f1f5f9, #e2e8f0 — primary text
    if (l >= 0.55) return '--jr-ink-mute';    // #cbd5e1, #94a3b8 — labels
    return '--jr-ink-faint';                  // #7c85a2, #6f849b, #888 — hints
  }
  if (h >= 90  && h < 175) return '--jr-up';
  if (h >= 175 && h < 255) return '--jr-info';
  if (h >= 255 && h < 290) return '--jr-alt';
  if (h >= 290 && h < 335) return '--jr-pink';
  if (h >= 20  && h < 90)  return '--jr-warn';
  return '--jr-down';                          // 335-360 and 0-20 — every red and rose
}

// GUARDED, so importing `roleOf` for a test does not run a codemod over the working tree.
const IS_MAIN = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('ink-codemod.mjs');
if (IS_MAIN) run();

function run() {
const T = lightTheme();
let totalFiles = 0, totalEdits = 0;
const byRole = new Map();

for (const rel of reachable()) {
  if (SELF_GROUNDED[rel] || NEVER.has(rel)) continue;
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }

  // Which literals in this file fail on the light ground and have no fill of their own.
  const targets = new Map();                 // line -> Set(colour)
  for (const { color, line, onFill } of foregrounds(src)) {
    if (onFill) continue;
    const r = ratio(color, T.surface);
    if (r === null || r >= AA) continue;
    if (!targets.has(line)) targets.set(line, new Set());
    targets.get(line).add(color);
  }
  if (!targets.size) continue;

  const lines = src.split('\n');
  let edits = 0;

  for (const [lineNo, colours] of targets) {
    let line = lines[lineNo - 1];
    // Longest first, so `rgba(255,255,255,0.35)` is not half-matched by a shorter sibling and
    // `#4e8cff80` is not clipped to `#4e8cff`.
    for (const colour of [...colours].sort((a, b) => b.length - a.length)) {
      const role = roleOf(colour);
      const before = line;
      let shift = 0;
      for (const region of valueRegions(line)) {
        const from = region.from + shift, to = region.to + shift;
        const value = line.slice(from, to);
        // Blank out anything already tokenised so it cannot be wrapped twice.
        const bare = value.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, (m) => ' '.repeat(m.length));
        let out = '', last = 0, i;
        while ((i = bare.indexOf(colour, last)) !== -1) {
          out += value.slice(last, i) + `var(${role}, ${colour})`;
          last = i + colour.length;
        }
        if (!out) continue;
        out += value.slice(last);
        line = line.slice(0, from) + out + line.slice(to);
        shift += out.length - value.length;
      }
      if (line !== before) {
        edits++;
        byRole.set(role, (byRole.get(role) ?? 0) + 1);
      }
    }
    lines[lineNo - 1] = line;
  }

  if (edits) {
    totalFiles++;
    totalEdits += edits;
    console.log(`  ${String(edits).padStart(3)}  ${rel}`);
    if (WRITE) writeFileSync(abs, lines.join('\n'));
  }
}

console.log('─'.repeat(64));
for (const [role, n] of [...byRole].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${role}`);
}
console.log(`\n${totalEdits} foregrounds in ${totalFiles} files ${WRITE ? 'REWRITTEN' : '(dry run — pass --write)'}`);
}
