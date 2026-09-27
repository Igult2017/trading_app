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
import { DP_TOKENS_DARK, DP_TOKENS_LIGHT,
         DP_TOKENS_MONTHLY_DARK, DP_TOKENS_MONTHLY_LIGHT } from '@/components/drawdown/dpTokens';
import { DP_SECTIONS_CSS } from '@/components/drawdown/dpSections';

const DP_CORE_CSS = `
.dp{
  /* PALETTE — from components/drawdown/dpTokens.ts, which maps these names onto the METRICS page's
     shared palette (components/shared/mpTokens.ts). His instruction 2026-09-27: "copy the design and
     colors used in metrics page to be copied and use in the drawdown page."
     The NAMES are unchanged, so every rule below still reads var(--ink) / var(--gain) / var(--line)
     exactly as it did; only the values behind them moved. The measurement history lives in
     mpTokens.ts and docs/READABILITY.md. */
  ${DP_TOKENS_DARK}
  /* BOTH font roles follow the journal font: 'inherit', NOT a named face (changed 2026-08-29 on his
     "it should inherit font type from journal").
     WHY IT USED TO DIVERGE: these fell back to a hardcoded 'Playfair Display'. The .dp subtree is
     deliberately exempt from the journal's global font rule (Journal.tsx — that exemption exists so
     icon fonts are not clobbered into letters), so while the fallback was in force this page kept a
     face the journal had moved off. 'inherit' resolves to whatever .journal-root is actually set to,
     so the page follows the journal by default instead of only when a prop happens to be passed.
     DrawdownPanel still overrides both from the live selection.
     NO BACKTICKS IN THIS FILE — it is one big template literal; a backtick here ends the CSS. */
  --mono:inherit;
  --disp:inherit;
  /* THE FIGURES FONT — the DISPLAY face, the same Playfair the month names are set in. He pointed
     straight at those: "Playfair is the one in image 3 please use it in numbers too like i told you."
     STILL A SEPARATE VARIABLE from --disp: it keeps tabular-nums on the figures so the monthly
     table's seven columns cannot go ragged, and it is the single handle for sizing every number.
     Note --mono is NOT a mono font — it is this panel's BODY font. A variable named mono holding
     something else is the trap docs/READABILITY.md records; check what it holds, not what it is
     called. */
  --fig:var(--disp);
  background:var(--bg); color:var(--ink); font-family:var(--mono);
  /* Keeps the monthly table's seven columns from going ragged whatever the reading face is (Times
     New Roman since 2026-09-14; Montserrat before, whose digits are proportional). On a face without
     the feature it is simply ignored, so it cannot hurt. */
  font-variant-numeric:tabular-nums;
  min-height:100%; -webkit-font-smoothing:antialiased;
  /* Top gap comes from <main> (14px, uniform with every other journal page). NO SIDE PADDING — his
     "reduce the spaces to the right and left of the drawdown page so that it can look like other pages"
     (2026-09-15). It was clamp(14px,3.4vw,46px) a side, measured at 46px on a 1366px screen, where Audit
     and Trade Vault have 6px on the left and nothing on the right. <main> now frames this page the same
     way (Journal.tsx); only the bottom padding stays here. */
  padding:0 0 30px;
}
/* Light theme — remap every token; the layout/typography is unchanged. */
.journal-light .dp{
  /* The same names, the shared palette's LIGHT values (dpTokens.ts). Measured there, not eyeballed:
     this theme had three real failures in August (--ink3 at 2.56:1, below AA outright), which is why
     every value that lands here is checked against the surface it actually sits on. */
  ${DP_TOKENS_LIGHT}
}
/* Chart axes are figures too — dates and values — so they follow --fig with the numbers rather
   than the body font. !important because the journal's own svg-text rule also targets these. */
.journal-root .dp svg text{font-family:var(--fig)!important;}

/* NO WIDTH CAP. max-width:1180px centred the page and turned any wider screen into empty margins —
   measured at 278px a side on a 1920px screen. The other journal pages fill the width; so does this one. */
/* 10px, matching Metrics' .mp-page. It was 46px, which is what a page with NO containers needs to
   keep its sections apart; the panels now do that job, so the big gap would just leave holes. */
.dp .shell{display:flex;flex-direction:column;gap:10px;}

/* generic type */
.dp .disp{font-family:var(--disp);}
.dp .num{font-variant-numeric:tabular-nums;letter-spacing:-.01em;font-weight:700;}
/* THE FIGURES — see --fig above for which face they take and why it changed.
   Listed one class at a time rather than swept with a broad selector, because several classes
   that LOOK numeric are not: bare .t is a text label (the equity caption), and .ls .s reads
   "before recovery" / "no data". Those keep the body font. .lg-axis span, .lg-val and
   .lg-name .lp are the loss-share graphs' axis, bar values and actual losses.
   .mtbl td is the monthly table he circled — every cell in it but the month name is a figure. */
.dp .num, .dp .wlb,
.dp .kpi .v, .dp .foot .v, .dp .dl .r .v, .dp .rp .v,
.dp .sess .vv, .dp .sess .sb,
.dp .ls .big,
.dp .rr .rng, .dp .rr .pc, .dp .rr .ct,
.dp .lg-axis span, .dp .lg-val, .dp .lg-name .lp,
.dp .mtbl td{font-family:var(--fig);}
.dp .loss{color:var(--loss);} .dp .gain{color:var(--gain);} .dp .warn{color:var(--warn);}
.dp .dim{color:var(--ink2);} .dp .mut{color:var(--ink3);}
/* Wins / losses / breakevens as coloured figures (2026-08-29) — replaces the old "8L" / "7W"
   letter notation. The slash is deliberately dimmer than the numbers so the eye lands on the
   counts, and the numbers are 600-weight so colour is not doing all the work. */
.dp .wlb{display:inline-flex;align-items:baseline;gap:2px;font-variant-numeric:tabular-nums;font-weight:700;}
.dp .wlb .sl{color:var(--ink3);font-weight:400;}

/* ── SECTION HEADER = THE METRICS PANEL TITLE BAR (2026-09-27) ────────────────────────────────
   Metrics wraps every block in a rounded panel whose title sits in a darker strip across the top,
   with its badge or controls at the right end. That bar is what gives that page its look, so the
   drawdown's section rule becomes the same bar.

   The rotated green diamond ("pin") is kept — it is this page's own mark and costs nothing — but it
   now sits inside the bar rather than on a bare rule.

   ⚠ .mtbl-sec IS EXEMPT. His instruction was explicit: do not change how "Monthly Drawdown /
   Dominant Cause per Month" is displayed. That section keeps the OLD flat rule, below. */
.dp .panel{background:var(--panel);border:0.5px solid var(--bd-inner);border-radius:10px;overflow:hidden;}
.dp .panel > .rule{display:flex;align-items:center;justify-content:space-between;gap:18px;
  background:var(--panelbar);border-bottom:0.5px solid var(--bd-inner);
  padding:9px 12px;margin-bottom:0;}
.dp .panel > .body{padding:10px 12px 12px;}
.dp .rule{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;
  border-bottom:1px solid var(--line);padding-bottom:13px;margin-bottom:24px;}
.dp .rule .lab{display:flex;align-items:center;gap:11px;}
.dp .rule .pin{width:6px;height:6px;background:var(--gain);transform:rotate(45deg);}
/* THE TITLE KEEPS ITS ORIGINAL SIZE, WEIGHT AND INK — 12.5px / 700 / --ink.
   It was briefly 11px / 600 / --ink3 to copy the Metrics title bar exactly, and that was a mistake
   he spotted immediately ("the white theme text visibility is poor"). Three things went wrong in
   one line: smaller, lighter in weight, and the dimmest colour tier.
   MEASURED WITH INK, which is the measure docs/READABILITY.md says matches what the eye reports:
   Playfair at 11px/600 lays down 4.80% ink against Times' 5.83% - the THINNEST point on the curve.
   At 12.5px/700 it is 6.02%. The panel BAR stays (that is the design he asked for); only the title
   inside it stops being small, light and dim. */
.dp .rule .t{font-family:var(--disp);font-weight:700;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);}
.dp .rule .sub{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);;font-weight:700}
/* ⚠ THE MONTHLY SECTION IS PINNED TO THE OLD PALETTE AND THE OLD HEADING — his instruction:
   "dont change how Monthly Drawdown / Dominant Cause per Month is displayed". Re-declaring the
   original tokens on this subtree keeps its columns, rows, text and background exactly as they
   were, while the rest of the page follows the Metrics colours. */
/* The color PROPERTY is re-declared, not just the variables. .dp sets color:var(--ink) ONCE on itself, and
   every cell INHERITS that already-resolved value - it does not re-read the variable. Redefining
   --ink here alone left the month-name cells on the new palette's #ECEEF2 while everything with its
   own colour rule correctly showed #F2F5F0. Measured against the pre-change build, 3 cells of 28. */
.dp .mtbl-sec{${DP_TOKENS_MONTHLY_DARK}color:var(--ink);}
.journal-light .dp .mtbl-sec{${DP_TOKENS_MONTHLY_LIGHT}color:var(--ink);}
.dp .mtbl-sec > .rule{border-bottom:1px solid var(--line);padding-bottom:13px;margin-bottom:24px;background:none;}
/* THE LIVE BADGE on the current month's row. Measured on the row it actually sits on, which tints
   itself rgba(96,165,250,0.06):
       dark  rgb(14,21,31)    7.21:1  fine - UNCHANGED, still #60a5fa
       light rgb(245,250,255) 2.42:1  FAIL - this is the one he asked to have fixed
   So only the light value moves, to #1d4ed8 (6.38:1) - already this codebase's light-theme blue
   (Notifications.tsx), not a new colour. It was also 8px, under this page's 11px floor. */
.dp .mtbl-sec .live-badge{color:#60a5fa;}
.journal-light .dp .mtbl-sec .live-badge{color:#1d4ed8;border-color:rgba(29,78,216,.5);}
/* No .t override here any more: the base rule above is once again 12.5px / 700 / --ink, which is
   what this section always had, so restating it would be dead code. */

/* CHIPS — Metrics shows a status figure as a pill with its own background and border. */
.dp .chip{display:inline-flex;align-items:center;font-size:11px;font-weight:700;
  padding:1px 6px;border-radius:20px;letter-spacing:.04em;white-space:nowrap;line-height:16px;
  background:var(--chip-gray-bg);color:var(--chip-gray);border:0.5px solid var(--chip-gray-bd);}
.dp .chip.gain{background:var(--gain-d);color:var(--gain);border-color:var(--chip-green-bd);}
.dp .chip.loss{background:var(--loss-d);color:var(--loss);border-color:var(--chip-red-bd);}
.dp .chip.warn{background:var(--warn-d);color:var(--warn);border-color:var(--chip-amber-bd);}
.dp .chip.info{background:var(--blue-d);color:var(--blue);border-color:var(--blue-bd);}

/* toggle */
.dp .seg{display:inline-flex;gap:22px;}
.dp .seg button{font-family:var(--mono);font-size:11.5px;letter-spacing:.10em;text-transform:uppercase;font-weight:700;
  color:var(--ink3);background:none;border:0;padding:0 0 4px;cursor:pointer;border-bottom:1.5px solid transparent;transition:.16s;}
.dp .seg button:hover{color:var(--ink2);}
.dp .seg button.on{color:var(--ink);border-bottom-color:var(--gain);}

/* HERO — the "Tracking Drawdown" line and its Status readout were removed 2026-09-14 (his
   instruction, "remove this part of the drawdown page"), and the styles only they used went with them. */

/* KPI CARDS — the Metrics page's headline cards, copied on 2026-09-27 ("everything else you can
   copy from the metrics page including the header"). Each is its own raised card with a hairline
   border and a radius, instead of four flat cells split by rules.

   THE TYPE SCALE IS NOT ARBITRARY AND SHOULD NOT BE RE-TUNED. MetricsPanel records that he asked
   for exactly these on 2026-09-15 — "There is a visibility problem in the text and numbers i have
   ticked. I suggest increasing font sizes and using playfair" — and that 13px rasterises Playfair
   better than the sizes either side (docs/READABILITY.md, cause 1). Caption 13/700, figure 20/700. */
.dp .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:4px;}
.dp .kpi{background:var(--card);border:0.5px solid var(--bd-outer);border-radius:8px;padding:12px 14px;}
.dp .kpi .k{font-size:13px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--kpi-cap);margin-bottom:6px;}
.dp .kpi .v{font-size:20px;font-weight:700;line-height:1.15;letter-spacing:-.01em;white-space:nowrap;}

/* chart */
.dp .chart-wrap{position:relative;margin-top:14px;}
.dp .chart-wrap svg{display:block;width:100%;height:auto;}
.dp .chart-foot{display:flex;flex-wrap:wrap;gap:28px 40px;margin-top:16px;}
.dp .foot .k{font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink3);;font-weight:700}
.dp .foot .v{font-size:16px;font-weight:700;margin-top:5px;}
.dp .foot .v .u{color:var(--ink3);font-size:11px;margin-left:6px;}
`;

/** The whole stylesheet: shared chrome first, then the per-section rules. */
export const DP_CSS = DP_CORE_CSS + DP_SECTIONS_CSS;
