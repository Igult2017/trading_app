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
  padding-bottom:28px;
}
.journal-light .dp{ ${DD_TOKENS_LIGHT} }

.dp *{ box-sizing:border-box; }
.dp ::selection{ background:var(--t-accent-30); color:var(--accent-soft); }
.dp svg.ic{ display:block; }

/* ── LAYOUT ─────────────────────────────────────────────────────────────────── */
/* THE GAPS BETWEEN CARDS, reduced twice on his ask: 32 -> 16 (2026-11-03) -> 4 (2026-11-08). The
   vertical space counts as a gap between cards too, so it moves WITH the grid - leaving it at 16
   would have answered half the ask. The audit page he pointed at uses 3. */
.dp .dd-stack > * + *{ margin-top:4px; }
.dp .dd-grid{ display:grid; gap:4px; }
.dp .dd-g4,.dp .dd-g5,.dp .dd-g3,.dp .dd-g2{ grid-template-columns:repeat(1,1fr); }
@media (min-width:640px){
  .dp .dd-g4,.dp .dd-g5{ grid-template-columns:repeat(2,1fr); }
}
@media (min-width:768px){
  .dp .dd-g2{ grid-template-columns:repeat(2,1fr); }
}
@media (min-width:1024px){
  .dp .dd-g4{ grid-template-columns:repeat(4,1fr); }
  .dp .dd-g3{ grid-template-columns:repeat(3,1fr); }
  .dp .dd-g5{ grid-template-columns:repeat(5,1fr); }
}

/* ── SURFACES ───────────────────────────────────────────────────────────────── */
.dp .dd-card{
  background:var(--t-card); border:1px solid var(--t-line); border-radius:4px;
  padding:20px;
}
.dp .dd-card-xl{ box-shadow:0 20px 25px -5px rgba(0,0,0,0.30); position:relative; }
.journal-light .dp .dd-card-xl{ box-shadow:0 4px 12px -4px rgba(15,23,42,0.10); }
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

/* ── HEADER (the mock-up's nav, re-cast as an ordinary panel header) ────────── */
.dp .dd-head{
  display:flex; flex-direction:column; gap:12px; justify-content:space-between;
  padding-bottom:14px; border-bottom:1px solid var(--t-line);
}
@media (min-width:768px){ .dp .dd-head{ flex-direction:row; align-items:center; } }
.dp .dd-brand{ display:flex; align-items:center; gap:12px; }
.dp .dd-controls{ display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.dp .dd-ctl{
  display:flex; align-items:center; gap:8px;
  background:var(--surface); border:1px solid var(--line); border-radius:4px;
  padding:4px 10px; font-size:12.5px; color:var(--ink-soft);
}
.dp .dd-ctl select{
  background:transparent; color:var(--ink-soft); font-weight:500;
  border:none; outline:none; cursor:pointer; padding:5px 4px;
  font-family:var(--dd-sans); font-size:12.5px; max-width:min(60vw,22rem);
}
.dp .dd-ctl select option{ background:var(--surface); color:var(--ink); }
.dp .dd-ctl select:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }

/* ── BANNER ─────────────────────────────────────────────────────────────────── */
.dp .dd-banner{
  background:var(--t-card); border:1px solid var(--t-accent-30); border-radius:4px;
  padding:16px; display:flex; flex-direction:column; gap:12px;
  align-items:flex-start; justify-content:space-between; position:relative; overflow:hidden;
}
@media (min-width:768px){ .dp .dd-banner{ flex-direction:row; align-items:center; } }
.dp .dd-banner-glow{
  position:absolute; top:0; right:0; width:256px; height:100%;
  background:linear-gradient(to left,var(--t-accent-10),transparent); pointer-events:none;
}
.dp .dd-banner-left{ display:flex; align-items:flex-start; gap:14px; position:relative; }
.dp .dd-banner-meta{
  display:flex; align-items:center; gap:12px; flex-shrink:0; position:relative;
  font-size:12.5px; font-family:var(--dd-mono); color:var(--ink-dim);
  background:var(--t-inner); border:1px solid var(--t-line);
  padding:8px 14px; border-radius:4px;
}
.dp .dd-pill{
  font-size:12.5px; font-family:var(--dd-mono); font-weight:700;
  padding:2px 8px; border-radius:9999px; white-space:nowrap;
}
.dp .dd-pill-emerald{ background:var(--t-emerald-20); color:var(--emerald); border:1px solid var(--t-emerald-30); }
.dp .dd-pill-rose{ background:var(--t-rose-20); color:var(--rose); border:1px solid var(--t-rose-40); }

/* ── KPI CARDS ──────────────────────────────────────────────────────────────── */
.dp .dd-kpi{
  background:var(--t-card); border:1px solid var(--t-line); border-radius:4px;
  padding:16px; transition:background .3s,border-color .3s; position:relative; overflow:hidden;
}
.dp .dd-kpi:hover{ background:var(--t-card-hi); border-color:var(--line-strong); }
.dp .dd-kpi-head{
  display:flex; align-items:center; justify-content:space-between;
  color:var(--ink-dim); margin-bottom:8px; gap:8px;
}
.dp .dd-kpi-label{ font-size:12.5px; font-weight:500; text-transform:uppercase; letter-spacing:.05em; }
.dp .dd-kpi-val{ display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.dp .dd-kpi-num{
  /* 30->22px AND weight 400->600, 2026-11-08: he ticked -0.46%. 400 is the hairline cut that
     vanishes in this face; his own fix was always the weight axis, never a smaller size alone. */
  font-size:22px; font-weight:var(--dd-serif-w); font-family:var(--dd-serif);
  color:var(--ink-strong); letter-spacing:-0.01em;
}
.dp .dd-kpi-chip{ font-size:12.5px; font-family:var(--dd-mono); padding:2px 6px; border-radius:4px; }
.dp .chip-rose{ color:var(--rose); background:var(--t-rose-10); }
.dp .chip-accent{ color:var(--accent); background:var(--t-accent-10); }
.dp .chip-emerald{ color:var(--emerald); background:var(--t-emerald-10); }
.dp .chip-slate{ color:var(--ink-dim); background:var(--t-line); }
.dp .dd-kpi-foot{
  margin-top:12px; padding-top:12px; border-top:1px solid var(--t-line-soft);
  display:flex; justify-content:space-between; gap:8px; font-size:12.5px; color:var(--ink-dim);
}

/* ── COLOUR + WEIGHT UTILITIES (his class names, mapped onto the tokens) ────── */
.dp .c-strong{ color:var(--ink-strong); } .dp .c-ink{ color:var(--ink); }
.dp .c-soft{ color:var(--ink-soft); } .dp .c-dim{ color:var(--ink-dim); }
.dp .c-faint{ color:var(--ink-faint); } .dp .c-accent{ color:var(--accent); }
.dp .c-accent-soft{ color:var(--accent-soft); } .dp .c-emerald{ color:var(--emerald); }
.dp .c-rose{ color:var(--rose); } .dp .c-rose-mid{ color:var(--rose-mid); } .dp .c-blue{ color:var(--blue); }
.dp .fw-bold{ font-weight:700; } .dp .fw-semi{ font-weight:600; } .dp .fw-med{ font-weight:500; }
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
