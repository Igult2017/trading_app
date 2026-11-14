/**
 * ddStyles.ts — core scoped CSS for the Drawdown panel's new design. Part 1 of 2.
 *
 * Ported from his HTML mock-up (2026-11-03). Four deliberate departures, each one plumbing rather
 * than taste:
 *
 *  1. THE SCOPE STAYS `.dp`. Journal.tsx exempts exactly this selector from the global rule that
 *     forces font-family/weight/letter-spacing on every descendant of `.journal-root`
 *     (a zero-specificity `:where(:not(.dp):not(.dp *))`). Rename the scope and the journal
 *     immediately clobbers every face below — so the name is load-bearing, not legacy.
 *  2. NO `.wrap` COLUMN. The mock-up centres an 80rem column with 1-2rem of side padding; his
 *     2026-09-15 instruction was the opposite: "reduce the spaces to the right and left of the
 *     drawdown page so that it can look like other pages". The journal's own <main> frames it.
 *  3. NO STICKY NAV, NO FOOTER. Both duplicate chrome the journal already draws, and the mock-up's
 *     footer carries another product's name.
 *  4. GAPS REDUCED, on his instruction: sections 32px -> 16px, card grids 24/16/14px -> 12px, card
 *     padding 24px -> 20px.
 *
 * ⚠ NO BACKTICKS ANYWHERE IN THIS FILE. It is one template literal; a stray backtick ends the CSS
 * mid-rule, and the build stays green while the page loses its styling at runtime.
 */
import { DD_TOKENS_DARK, DD_TOKENS_LIGHT } from '@/components/drawdown/ddTokens';
import { mpLightCss, EQUITY_CHART_TOKENS } from '@/components/shared/mpTokens';

const DD_CORE = `
.dp{
  ${DD_TOKENS_DARK}
  /* THREE FONT ROLES: --dd-serif titles and big figures (italic, his choice), --dd-mono anything
     columnar, --dd-sans running body. SANS follows the journal font picker through --disp, his
     2026-08-29 "it should inherit font type from journal". The other two are the AUDIT PAGE's faces,
     borrowed on his 2026-11-08 ask. Why these two, why the VARIABLE name must come FIRST, and why
     nothing here is below weight 500: docs/READABILITY.md, "The Drawdown faces". */
  --dd-serif:"Playfair Display Variable","Playfair Display",Georgia,serif;
  --dd-serif-w:600;
  --dd-mono:"Times New Roman",Georgia,"Liberation Serif",serif;
  --dd-sans:var(--disp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);
  background:var(--bg); color:var(--ink);
  font-family:var(--dd-sans); line-height:1.5;
  /* Keeps numeric columns from going ragged; faces without the feature just ignore it. */
  font-variant-numeric:tabular-nums;
  min-height:100%; -webkit-font-smoothing:antialiased;
  /* THE PAGE'S SPACING LIVES IN HERE, 2026-11-14. It used to be the journal's padding around the
     panel (14px top, 6px left), painted #0d1117 against this panel's #0A0D14 - a visible frame
     along the top and the sidebar edge, which he marked and asked to be removed. Inside the
     panel it is painted the panel's own colour, so the cards keep their room and there is no frame. */
  padding:16px 8px 28px;
}
/* THE ANALYTICS CHART'S LIGHT PALETTE. That chart (shared/EquityCurveChart) colours itself from
   --mp-* variables; Analytics sets them on its own root, and on this page they are set here - ONLY
   the eleven it draws with, because the full palette carries Analytics' chip colours too, and no yellow
   comes onto this page. */
.journal-light .dp{ ${DD_TOKENS_LIGHT} ${mpLightCss(EQUITY_CHART_TOKENS)} }

.dp *{ box-sizing:border-box; }
.dp ::selection{ background:var(--t-accent-30); color:var(--accent-soft); }
.dp svg.ic{ display:block; }

/* ── LAYOUT ─────────────────────────────────────────────────────────────────── */
/* THE GAPS BETWEEN CARDS, reduced twice on his ask: 32 -> 16 (2026-11-03) -> 4 (2026-11-08). The
   vertical space counts as a gap between cards too, so it moves WITH the grid - leaving it at 16
   would have answered half the ask. The audit page he pointed at uses 3. */
.dp .dd-stack > * + *{ margin-top:4px; }
.dp .dd-grid{ display:grid; gap:4px; }
.dp .dd-g3,.dp .dd-g2{ grid-template-columns:repeat(1,1fr); }
/* THE DASHBOARD'S ROW for the six headline cards, 2026-11-14: two on a phone, three below 900px,
   six above - the same steps Journal.tsx gives the Dashboard's own cards. */
.dp .dd-g6{ grid-template-columns:repeat(2,1fr); }
@media (min-width:640px){
  .dp .dd-g6{ grid-template-columns:repeat(3,1fr); }
}
@media (min-width:768px){
  .dp .dd-g2{ grid-template-columns:repeat(2,1fr); }
}
@media (min-width:900px){
  .dp .dd-g6{ grid-template-columns:repeat(6,1fr); }
}
@media (min-width:1024px){
  .dp .dd-g3{ grid-template-columns:repeat(3,1fr); }
}

/* ── SURFACES ───────────────────────────────────────────────────────────────── */
.dp .dd-card{
  background:var(--t-card); border:1px solid var(--t-line); border-radius:4px;
  padding:20px;
}
.dp .dd-inner{
  background:var(--t-inner); border:1px solid var(--t-line);
  padding:12px; border-radius:3px;
  display:flex; justify-content:space-between; align-items:center;
}
.dp .dd-inner-sm{
  padding:10px; border-radius:3px;
  background:var(--t-inner); border:1px solid var(--t-line-soft);
}

/* ── TYPE ───────────────────────────────────────────────────────────────────── */
/* UPRIGHT, NOT ITALIC. These titles were italic because his 2026-11-03 mock-up drew them that way;
   on 2026-11-09 he asked for the italics out. Noted so the old reasoning is not read back as a rule
   and the italic quietly returns. */
.dp .dd-title{
  font-family:var(--dd-serif); font-weight:700;
  color:var(--ink-strong); letter-spacing:-0.01em; margin:0;
}
/* THE AUDIT PAGE'S SCALE, 2026-11-09 on his "copy font types and sizes from the audit page".
   That page runs on 12.5 / 13 / 14 / 17 / 22 and nothing else; its headings are 17. */
.dp h2.dd-title{ font-size:17px; } .dp h3.dd-title{ font-size:17px; }
.dp .dd-muted{ font-size:12.5px; color:var(--ink-dim); margin:0; }
.dp .dd-mono{ font-family:var(--dd-mono); } .dp .dd-serif{ font-family:var(--dd-serif); font-weight:var(--dd-serif-w); }

/* ── PILLS (ddMonthly's LIVE marker — the banner that also used these is gone) ─ */
.dp .dd-pill{
  font-size:12.5px; font-family:var(--dd-mono); font-weight:700;
  padding:2px 8px; border-radius:9999px; white-space:nowrap;
}
.dp .dd-pill-emerald{ background:var(--t-emerald-20); color:var(--emerald); border:1px solid var(--t-emerald-30); }

/* ── COLOUR + WEIGHT UTILITIES (his class names, mapped onto the tokens) ────── */
.dp .c-strong{ color:var(--ink-strong); } .dp .c-ink{ color:var(--ink); }
.dp .c-soft{ color:var(--ink-soft); } .dp .c-dim{ color:var(--ink-dim); }
.dp .c-faint{ color:var(--ink-faint); } .dp .c-accent{ color:var(--accent); }
.dp .c-accent-soft{ color:var(--accent-soft); } .dp .c-emerald{ color:var(--emerald); }
.dp .c-rose{ color:var(--rose); } .dp .c-rose-mid{ color:var(--rose-mid); }
.dp .fw-bold{ font-weight:700; } .dp .fw-semi{ font-weight:600; }
/* ⚠ THE WHOLE SCALE IS THE AUDIT PAGE'S, 2026-11-09. It runs 12.5 for almost everything (77 uses),
   then 13, 14, 17 and 22 - and nothing below 12.5. This page used to go down to 10px, so the three
   small steps all collapse onto 12.5. That RAISES the smallest text, which is a bonus rather than a
   side effect: the 10px captions are the ones that failed the readability floor a day earlier. */
.dp .fs-10{ font-size:12.5px; } .dp .fs-11{ font-size:12.5px; } .dp .fs-xs{ font-size:12.5px; }
.dp .fs-sm{ font-size:13px; } .dp .fs-base{ font-size:14px; } .dp .fs-2xl{ font-size:22px; }
.dp .dd-between{ display:flex; justify-content:space-between; align-items:center; }
.dp .dd-colbetween{ display:flex; flex-direction:column; justify-content:space-between; }
`;

export const DD_CORE_CSS = DD_CORE;
