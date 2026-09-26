/**
 * Convert the journal's hardcoded dark-theme foregrounds into the light-theme ink tokens.
 *
 *     node scripts/ink-codemod.mjs            # dry run — prints every rewrite it would make
 *     node scripts/ink-codemod.mjs --write    # apply
 *
 * ══ WHAT IT REWRITES AND WHAT IT LEAVES ALONE ═══════════════════════════════════════════════════
 *
 * It rewrites `color: '#34d399'` to `color: 'var(--jr-up, #34d399)'` — the literal STAYS as the
 * fallback. `--jr-up` is defined only on `.journal-light` (client/src/lib/journalInk.ts), so the five
 * dark themes resolve to the original literal and render byte-identically. That is the whole reason
 * this is a safe mechanical change rather than a repaint.
 *
 * It only touches what `scripts/contrast-audit.mjs` reports as FAILING on the light ground, using that
 * script's own extraction — so it cannot rewrite:
 *   - a foreground on its own declared opaque fill (white on a blue-600 button is correct everywhere)
 *   - a literal inside a `darkMode ? {…} : {…}` palette (already answered per theme)
 *   - anything in a self-grounded panel (the price chart, the Trade Sync hero, the admin panel)
 *   - the `.journal-light` override sheet itself
 *
 * ══ HOW A COLOUR IS GIVEN A ROLE ════════════════════════════════════════════════════════════════
 *
 * By HUE, because that is what the codebase already means by these colours: every green is profit,
 * every red is loss, every amber is a warning. A neutral (low saturation) is ink, and which of the
 * three ink tiers depends on how light it was — a dark theme's `#f1f5f9` was primary text and its
 * `#94a3b8` was a caption, and that distinction must survive into the light theme or every label
 * becomes the same weight.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lightTheme, reachable, foregrounds, SELF_GROUNDED, ratio } from './contrast-audit.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WRITE = process.argv.includes('--write');
const AA = 4.5;

/** Brand marks keep their identity and get their own token — see LIGHT_BRAND in lib/journalInk.ts. */
const BRAND = new Set(['#f3ba2f', '#f7a600', '#00cdd1', '#ff6b35', '#00a0df', '#f05a22']);

function toHsl(css) {
  const s = css.trim().toLowerCase();
  let r, g, b;
  if (s === 'white') [r, g, b] = [255, 255, 255];
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
  return { h: (hue + 360) % 360, s: sat, l };
}

/**
 * Which token a colour belongs to.
 *
 * THE NEUTRAL SPLIT IS THE PART THAT MATTERS. A saturation floor of 0.22 keeps a desaturated
 * blue-grey like `#94a3b8` (s≈0.20) on the INK side, where it belongs — it was a caption, not a
 * status colour, and routing it to `--jr-info` would turn every muted label blue.
 */
function roleOf(css) {
  const bare = css.trim().toLowerCase();
  if (BRAND.has(bare)) return `--jr-brand-${bare.replace('#', '')}`;
  const { h, s, l } = toHsl(css);
  if (s < 0.22) {
    // WHITE TEXT'S TIER IS ITS ALPHA, NOT ITS LIGHTNESS. A dark panel dims a label by fading pure
    // white — `rgba(255,255,255,0.35)` is a caption, not a heading — and every one of those has the
    // same lightness, so grading them by lightness flattens a three-level hierarchy into one. On the
    // light ground they are all identical anyway (white over white is 1:1 at every alpha), so the
    // alpha is the ONLY surviving record of which tier the designer meant.
    const alpha = (css.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/) ?? [])[1];
    if (alpha !== undefined && l > 0.9) {
      const a = +alpha;
      if (a >= 0.75) return '--jr-ink-text';
      if (a >= 0.45) return '--jr-ink-mute';
      return '--jr-ink-faint';
    }
    // Ink. Three tiers, split where the dark theme's own usage split them.
    if (l >= 0.82) return '--jr-ink-text';    // #fff, #f1f5f9, #e2e8f0 — primary text
    if (l >= 0.55) return '--jr-ink-mute';    // #cbd5e1, #94a3b8 — labels
    return '--jr-ink-faint';                  // #7c85a2, #6f849b, #888 — hints
  }
  if (h >= 90  && h < 175) return '--jr-up';
  if (h >= 175 && h < 255) return '--jr-info';
  if (h >= 255 && h < 290) return '--jr-alt';
  if (h >= 290 && h < 335) return '--jr-pink';
  if (h >= 40  && h < 90)  return '--jr-warn';
  if (h >= 20  && h < 40)  return '--jr-warn';
  return '--jr-down';                          // 335-360 and 0-20 — every red and rose
}

const T = lightTheme();
let totalFiles = 0, totalEdits = 0;
const byRole = new Map();

/** The token module itself. Its doc comment quotes the very literals this rewrites — see the header
 *  table of measurements — and a codemod that edits its own definitions is a snake eating its tail. */
const NEVER = new Set(['client/src/lib/journalInk.ts']);

for (const rel of reachable()) {
  if (SELF_GROUNDED[rel] || NEVER.has(rel)) continue;
  const abs = join(ROOT, rel);
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { continue; }

  // Which literals in this file fail on the light ground and have no fill of their own.
  const targets = new Map();          // line -> Set(colour)
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
      const lit = colour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // TWO SHAPES, because this codebase writes colour both ways and only one of them is quoted.
      //
      //   an inline style object   color: '#34d399'        -> color: 'var(--jr-up, #34d399)'
      //   a CSS declaration        .np-pl-up { color:#34d399 } -> { color:var(--jr-up, #34d399) }
      //
      // The CSS form is where the rest of the failures were hiding: a `<style>` template string is
      // not an inline style, so a quote-requiring pattern walked straight past 48 of them. Both forms
      // resolve the same way — the token if the light theme defined it, the literal otherwise.
      const patterns = [
        // quoted (inline style object / a styled prop)
        [new RegExp(String.raw`((?<![-\w])(?:color|fill|stroke)\s*:\s*)(["'\`])(${lit})\2`, 'g'),
         (_m, prop, q, val) => `${prop}${q}var(${role}, ${val})${q}`],
        // unquoted (a real CSS declaration) — terminated by ; } end-of-line, OR an `!important` that
        // this codebase leans on heavily, since the journal's own rules are !important and a panel
        // cannot out-specify them. Omitting it left 3 declarations behind.
        [new RegExp(String.raw`((?<![-\w])(?:color|fill|stroke)\s*:\s*)(${lit})(?=\s*(?:!important)?\s*[;}]|\s*(?:!important)?\s*$)`, 'g'),
         (_m, prop, val) => `${prop}var(${role}, ${val})`],
      ];
      for (const [re, fn] of patterns) {
        const next = line.replace(re, fn);
        if (next !== line) {
          line = next;
          edits++;
          byRole.set(role, (byRole.get(role) ?? 0) + 1);
          break;
        }
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
