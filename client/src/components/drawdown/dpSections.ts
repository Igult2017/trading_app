/**
 * dpSections.ts — the Drawdown page's PER-SECTION styles (.dp scope).
 *
 * Split out of dpStyles.ts on 2026-09-27 when adopting the Metrics page's design pushed that file
 * past the 200-line limit. dpStyles.ts keeps the palette hook-up, the base type and the shared
 * chrome (panels, chips, KPI cards); everything that styles ONE section lives here.
 *
 * NO BACKTICKS IN THIS FILE — it is one big template literal; a backtick here ends the CSS.
 */
export const DP_SECTIONS_CSS = `
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

/* LOSS CONTRIBUTION — two bar graphs across the whole row (lossBars.tsx) */
/* His request, 2026-09-15, after a sample bar graph: "two seperate bar graphs. One for sessions and one
   for instruments and their loss shares". They replaced two pie charts. Each graph: a left axis of
   percentage gridlines, one solid bar per group rising from the baseline with its share above it, and the
   names under the bars with the actual loss beneath. The graphs sit side by side, stacked under 760px.
   The axis column is 46px and the name row is offset by the same (plus the area's 1px border) so each
   name sits under its own bar. The plot's top margin is headroom for the value above the tallest bar. */
.dp .lgraphs{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:start;}
.dp .lgraph{min-width:0;}
/* The tone classes are PREFIXED. They were .instr / .sess until Playwright showed the session graph sitting
   14px low under a stray rule: .dp .sess is the Structural Diagnostics session row, and its padding and top
   border landed on the graph. */
.dp .lgraph.lg-instr{--bar:var(--bar-instr);}
.dp .lgraph.lg-sess{--bar:var(--bar-sess);}
/* A crowded graph scrolls sideways inside itself rather than squeezing: lossBars.tsx gives .lg-inner a
   minimum width of 62px per bar, so names and loss figures stay whole on a phone. */
.dp .lg-scroll{overflow-x:auto;overflow-y:hidden;}
.dp .lg-plot{display:grid;grid-template-columns:46px minmax(0,1fr);height:280px;}
.dp .lg-axis,.dp .lg-area{position:relative;margin-top:26px;}
.dp .lg-axis span{position:absolute;right:10px;transform:translateY(50%);font-size:11px;font-weight:600;
  color:var(--ink3);white-space:nowrap;line-height:1;}
.dp .lg-area{border-left:1px solid var(--line2);border-bottom:1px solid var(--line2);}
.dp .lg-grid{position:absolute;left:0;right:0;height:0;border-top:1px dashed var(--line);}
.dp .lg-bars{position:absolute;inset:0;display:grid;column-gap:12px;padding:0 10px;}
.dp .lg-col{display:flex;align-items:flex-end;justify-content:center;min-width:0;height:100%;}
.dp .lg-bar{position:relative;width:min(64px,76%);min-height:2px;background:var(--bar);border-radius:3px 3px 0 0;}
.dp .lg-val{position:absolute;left:50%;bottom:100%;transform:translateX(-50%);padding-bottom:6px;
  font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;}
.dp .lg-names{display:grid;column-gap:12px;padding:0 10px;margin:10px 0 0 47px;}
.dp .lg-name{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;text-align:center;}
/* 11px is this page's floor (docs/READABILITY.md). A long name wraps at a space or after a slash, never
   inside a word: the squeezed first version turned EURUSD into EURUS / D. */
.dp .lg-name .nm{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink2);font-weight:600;
  line-height:1.35;overflow-wrap:normal;word-break:normal;max-width:100%;}
.dp .lg-name .lp{font-size:12px;font-weight:700;}
@media(max-width:760px){.dp .lgraphs{grid-template-columns:1fr;gap:44px;}}

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
