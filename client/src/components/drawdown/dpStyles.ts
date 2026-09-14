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
  /* PIE SLICE COLOURS, in slice order (lossPie.tsx) — the journal's own, his "the colors we already have
     in the journal" (2026-09-14): the accent blue (Journal.tsx panel headings and pair-volume bars), the
     equity-curve violet (Journal.tsx), then this page's amber, red, green and grey. Three to six point at
     the page's tokens, so the light theme's versions below reach the pies without being repeated. */
  --pie-1:#38bdf8; --pie-2:#a78bfa; --pie-3:var(--warn); --pie-4:var(--loss); --pie-5:var(--gain); --pie-6:var(--ink3);
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
  /* THE FIGURES FONT — the DISPLAY face, i.e. the same Playfair the month names in the monthly
     table are already set in. He pointed straight at those and said: "Playfair is the one in
     image 3 please use it in numbers too like i told you."
     It went DM Mono, then Montserrat, on two earlier readings of what he wanted the same day.
     This is the settled one: numbers and the words beside them share one face.

     STILL A SEPARATE VARIABLE from --disp, for two reasons: it keeps tabular-nums on the figures
     so the monthly table's seven columns cannot go ragged, and it is the single handle for sizing
     every number on the page. Note --mono above is NOT the mono font — it is this panel's BODY
     font, the thing .dp inherits from one line down. A variable named mono that holds something
     else is the trap docs/READABILITY.md records about a constant named sans that held a serif;
     check what it holds, not what it is called. */
  --fig:var(--disp);
  background:var(--bg); color:var(--ink); font-family:var(--mono);
  /* Keeps the monthly table's seven columns from going ragged whatever the reading face is (Times
     New Roman since 2026-09-14; Montserrat before, whose digits are proportional). On a face without
     the feature it is simply ignored, so it cannot hurt. */
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
  /* Pie slices: the light theme's own accent (useJournalSettings.ts light.accent) and the equity-curve
     violet's deeper shade. Slices three to six follow --warn / --loss / --gain / --ink3 above. */
  --pie-1:#2563eb; --pie-2:#7c3aed;
}
/* Chart axes are figures too — dates and values — so they follow --fig with the numbers rather
   than the body font. !important because the journal's own svg-text rule also targets these. */
.journal-root .dp svg text{font-family:var(--fig)!important;}

.dp .shell{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:46px;}

/* generic type */
.dp .disp{font-family:var(--disp);}
.dp .num{font-variant-numeric:tabular-nums;letter-spacing:-.01em;font-weight:700;}
/* THE FIGURES — see --fig above for which face they take and why it changed.
   Listed one class at a time rather than swept with a broad selector, because several classes
   that LOOK numeric are not: bare .t is a text label (the equity caption), and .ls .s reads
   "before recovery" / "no data". Those keep the body font. .pk .sh and .pk .lp are the share
   and the actual loss beside each pie slice.
   .mtbl td is the monthly table he circled — every cell in it but the month name is a figure. */
.dp .num, .dp .wlb,
.dp .kpi .v, .dp .foot .v, .dp .dl .r .v, .dp .rp .v,
.dp .sess .vv, .dp .sess .sb,
.dp .ls .big,
.dp .rr .rng, .dp .rr .pc, .dp .rr .ct,
.dp .pk .sh, .dp .pk .lp,
.dp .mtbl td{font-family:var(--fig);}
.dp .loss{color:var(--loss);} .dp .gain{color:var(--gain);} .dp .warn{color:var(--warn);}
.dp .dim{color:var(--ink2);} .dp .mut{color:var(--ink3);}
/* Wins / losses / breakevens as coloured figures (2026-08-29) — replaces the old "8L" / "7W"
   letter notation. The slash is deliberately dimmer than the numbers so the eye lands on the
   counts, and the numbers are 600-weight so colour is not doing all the work. */
.dp .wlb{display:inline-flex;align-items:baseline;gap:2px;font-variant-numeric:tabular-nums;font-weight:700;}
.dp .wlb .sl{color:var(--ink3);font-weight:400;}

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

/* HERO — the "Tracking Drawdown" line and its Status readout were removed 2026-09-14 (his
   instruction, "remove this part of the drawdown page"), and the styles only they used went with them. */

/* KPI surface readouts */
.dp .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:4px;}
.dp .kpi{background:var(--bg);padding:16px 18px;}
.dp .kpi .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);margin-bottom:9px;;font-weight:600}
.dp .kpi .v{font-size:clamp(13px,1.5vw,17px);font-weight:700;letter-spacing:-.03em;}

/* chart */
.dp .chart-wrap{position:relative;margin-top:14px;}
.dp .chart-wrap svg{display:block;width:100%;height:auto;}
.dp .chart-foot{display:flex;flex-wrap:wrap;gap:28px 40px;margin-top:16px;}
.dp .foot .k{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);;font-weight:600}
.dp .foot .v{font-size:16px;font-weight:700;margin-top:5px;}
.dp .foot .v .u{color:var(--ink3);font-size:11px;margin-left:6px;}

/* STRATEGY LEADERBOARD */
.dp .lead{display:flex;flex-direction:column;}
.dp .lrow{display:grid;grid-template-columns:38px 230px 1fr 84px;gap:20px;align-items:center;
  padding:15px 0;border-top:1px solid var(--line);}
.dp .lrow:first-child{border-top:0;}
.dp .lrank{font-size:13px;color:var(--ink3);}
.dp .lname{display:flex;align-items:baseline;gap:10px;min-width:0;}
.dp .ltag{font-size:14px;color:var(--ink);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* 11px was fine while this row was set in a sans; the whole line is now Playfair, whose thin
   strokes are the thing that disappears at that size — the same reason every other figure on this
   page went up a step. */
.dp .lmeta{font-size:12.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dp .lbar{height:2px;background:var(--line2);position:relative;overflow:hidden;}
.dp .lbar i{position:absolute;inset:0 auto 0 0;display:block;height:100%;}
.dp .lval{text-align:right;font-size:15px;font-weight:700;}
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
.dp .dl .r .v{font-size:15px;font-weight:700;white-space:nowrap;}
.dp .note{font-size:11.5px;line-height:1.65;color:var(--ink3);margin-top:16px;}

/* LOSS CONTRIBUTION — two pies across the whole row */
/* THE TWO PIES, his request 2026-09-14: first beside a loss-frequency list, then the same day across the
   whole row, once he removed that list as "a duplication" of the session pie and asked for the pies to be
   "bigger and spacious enough to cover that space". Each 320px circle sits over its key.
   MEASURED IN PLAYWRIGHT on the real page before settling this. A layout with the key BESIDE the circle on
   wide screens was tried and dropped: this page never grows past 1180px, so each half tops out at 562px,
   and a key squeezed beside a 300px circle got 226px, which cut "LONDON/NY OVERLAP" off. Stacked, the key
   gets 440px and every name fits, on a 1366px screen and a 1920px one alike. The pies stack under 760px.
   .pie-ph is the loading screen's round placeholder, sized by the same rules as the chart. */
.dp .pies{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;}
.dp .pie{display:flex;flex-direction:column;align-items:center;min-width:0;}
.dp .pie .subh,.dp .pie .empty-row{align-self:stretch;}
.dp .pie svg,.dp .pie .pie-ph{display:block;width:100%;max-width:320px;height:auto;aspect-ratio:1 / 1;margin:4px 0 24px;}
.dp .pie .pkey{width:100%;max-width:440px;}
@media(max-width:760px){.dp .pies{grid-template-columns:1fr;gap:44px;}}
/* THE KEY — the sample's slices carry only a percentage, so the names live here: colour, name, share,
   and the actual loss as a % of the starting balance. 11px is this page's floor (docs/READABILITY.md). */
.dp .pkey{display:flex;flex-direction:column;}
.dp .pk{display:grid;grid-template-columns:10px minmax(0,1fr) auto 64px;gap:10px;align-items:center;
  padding:7px 0;border-top:1px solid var(--line);}
.dp .pk:first-child{border-top:0;}
.dp .pk i{width:10px;height:10px;border-radius:2px;display:block;}
.dp .pk .nm{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dp .pk .sh{font-size:14px;font-weight:700;color:var(--ink);}
.dp .pk .lp{font-size:13px;font-weight:700;text-align:right;}

/* STRUCTURAL */
.dp .struct-top{padding:16px 0 22px;border-bottom:1px solid var(--line);margin-bottom:24px;}
.dp .rp{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;border-top:1px solid var(--line);gap:14px;}
.dp .rp:first-of-type{border-top:0;}
.dp .rp .nm{font-family:var(--disp);font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;}
.dp .rp .v{font-size:16px;font-weight:700;color:var(--loss);}
.dp .rp .tl{font-size:11px;color:var(--ink3);}
.dp .sg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.dp .sg > div{padding:0 26px;border-left:1px solid var(--line);}
.dp .sg > div:first-child{padding-left:0;border-left:0;}

.dp .sess{padding:13px 0;border-top:1px solid var(--line);}
.dp .sess:first-of-type{border-top:0;padding-top:2px;}
.dp .sess .top{display:flex;justify-content:space-between;align-items:baseline;}
.dp .sess .nm{font-family:var(--disp);font-weight:700;font-size:12px;letter-spacing:.08em;}
.dp .sess .vv{font-size:16px;font-weight:700;}
.dp .sess .sb{font-size:13px;color:var(--ink3);margin-top:4px;}
.dp .sbar{height:2px;background:var(--line2);margin-top:9px;position:relative;overflow:hidden;}
.dp .sbar i{position:absolute;inset:0 auto 0 0;}
.dp .sess .wp{display:flex;justify-content:space-between;margin-top:9px;}
.dp .sess .wp .l{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);}
.dp .sess .wp .r{font-size:11px;color:var(--ink2);}

.dp .ls{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px;}
.dp .ls .k{font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:var(--ink3);margin-bottom:8px;;font-weight:600}
.dp .ls .big{font-size:24px;font-weight:700;line-height:1;}
.dp .ls .s{font-size:11px;color:var(--ink3);margin-top:7px;}
.dp .tl{display:flex;flex-wrap:wrap;gap:3px;margin-top:14px;}
.dp .tl span{width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;}
.dp .tw{background:var(--gain-d);color:var(--gain);font-weight:700;} .dp .tlo{background:var(--loss-d);color:var(--loss);font-weight:700;} .dp .tb{background:var(--warn-d);color:var(--warn);font-weight:700;}   /* breakeven = orange (2026-08-29) */

.dp .rr{padding:11px 0;border-top:1px solid var(--line);}
.dp .rr:first-of-type{border-top:0;padding-top:2px;}
.dp .rr .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.dp .rr .rng{font-size:14px;min-width:58px;}
.dp .rr .nm{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);}
.dp .rr .ct{font-size:12px;color:var(--ink3);}
.dp .rr .pc{font-size:15px;font-weight:700;}
.dp .rrbar{height:2px;background:var(--line2);margin-top:8px;position:relative;overflow:hidden;}
.dp .rrbar i{position:absolute;inset:0 auto 0 0;}

/* MONTHLY TABLE */
.dp .mwrap{overflow-x:auto;}
.dp .mtbl{width:100%;border-collapse:collapse;}
.dp .mtbl th{font-size:12px;letter-spacing:.10em;text-transform:uppercase;color:var(--ink3);
  font-weight:500;text-align:right;padding:0 0 12px;border-bottom:1px solid var(--line);}
.dp .mtbl th:first-child{text-align:left;}
.dp .mtbl td{font-size:15px;font-weight:700;padding:13px 0;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;}
.dp .mtbl td:first-child{text-align:left;}
.dp .mtbl tr:hover td{background:var(--raise);}
.dp .mmname{display:flex;align-items:center;gap:11px;}
.dp .mmname .d{width:6px;height:6px;border-radius:50%;background:var(--gain);box-shadow:0 0 0 3px var(--gain-d);}
.dp .mmname .nm{font-family:var(--disp);font-weight:700;font-size:13px;letter-spacing:.08em;color:var(--ink);}

@media(max-width:920px){
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
 * --mono used to stay DM Mono so figures kept equal-width digits; DrawdownPanel then pointed BOTH
 * variables at the journal's live selection, and tabular-nums on .dp carried the alignment the
 * monospace face used to provide.
 *
 * AND A WORDS/NUMBERS SPLIT IS BACK, 2026-09-05 — this docblock said it was gone, so read the
 * --fig block at the top rather than this paragraph. The figures now take their own variable and
 * their own sizes: DM Mono first (matching the audit page), then Montserrat a few hours later at
 * his instruction, both times bigger than the words around them. The list of which classes count
 * as figures lives with that rule, not here.
 *
 * NO BACKTICKS ANYWHERE BELOW THIS LINE — this comment sits INSIDE the DP_CSS template literal, so
 * a single backtick (even in a comment) closes the string and breaks the module. Adding this note
 * cost exactly that mistake.
 */
.dp .rule .sub,
.dp .seg button,
.dp .kpi .k,
.dp .foot .k,
.dp .colh span,
.dp .empty-row,
.dp .dl .r .k,
.dp .sess .wp .l,
.dp .ls .k,
.dp .mtbl th{font-family:var(--disp);}
/* THE WHOLE STRATEGY-DRAWDOWN ROW IN THE DISPLAY FACE, his instruction 2026-09-05: "write the
   whole line in Playfair". The row is mostly words — the rank, the strategy tag and
   "50 trades · 18% loss" — so it reads as one line rather than three fonts in a row.
   NOTE this deliberately includes the drawdown figure at the end, which the --fig rule would
   otherwise put in Montserrat with the other numbers. "The whole line" is the later and more
   specific instruction, so it wins here; every figure elsewhere on the page is unaffected. */
.dp .lrow, .dp .lrow .lrank, .dp .lrow .ltag,
.dp .lrow .lmeta, .dp .lrow .lval{font-family:var(--disp);}
`;
