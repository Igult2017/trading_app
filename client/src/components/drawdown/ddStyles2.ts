/**
 * ddStyles2.ts — section CSS for the Drawdown panel's new design. Part 2 of 2.
 *
 * Split from `ddStyles.ts` only to keep both files inside the 200-line limit; the two are
 * concatenated by `ddPanelCss()` below and there is no other reason for the boundary.
 *
 * ⚠ NO BACKTICKS ANYWHERE IN THIS FILE — same reason as part 1: one stray backtick ends the
 * template literal mid-rule and the page silently loses its styling while the build stays green.
 */
import { DD_CORE_CSS } from '@/components/drawdown/ddStyles';
import { MONTH_DAYS_CSS } from '@/components/drawdown/monthDays';

const DD_SECTIONS = `
/* ── TABS ───────────────────────────────────────────────────────────────────── */
.dp .dd-tabs{
  display:flex; align-items:center; gap:4px; flex-wrap:wrap;
  background:var(--surface-deep); padding:4px; border-radius:4px;
  border:1px solid var(--line); font-size:12.5px;
}
.dp .dd-tab{
  padding:6px 12px; border-radius:3px; border:none; background:transparent;
  color:var(--ink-dim); cursor:pointer; transition:color .2s,background .2s;
  font-family:var(--dd-sans); font-weight:500;
}
.dp .dd-tab:hover{ color:var(--ink-strong); }
/* ⚠ THE SELECTED TAB KEEPS DARK TEXT IN BOTH THEMES. A light-mode override to white measured
   3.19:1 on the chip - unreadable; dark text is 6.33:1. Measured, not eyeballed. */
.dp .dd-tab[aria-selected="true"]{
  background:var(--accent-mid); color:#020617; font-weight:700;
}
.dp .dd-tab:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }

/* ── TABLES ─────────────────────────────────────────────────────────────────── */
.dp .dd-twrap{ overflow-x:auto; border-radius:4px; border:1px solid var(--t-line); }
.dp .dd-twrap table{
  width:100%; text-align:left; font-size:12.5px; font-family:var(--dd-mono); border-collapse:collapse;
}
.dp .dd-twrap thead{
  background:var(--t-inner); color:var(--ink-dim);
  border-bottom:1px solid var(--line); text-transform:uppercase; letter-spacing:.05em;
}
.dp .dd-twrap thead th{ padding:12px 16px; font-weight:600; white-space:nowrap; }
.dp .dd-twrap tbody tr{ border-top:1px solid var(--t-line-soft); transition:background .2s; }
.dp .dd-twrap tbody tr:first-child{ border-top:none; }
.dp .dd-twrap tbody td{ padding:14px 16px; }
.dp .dd-rowhover:hover{ background:var(--t-card-hi); }
.dp .dd-right{ text-align:right; }
.dp .dd-tag{
  background:var(--t-line); padding:2px 8px; border-radius:4px;
  color:var(--ink-strong); font-weight:500;
}

/* ── BARS ───────────────────────────────────────────────────────────────────── */
/* THE AUDIT PAGE'S BAR SIZE (2026-11-09): 3px, 1px corner, not an 8px pill. .dd-bigbar is the
   exception. NO BACKTICKS in here - this file is one template literal and one would end it. */
.dp .dd-track{ background:var(--t-line); height:3px; border-radius:1px; overflow:hidden; }
.dp .dd-track-w{ width:128px; min-width:72px; }
.dp .dd-track > i{ display:block; height:100%; border-radius:1px; background:var(--rose-mid); }
/* ⚠ STAYS 20px: a LABELLED STACKED bar, not a progress bar - the percentages print INSIDE it. */
.dp .dd-bigbar{
  width:100%; background:var(--surface-deep); height:20px; border-radius:3px;
  overflow:hidden; border:1px solid var(--line); display:flex;
}
/* ⚠ --bar-ink, NOT a fixed near-black: dark text on the lightest fill was 4.29:1 in light mode,
   under the floor, so it flips to white there. */
.dp .dd-bigbar > i{
  height:100%;
  display:flex; align-items:center; justify-content:flex-end; padding:0 8px;
  font-size:12.5px; font-family:var(--dd-mono); font-weight:700; color:var(--bar-ink);
}
.dp .dd-scale{
  display:flex; justify-content:space-between; font-size:12.5px;
  color:var(--ink-faint); font-family:var(--dd-mono); padding-top:8px;
}
.dp .dd-bucket{ background:var(--t-inner); border:1px solid var(--t-line); padding:12px; border-radius:4px; }
.dp .dd-bucket + .dd-bucket{ margin-top:12px; }
.dp .dd-bucket-track{
  width:100%; background:var(--surface); height:3px; border-radius:1px;
  overflow:hidden; margin-top:6px;
}
.dp .dd-bucket-track > i{ display:block; height:100%; }

/* ── NOTES, INSIGHTS, WARNINGS ─────────────────────────────────────────────── */
.dp .dd-note{
  padding-top:8px; font-size:12.5px; color:var(--ink-dim);
  border-top:1px solid var(--t-line); display:flex; align-items:center; gap:6px;
}
.dp .dd-insight{
  background:var(--t-blue-10); border:1px solid var(--t-blue-20); border-radius:4px;
  padding:12px; font-size:12.5px; color:var(--insight-ink);
  display:flex; align-items:flex-start; gap:10px; line-height:1.6;
}
.dp .dd-insight p{ margin:0; }
.dp .dd-warn{
  background:var(--warn-grad); border:1px solid var(--t-rose-40);
  border-radius:4px; padding:14px;
}
.dp .dd-warn p{ margin:0; }
.dp .dd-warn-head{
  display:flex; align-items:center; gap:8px; color:var(--rose);
  font-weight:700; font-size:12.5px; margin-bottom:8px;
}

/* ── TRADE SEQUENCE ─────────────────────────────────────────────────────────── */
.dp .dd-seq{
  display:flex; flex-wrap:wrap; align-items:center; gap:5px; padding:10px;
  background:var(--surface-deep); border-radius:4px; border:1px solid var(--line);
}
/* ONE LETTER, FIXED SQUARE: padding sized for "Break-even" would shrink-wrap a single glyph. */
.dp .dd-seq-chip{
  width:26px; height:26px; padding:0; flex:0 0 auto; border-radius:3px;
  display:flex; align-items:center; justify-content:center;
  font-family:var(--dd-mono); font-weight:700; font-size:13px; line-height:1;
  transition:transform .2s; white-space:nowrap;
}
@media (prefers-reduced-motion:no-preference){ .dp .dd-seq-chip:hover{ transform:scale(1.1); } }
.dp .dd-seq-win{ background:var(--t-emerald-20); color:var(--emerald); border:1px solid var(--t-emerald-30); }
.dp .dd-seq-loss{ background:var(--t-rose-20); color:var(--rose); border:1px solid var(--t-rose-40); }
.dp .dd-seq-be{ background:var(--t-line); color:var(--ink-soft); border:1px solid var(--line-strong); }

/* ── MONTHLY LEDGER ────────────────────────────────────────────────────────── */
/* The expander and day grid are his 2026-10-25 ask; the mock-up has neither, and dropping them
   would have removed a feature he specifically requested. */
.dp .dd-mrow{ cursor:pointer; }
.dp .dd-mrow:focus-visible{ outline:2px solid var(--accent); outline-offset:-2px; }
.dp .dd-mname{ display:flex; align-items:center; gap:8px; white-space:nowrap; }
/* His ledger's marker and the expand affordance in one. FULL opacity, not the 55% it had as a
   trailing hint - it carries the month's dominant cause, and a faded signal is not one. */
.dp .dd-mchev{ display:inline-block; font-size:12.5px; flex-shrink:0; transition:transform .15s; }
.dp .dd-mchev.open{ transform:rotate(90deg); }
.dp .dd-empty{ font-size:12.5px; color:var(--ink-dim); }
${MONTH_DAYS_CSS}
`;

/** The whole panel's stylesheet, in one string. */
export function ddPanelCss(): string {
  return DD_CORE_CSS + DD_SECTIONS;
}
