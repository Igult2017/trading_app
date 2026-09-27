/**
 * dpTokens.ts — the Drawdown page's palette, mapped onto the Metrics page's.
 *
 * WHY (2026-09-27). His instruction: "copy the design and colors used in metrics page to be copied
 * and use in the drawdown page." Rather than paste Metrics' hex values in here, every one of the
 * drawdown's own token NAMES now points at the shared palette in components/shared/mpTokens.ts.
 * A colour fixed there moves both pages; a colour pasted here would drift.
 *
 * THE NAMES DO NOT CHANGE, and that is the point — every rule in dpStyles.ts goes on reading
 * var(--ink), var(--gain), var(--line) exactly as before. Only what they resolve to moves.
 *
 * WHAT DELIBERATELY DOES NOT COME FROM METRICS:
 *   --bar-instr / --bar-sess   the two loss-share bar colours. He picked these himself on
 *                              2026-09-14 ("the colors we already have in the journal"), so they
 *                              are his choice, not a design detail to be overwritten.
 *   --lossdeep                 the deep-dive shade on the underwater chart, kept as a darker step
 *                              of the shared red so the chart still reads as one gradient.
 */
import { MP_DARK, MP_LIGHT } from '@/components/shared/mpTokens';

/** Turn `#RRGGBB` into `rgba(r,g,b,a)` so a tint can be built from a shared token. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** One theme's worth of drawdown custom properties, built from the shared palette. */
function block(P: typeof MP_DARK | typeof MP_LIGHT, o: {
  raise: string; line: string; line2: string; lossdeep: string;
  barInstr: string; barSess: string;
}): string {
  return [
    `--bg:${P.bg};`,
    `--bg2:${P.bg2};`,
    `--raise:${o.raise};`,
    // ink tiers keep the drawdown's three-step hierarchy, taken from the shared text scale:
    //   --ink  what you read   --ink2  a label   --ink3  a caption behind it
    `--ink:${P.text};`,
    `--ink2:${P.muted};`,
    `--ink3:${P.label};`,
    `--line:${o.line};`,
    `--line2:${o.line2};`,
    `--loss:${P.red};`,
    `--lossdeep:${o.lossdeep};`,
    `--loss-d:${P.redBg};`,
    `--gain:${P.green};`,
    `--gain-d:${P.greenBg};`,
    `--warn:${P.amber};`,
    `--warn-d:${P.amberBg};`,
    `--bar-instr:${o.barInstr};`,
    `--bar-sess:${o.barSess};`,
    // Metrics' surfaces and lines, so the panel chrome in dpStyles matches that page exactly.
    `--card:${P.bg2};`,
    `--panel:${P.bg3};`,
    `--panelbar:${P.bg4};`,
    `--bd-outer:${P.bdOuter};`,
    `--bd-inner:${P.bdInner};`,
    `--bd-row:${P.bdRow};`,
    `--bd-div:${P.bdDiv};`,
    `--chip-gray:${P.gray};`,
    `--chip-gray-bg:${P.grayBg};`,
    `--chip-gray-bd:${P.grayBd};`,
    `--chip-green-bd:${P.greenBd};`,
    `--chip-red-bd:${P.redBd};`,
    `--chip-amber-bd:${P.amberBd};`,
    `--blue:${P.blue};`,
    `--blue-d:${P.blueBg};`,
    `--blue-bd:${P.blueBd};`,
    `--kpi-cap:${P.kpiCap};`,
    `--kpi-sub:${P.kpiSub};`,
  ].join('');
}

/** Dark — what every theme but `light` shows. */
export const DP_TOKENS_DARK = block(MP_DARK, {
  raise:    'rgba(255,255,255,.022)',
  line:     'rgba(255,255,255,.09)',
  line2:    'rgba(255,255,255,.15)',
  lossdeep: '#B23636',            // a deeper step of the shared red, for the chart gradient
  barInstr: '#38bdf8',            // HIS choice, 2026-09-14 — not from the Metrics palette
  barSess:  '#a78bfa',            // HIS choice, 2026-09-14
});

/** Light — the same names, the shared palette's light values. */
export const DP_TOKENS_LIGHT = block(MP_LIGHT, {
  raise:    'rgba(15,23,42,.03)',
  line:     'rgba(15,23,42,.11)',
  line2:    'rgba(15,23,42,.18)',
  lossdeep: '#991B1B',            // unchanged from the drawdown's own measured light theme
  barInstr: '#2563eb',            // HIS choice, the light theme's accent
  barSess:  '#7c3aed',            // HIS choice
});

/**
 * THE MONTHLY SECTION KEEPS THE OLD PALETTE — his instruction, 2026-09-27: "dont change how Monthly
 * Drawdown / Dominant Cause per Month is displayed."
 *
 * Everything else on the page moved to the Metrics colours. That swap WOULD have reached this
 * section too, because its table reads the same --ink / --gain / --loss names as the rest of the
 * page: its green would have gone from #5FE3B4 to #1D9E75 and its red from #FF7A87 to #E24B4A.
 * Re-declaring the original values on .mtbl-sec pins that one subtree to exactly what it showed
 * before, so its columns, rows, text and background are untouched.
 *
 * These are copied from the pre-change dpStyles.ts and are deliberately NOT built from the shared
 * palette — the whole point is that they do not follow it.
 */
export const DP_TOKENS_MONTHLY_DARK =
  '--bg:#090C11;--bg2:#0D1119;--raise:rgba(255,255,255,.022);' +
  '--ink:#F2F5F0;--ink2:#C2CBD6;--ink3:#A7B3C0;' +
  '--line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.15);' +
  '--loss:#FF7A87;--lossdeep:#FF3C4F;--loss-d:rgba(255,122,135,.16);' +
  '--gain:#5FE3B4;--gain-d:rgba(95,227,180,.15);' +
  '--warn:#FFC155;--warn-d:rgba(255,193,85,.15);';

export const DP_TOKENS_MONTHLY_LIGHT =
  '--bg:#FFFFFF;--bg2:#F1F5F9;--raise:rgba(15,23,42,.03);' +
  '--ink:#0B1220;--ink2:#334155;--ink3:#526277;' +
  '--line:rgba(15,23,42,.11);--line2:rgba(15,23,42,.18);' +
  '--loss:#C81E1E;--lossdeep:#991B1B;--loss-d:rgba(200,30,30,.12);' +
  '--gain:#047857;--gain-d:rgba(4,120,87,.12);' +
  '--warn:#B45309;--warn-d:rgba(180,83,9,.12);';
