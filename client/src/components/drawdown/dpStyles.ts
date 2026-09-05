/**
 * dpStyles.ts — scoped CSS for the Drawdown "Dive Profile" page (.dp scope).
 *
 * Adapted from the provided design:
 *  • Google-Fonts @import REMOVED — fonts are self-hosted via Fontsource
 *    (client/src/index.css), so no external request.
 *  • Added a `.journal-light .dp` block that remaps every colour token for the
 *    journal's light theme (the design itself is dark-only).
 *  • `.journal-root .dp svg text` pins chart labels to var(--mono), which since
 *    2026-07-29 IS the journal font — so axes match the rest of the page.
 *
 * NOTE: the journal forces `font-family/weight/letter-spacing !important` on every
 * descendant of `.journal-root`. Journal.tsx exempts the `.dp` subtree via a
 * zero-specificity `:where(:not(.dp):not(.dp *))`, so the typography below applies
 * cleanly without needing !important on each rule.
 */
export const DP_CSS = `
.dp{
  --bg:#090C11; --bg2:#0D1119; --raise:rgba(255,255,255,.022);
  /* CONTRAST RAISED 2026-08-29 on his "improve the visibility of text in the whole page". Measured
     against --bg (#090C11), not eyeballed. The small uppercase labels are 9–11px with wide letter
     spacing, which is where dim text actually hurts, so the two label greys were the priority:
        --ink2  #8A94A1  6.37:1 (AA)  ->  #AEB8C4  9.75:1 (AAA)
        --ink3  #737F8E  4.81:1 (AA)  ->  #93A0AE  7.35:1 (AAA)
        --loss  #F2596A  5.98:1 (AA)  ->  #FF7A87  7.82:1 (AAA)   */
  --ink:#F2F5F0; --ink2:#C2CBD6; --ink3:#A7B3C0;
  --line:rgba(255,255,255,.09); --line2:rgba(255,255,255,.15);
  --loss:#FF7A87; --lossdeep:#FF3C4F; --loss-d:rgba(255,122,135,.16);
  --gain:#5FE3B4; --gain-d:rgba(95,227,180,.15);
  --warn:#FFC155; --warn-d:rgba(255,193,85,.15);
  --heat-neg-ink:#FFFFFF;
  /* BOTH roles follow the journal font: 'inherit', NOT a named face (changed 2026-08-29 on his
     "it should inherit font type from journal").
     WHY IT USED TO DIVERGE: these fell back to a hardcoded 'Playfair Display'. The .dp subtree is
     deliberately exempt from the journal's global font rule (Journal.tsx:987 — that exemption
     exists so icon fonts are not clobbered into letters), so while the fallback was in force this
     page kept a face the journal had moved off. 'inherit' resolves to whatever .journal-root is
     actually set to (Journal.tsx:957), so the page follows the journal by default instead of only
     when a prop happens to be passed. DrawdownPanel still overrides both from the live selection.
     NO BACKTICKS IN THIS FILE — it is one big template literal; a backtick here ends the CSS. */
  --mono:inherit;
  --disp:inherit;
  background:var(--bg); color:var(--ink); font-family:var(--mono);
  /* Playfair's figures are PROPORTIONAL by default, so KPI columns and chart axes would go ragged
     the moment DM Mono left — the very thing DM Mono was here for. tabular-nums restores
     equal-width digits; on a face without the feature it is simply ignored, so it cannot hurt. */
  font-variant-numeric:tabular-nums;
  min-height:100%; -webkit-font-smoothing:antialiased;
  /* top gap comes from <main> (14px, uniform with every other journal page); keep
     the horizontal + bottom padding here. */
  padding:0 clamp(14px,3.4vw,46px) 30px;
}
/* Light theme — remap every token; the layout/typography is unchanged. */
.journal-light .dp{
  --bg:#FFFFFF; --bg2:#F1F5F9; --raise:rgba(15,23,42,.03);
  /* THREE REAL FAILURES FOUND AND FIXED HERE, 2026-08-29 — the light theme was never measured to the
     standard the dark one was. Against white: --ink3 was 2.56:1, BELOW WCAG AA outright, and --gain
     (3.77:1) and --warn (3.19:1) only passed at large sizes while being used on 10–12px text.
        --ink3  #94A3B8  2.56:1 FAIL  ->  #64748B  4.76:1 (AA)
        --gain  #059669  3.77:1 large ->  #047857  5.48:1 (AA)
        --warn  #D97706  3.19:1 large ->  #B45309  5.02:1 (AA)   */
  --ink:#0B1220; --ink2:#334155; --ink3:#526277;
  --line:rgba(15,23,42,.11); --line2:rgba(15,23,42,.18);
  --loss:#C81E1E; --lossdeep:#991B1B; --loss-d:rgba(200,30,30,.12);
  --gain:#047857; --gain-d:rgba(4,120,87,.12);
  --warn:#B45309; --warn-d:rgba(180,83,9,.12);
  --heat-neg-ink:#7F1D1D;
}
/* Keep chart labels in DM Mono despite the global .journal-root svg text rule. */
.journal-root .dp svg text{font-family:var(--mono)!important;}

.dp .shell{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:46px;}

/* generic type */
.dp .disp{font-family:var(--disp);}
.dp .num{font-variant-numeric:tabular-nums;letter-spacing:-.01em;font-weight:500;}
.dp .loss{color:var(--loss);} .dp .gain{color:var(--gain);} .dp .warn{color:var(--warn);}
.dp .dim{color:var(--ink2);} .dp .mut{color:var(--ink3);}
/* Wins / losses / breakevens as coloured figures (2026-08-29) — replaces the old "8L" / "7W"
   letter notation. The slash is deliberately dimmer than the numbers so the eye lands on the
   counts, and the numbers are 600-weight so colour is not doing all the work. */
.dp .wlb{display:inline-flex;align-items:baseline;gap:2px;font-variant-numeric:tabular-nums;font-weight:600;}
.dp .wlb .sl{color:var(--ink3);font-weight:400;}
.dp .eyebrow{font-family:var(--disp);font-size:12px;letter-spacing:.22em;text-transform:uppercase;
  color:var(--ink2);font-weight:600;margin:0;line-height:1.5;}
/* The question half, in red. Same size as the label half — his instruction was explicitly "in normal
   font size", replacing a banner heading that sat alone in its own space (2026-08-29). */
.dp .eyebrow .ask{color:var(--loss);font-weight:700;}

/* section rule header */
.dp .rule{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;
  border-bottom:1px solid var(--line);padding-bottom:13px;margin-bottom:24px;}
.dp .rule .lab{display:flex;align-items:center;gap:11px;}
.dp .rule .pin{width:6px;height:6px;background:var(--gain);transform:rotate(45deg);}
.dp .rule .t{font-family:var(--disp);font-weight:700;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;}
.dp .rule .sub{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);;font-weight:600}

/* toggle */
.dp .seg{display:inline-flex;gap:22px;}
.dp .seg button{font-family:var(--mono);font-size:11.5px;letter-spacing:.10em;text-transform:uppercase;font-weight:500;
  color:var(--ink3);background:none;border:0;padding:0 0 4px;cursor:pointer;border-bottom:1.5px solid transparent;transition:.16s;}
.dp .seg button:hover{color:var(--ink2);}
.dp .seg button.on{color:var(--ink);border-bottom-color:var(--gain);}

/* HERO */
.dp .hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;margin-bottom:30px;}
.dp .equity{display:flex;align-items:baseline;gap:9px;}
.dp .equity .slabel{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);;font-weight:600}
.dp .equity .t{font-size:11px;letter-spacing:.08em;text-transform:uppercase;}

/* KPI surface readouts */
.dp .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:4px;}
.dp .kpi{background:var(--bg);padding:16px 18px;}
.dp .kpi .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:9px;;font-weight:600}
.dp .kpi .v{font-size:clamp(10px,1.2vw,14px);font-weight:500;letter-spacing:-.03em;}

/* chart */
.dp .chart-wrap{position:relative;margin-top:14px;}
.dp .chart-wrap svg{display:block;width:100%;height:auto;}
.dp .chart-foot{display:flex;flex-wrap:wrap;gap:28px 40px;margin-top:16px;}
.dp .foot .k{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);;font-weight:600}
.dp .foot .v{font-size:14px;margin-top:5px;}
.dp .foot .v .u{color:var(--ink3);font-size:11px;margin-left:6px;}

/* STRATEGY LEADERBOARD */
.dp .lead{display:flex;flex-direction:column;}
.dp .lrow{display:grid;grid-template-columns:38px 230px 1fr 84px;gap:20px;align-items:center;
  padding:15px 0;border-top:1px solid var(--line);}
.dp .lrow:first-child{border-top:0;}
.dp .lrank{font-size:13px;color:var(--ink3);}
.dp .lname{display:flex;align-items:baseline;gap:10px;min-width:0;}
.dp .ltag{font-size:14px;color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dp .lmeta{font-size:11px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dp .lbar{height:2px;background:var(--line2);position:relative;overflow:hidden;}
.dp .lbar i{position:absolute;inset:0 auto 0 0;display:block;height:100%;}
.dp .lval{text-align:right;font-size:15px;font-weight:500;}
.dp .colh{display:grid;grid-template-columns:38px 230px 1fr 84px;gap:20px;margin-bottom:6px;}
.dp .colh span{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);}
.dp .empty-row{padding:26px 0;color:var(--ink3);font-size:11px;letter-spacing:.10em;text-transform:uppercase;text-align:center;}

/* TRIPLE (model) */
.dp .trip{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.dp .trip > div{padding:0 26px;border-left:1px solid var(--line);}
.dp .trip > div:first-child{padding-left:0;border-left:0;}
.dp .subh{font-family:var(--disp);font-weight:700;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink2);margin-bottom:16px;}
.dp .dl .r{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:9px 0;border-top:1px solid var(--line);}
.dp .dl .r:first-of-type{border-top:0;}
.dp .dl .r .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink2);}
.dp .dl .r .v{font-size:13px;font-weight:500;white-space:nowrap;}
.dp .note{font-size:11.5px;line-height:1.65;color:var(--ink3);margin-top:16px;}

/* RISK SURFACE (heatmap + freq) */
/* START, NOT STRETCH — this is what actually made the heatmap a slab, and no amount of capping the
   cell width or setting min-height could reach it. The two columns are grid tracks, so by default
   both stretch to the height of the TALLER one; the loss-frequency list is ~230px, the heatmap grid
   stretched to match, and its auto rows absorbed the spare height — turning a 62px tile into a
   120px block and pushing the legend far below it. The cell was never the wrong size; it was being
   inflated from outside. */
.dp .rs{display:grid;grid-template-columns:1fr 250px;gap:42px;align-items:start;}
/* HEATMAP — rebuilt 2026-08-29 so ONE pair does not become a giant slab.
   The old grid was repeat(cols, minmax(56px,1fr)): with a single pair and a single strategy that
   one cell stretched to the full row width and 14px of padding made it tall, so the whole section
   read as one enormous red rectangle with a number floating in it. Cells are now CAPPED tiles that
   sit left, so the layout looks the same whether there is one pair or eight. */
/* align-content:start belts-and-braces the same thing from the inside: even if this grid is ever
   stretched again by a parent, its rows keep their own height instead of sharing out the surplus. */
.dp .heat{display:grid;gap:5px;overflow-x:auto;padding-bottom:4px;align-content:start;}
/* TILES STAY TILE-SIZED. The cap was 150px, so one strategy produced a 150px-wide block sitting
   alone in a 700px column and the section read as a slab with a number in it. 112px keeps a single
   cell looking like a cell; the row label column came in from 104px so the grid starts near its
   data instead of across a gap. */
.dp .hrow{display:grid;grid-template-columns:86px repeat(var(--cols,5),minmax(78px,112px));
  gap:5px;justify-content:start;align-items:stretch;}
.dp .hh{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);text-align:center;
  padding:2px 4px 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;}
.dp .hp{display:flex;align-items:center;font-size:10px;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ink2);font-weight:700;padding-right:8px;}
/* A TILE, not a stretched band: fixed height, rounded, with a hairline so an empty/pale cell still
   reads as a cell instead of vanishing into the background. */
.dp .hc{padding:10px 8px 8px;text-align:center;border-radius:9px;min-height:62px;position:relative;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  border:1px solid var(--line);transition:transform .16s cubic-bezier(.16,1,.3,1),border-color .16s;}
.dp .hc:hover{transform:translateY(-2px);border-color:var(--line2);}
.dp .hc .p{font-size:15px;font-weight:700;letter-spacing:-.02em;line-height:1;}
.dp .hc .t{font-size:10px;margin-top:0;font-weight:600;opacity:.92;}
/* THE DEPTH BAR — the same number as a LENGTH. Colour alone is not readable as a quantity, and with
   a single tile there is nothing to compare the shade against. Sits flush at the foot of the tile. */
/* The TRACK uses --line2, which flips with the theme (white at .15 on dark, near-black at .18 on
   light). A hard-coded white track would have been invisible on the light theme's pale pink tile. */
.dp .hc .hm{position:absolute;left:8px;right:8px;bottom:6px;height:2px;border-radius:2px;
  background:var(--line2);overflow:hidden;}
.dp .hc .hm i{display:block;height:100%;background:var(--heat-neg-ink);opacity:.62;border-radius:2px;}
/* Legend — the colour meant nothing without one, which is most of why a lone red block looked wrong. */
.dp .hleg{display:flex;align-items:center;gap:9px;margin-top:14px;font-size:9.5px;
  letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);font-weight:700;}
.dp .hleg .sc{display:flex;gap:2px;}
.dp .hleg .sc i{width:24px;height:8px;border-radius:2px;display:block;}
.dp .hleg .cap{color:var(--ink3);white-space:nowrap;}
.dp .hleg .wc b{color:var(--ink2);font-weight:700;}
.dp .freq .frow{display:flex;justify-content:space-between;align-items:baseline;margin-top:14px;}
.dp .freq .frow:first-of-type{margin-top:0;}
/* THE SESSION / INSTRUMENT NAMES (London, Overlap, Tokyo, New York, Sydney) — the ones he ticked.
   They had no font-size of their own, so they inherited the journal body size (~15px) and rendered
   at full size in the display serif, which made five short labels shout louder than the figures
   beside them. 11.5px puts them in line with every other row label on this page. */
.dp .freq .frow .dim{font-size:11.5px;font-weight:600;}
.dp .freq .frow .wlb{font-size:11.5px;}
.dp .freq .bar{height:2px;background:var(--line2);margin-top:7px;position:relative;overflow:hidden;}
.dp .freq .bar i{position:absolute;inset:0 auto 0 0;background:var(--loss);}
.dp .freq .fsub{font-size:10px;color:var(--ink3);text-align:right;margin-top:5px;letter-spacing:.02em;}

/* STRUCTURAL */
.dp .struct-top{padding:16px 0 22px;border-bottom:1px solid var(--line);margin-bottom:24px;}
.dp .rp{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;border-top:1px solid var(--line);gap:14px;}
.dp .rp:first-of-type{border-top:0;}
.dp .rp .nm{font-family:var(--disp);font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;}
.dp .rp .v{font-size:14px;color:var(--loss);}
.dp .rp .tl{font-size:11px;color:var(--ink3);}
.dp .sg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.dp .sg > div{padding:0 26px;border-left:1px solid var(--line);}
.dp .sg > div:first-child{padding-left:0;border-left:0;}

.dp .sess{padding:13px 0;border-top:1px solid var(--line);}
.dp .sess:first-of-type{border-top:0;padding-top:2px;}
.dp .sess .top{display:flex;justify-content:space-between;align-items:baseline;}
.dp .sess .nm{font-family:var(--disp);font-weight:700;font-size:12px;letter-spacing:.08em;}
.dp .sess .vv{font-size:14px;}
.dp .sess .sb{font-size:11.5px;color:var(--ink3);margin-top:4px;}
.dp .sbar{height:2px;background:var(--line2);margin-top:9px;position:relative;overflow:hidden;}
.dp .sbar i{position:absolute;inset:0 auto 0 0;}
.dp .sess .wp{display:flex;justify-content:space-between;margin-top:9px;}
.dp .sess .wp .l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);}
.dp .sess .wp .r{font-size:11px;color:var(--ink2);}

.dp .ls{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px;}
.dp .ls .k{font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:var(--ink3);margin-bottom:8px;;font-weight:600}
.dp .ls .big{font-size:20px;font-weight:500;line-height:1;}
.dp .ls .s{font-size:11px;color:var(--ink3);margin-top:7px;}
.dp .tl{display:flex;flex-wrap:wrap;gap:3px;margin-top:14px;}
.dp .tl span{width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;}
.dp .tw{background:var(--gain-d);color:var(--gain);font-weight:700;} .dp .tlo{background:var(--loss-d);color:var(--loss);font-weight:700;} .dp .tb{background:var(--warn-d);color:var(--warn);font-weight:700;}   /* breakeven = orange (2026-08-29) */

.dp .rr{padding:11px 0;border-top:1px solid var(--line);}
.dp .rr:first-of-type{border-top:0;padding-top:2px;}
.dp .rr .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.dp .rr .rng{font-size:12px;min-width:58px;}
.dp .rr .nm{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);}
.dp .rr .ct{font-size:11px;color:var(--ink3);}
.dp .rr .pc{font-size:13px;}
.dp .rrbar{height:2px;background:var(--line2);margin-top:8px;position:relative;overflow:hidden;}
.dp .rrbar i{position:absolute;inset:0 auto 0 0;}

/* MONTHLY TABLE */
.dp .mwrap{overflow-x:auto;}
.dp .mtbl{width:100%;border-collapse:collapse;}
.dp .mtbl th{font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:var(--ink3);
  font-weight:500;text-align:right;padding:0 0 12px;border-bottom:1px solid var(--line);}
.dp .mtbl th:first-child{text-align:left;}
.dp .mtbl td{font-size:13px;padding:13px 0;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;}
.dp .mtbl td:first-child{text-align:left;}
.dp .mtbl tr:hover td{background:var(--raise);}
.dp .mmname{display:flex;align-items:center;gap:11px;}
.dp .mmname .d{width:6px;height:6px;border-radius:50%;background:var(--gain);box-shadow:0 0 0 3px var(--gain-d);}
.dp .mmname .nm{font-family:var(--disp);font-weight:600;font-size:11px;letter-spacing:.08em;color:var(--ink);}

@media(max-width:920px){
  .dp .rs{grid-template-columns:1fr;gap:30px;}
  .dp .trip,.dp .sg{grid-template-columns:1fr;gap:26px;}
  .dp .trip > div,.dp .sg > div{padding:0;border-left:0;border-top:1px solid var(--line);padding-top:22px;}
  .dp .trip > div:first-child,.dp .sg > div:first-child{border-top:0;padding-top:0;}
  .dp .kpis{grid-template-columns:1fr 1fr;}
  .dp .lrow,.dp .colh{grid-template-columns:30px 1fr 80px;}
  .dp .lrow .lbar,.dp .colh span:nth-child(3){display:none;}
}
@media(max-width:560px){.dp .kpis{grid-template-columns:1fr;}}
@media(prefers-reduced-motion:reduce){.dp *{transition:none!important;}}

/* ── EVERYTHING follows the journal font now — words via --disp, figures via --mono ──────────
 * .dp is exempted from the journal's global font rule because it owns its typography, so a new
 * journal default never reaches this panel on its own — these opt in explicitly.
 *
 * CHANGED 2026-07-29 (user: "change font used for both numbers and letters ... to playfair").
 * --mono used to stay DM Mono so figures kept equal-width digits; DrawdownPanel now points BOTH
 * variables at the journal's live selection, and the tabular-nums declaration on .dp carries the
 * alignment the monospace face used to provide. The rules below therefore no longer mark a
 * words/numbers split — they remain only because this subtree must opt in by hand.
 * The old split was: .kpi .v / .foot .v / svg text (figures and axes), .hh / .hp (heatmap axes),
 * .rr .nm (R:R ratios).
 *
 * NO BACKTICKS ANYWHERE BELOW THIS LINE — this comment sits INSIDE the DP_CSS template literal, so
 * a single backtick (even in a comment) closes the string and breaks the module. Adding this note
 * cost exactly that mistake.
 */
.dp .eyebrow,
.dp .rule .sub,
.dp .seg button,
.dp .equity .slabel,
.dp .equity .t,
.dp .kpi .k,
.dp .foot .k,
.dp .colh span,
.dp .empty-row,
.dp .dl .r .k,
.dp .sess .wp .l,
.dp .ls .k,
.dp .mtbl th{font-family:var(--disp);}
`;
