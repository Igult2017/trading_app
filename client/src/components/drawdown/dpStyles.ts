/**
 * dpStyles.ts — scoped CSS for the Drawdown "Dive Profile" page (.dp scope).
 *
 * Adapted from the provided design:
 *  • Google-Fonts @import REMOVED — Montserrat + DM Mono are self-hosted via
 *    Fontsource (client/src/index.css), so no external request.
 *  • Added a `.journal-light .dp` block that remaps every colour token for the
 *    journal's light theme (the design itself is dark-only).
 *  • Added `.journal-root .dp svg text` so chart labels keep DM Mono (the global
 *    `.journal-root svg text` rule would otherwise force the selected journal font).
 *
 * NOTE: the journal forces `font-family/weight/letter-spacing !important` on every
 * descendant of `.journal-root`. Journal.tsx exempts the `.dp` subtree via a
 * zero-specificity `:where(:not(.dp):not(.dp *))`, so the typography below applies
 * cleanly without needing !important on each rule.
 */
export const DP_CSS = `
.dp{
  --bg:#090C11; --bg2:#0D1119; --raise:rgba(255,255,255,.022);
  --ink:#ECEFEA; --ink2:#8A94A1; --ink3:#535C67;
  --line:rgba(255,255,255,.06); --line2:rgba(255,255,255,.10);
  --loss:#F2596A; --lossdeep:#FF3C4F; --loss-d:rgba(242,89,106,.14);
  --gain:#4FD8A6; --gain-d:rgba(79,216,166,.13);
  --warn:#F2B33D; --warn-d:rgba(242,179,61,.13);
  --heat-neg-ink:#FFFFFF;
  --mono:'DM Mono',ui-monospace,monospace;
  --disp:'Montserrat',sans-serif;
  background:var(--bg); color:var(--ink); font-family:var(--mono);
  min-height:100%; -webkit-font-smoothing:antialiased;
  /* top gap comes from <main> (14px, uniform with every other journal page); keep
     the horizontal + bottom padding here. */
  padding:0 clamp(14px,3.4vw,46px) 30px;
}
/* Light theme — remap every token; the layout/typography is unchanged. */
.journal-light .dp{
  --bg:#FFFFFF; --bg2:#F1F5F9; --raise:rgba(15,23,42,.03);
  --ink:#0F172A; --ink2:#475569; --ink3:#94A3B8;
  --line:rgba(15,23,42,.08); --line2:rgba(15,23,42,.14);
  --loss:#DC2626; --lossdeep:#B91C1C; --loss-d:rgba(220,38,38,.10);
  --gain:#059669; --gain-d:rgba(5,150,105,.10);
  --warn:#D97706; --warn-d:rgba(217,119,6,.10);
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
.dp .eyebrow{font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--ink3);font-weight:500;}

/* section rule header */
.dp .rule{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;
  border-bottom:1px solid var(--line);padding-bottom:13px;margin-bottom:24px;}
.dp .rule .lab{display:flex;align-items:center;gap:11px;}
.dp .rule .pin{width:6px;height:6px;background:var(--gain);transform:rotate(45deg);}
.dp .rule .t{font-family:var(--disp);font-weight:700;font-size:12.5px;letter-spacing:.18em;text-transform:uppercase;}
.dp .rule .sub{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);}

/* toggle */
.dp .seg{display:inline-flex;gap:22px;}
.dp .seg button{font-family:var(--mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:500;
  color:var(--ink3);background:none;border:0;padding:0 0 4px;cursor:pointer;border-bottom:1.5px solid transparent;transition:.16s;}
.dp .seg button:hover{color:var(--ink2);}
.dp .seg button.on{color:var(--ink);border-bottom-color:var(--gain);}

/* HERO */
.dp .hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;margin-bottom:30px;}
.dp .hero-h1{font-family:var(--disp);font-weight:800;font-size:clamp(19px,2.4vw,27px);line-height:1;letter-spacing:-.02em;margin:12px 0 0;}
.dp .equity{display:flex;align-items:baseline;gap:9px;}
.dp .equity .slabel{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);}
.dp .equity .t{font-size:11px;letter-spacing:.08em;text-transform:uppercase;}

/* KPI surface readouts */
.dp .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
  border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:4px;}
.dp .kpi{background:var(--bg);padding:16px 18px;}
.dp .kpi .k{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);margin-bottom:9px;}
.dp .kpi .v{font-size:clamp(10px,1.2vw,14px);font-weight:500;letter-spacing:-.03em;}

/* chart */
.dp .chart-wrap{position:relative;margin-top:14px;}
.dp .chart-wrap svg{display:block;width:100%;height:auto;}
.dp .chart-foot{display:flex;flex-wrap:wrap;gap:28px 40px;margin-top:16px;}
.dp .foot .k{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);}
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
.dp .colh span{font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink3);}
.dp .empty-row{padding:26px 0;color:var(--ink3);font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-align:center;}

/* TRIPLE (model) */
.dp .trip{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.dp .trip > div{padding:0 26px;border-left:1px solid var(--line);}
.dp .trip > div:first-child{padding-left:0;border-left:0;}
.dp .subh{font-family:var(--disp);font-weight:700;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink2);margin-bottom:16px;}
.dp .dl .r{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:9px 0;border-top:1px solid var(--line);}
.dp .dl .r:first-of-type{border-top:0;}
.dp .dl .r .k{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink2);}
.dp .dl .r .v{font-size:13px;font-weight:500;white-space:nowrap;}
.dp .note{font-size:11.5px;line-height:1.65;color:var(--ink3);margin-top:16px;}

/* RISK SURFACE (heatmap + freq) */
.dp .rs{display:grid;grid-template-columns:1fr 250px;gap:42px;}
.dp .heat{display:grid;gap:3px;overflow-x:auto;}
.dp .hrow{display:grid;grid-template-columns:84px repeat(var(--cols,5),minmax(56px,1fr));gap:3px;}
.dp .hh{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);text-align:center;padding:4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dp .hp{display:flex;align-items:center;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);}
.dp .hc{padding:14px 4px;text-align:center;}
.dp .hc .p{font-size:12.5px;font-weight:500;}
.dp .hc .t{font-size:9px;color:var(--ink3);margin-top:4px;}
.dp .freq .frow{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;}
.dp .freq .frow:first-of-type{margin-top:0;}
.dp .freq .bar{height:2px;background:var(--line2);margin-top:8px;position:relative;overflow:hidden;}
.dp .freq .bar i{position:absolute;inset:0 auto 0 0;background:var(--loss);}
.dp .freq .fsub{font-size:10px;color:var(--ink3);text-align:right;margin-top:6px;}

/* STRUCTURAL */
.dp .struct-top{padding:16px 0 22px;border-bottom:1px solid var(--line);margin-bottom:24px;}
.dp .rp{display:flex;justify-content:space-between;align-items:baseline;padding:11px 0;border-top:1px solid var(--line);gap:14px;}
.dp .rp:first-of-type{border-top:0;}
.dp .rp .nm{font-family:var(--disp);font-weight:600;font-size:11px;letter-spacing:.1em;text-transform:uppercase;}
.dp .rp .v{font-size:14px;color:var(--loss);}
.dp .rp .tl{font-size:10px;color:var(--ink3);}
.dp .sg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;}
.dp .sg > div{padding:0 26px;border-left:1px solid var(--line);}
.dp .sg > div:first-child{padding-left:0;border-left:0;}

.dp .sess{padding:13px 0;border-top:1px solid var(--line);}
.dp .sess:first-of-type{border-top:0;padding-top:2px;}
.dp .sess .top{display:flex;justify-content:space-between;align-items:baseline;}
.dp .sess .nm{font-family:var(--disp);font-weight:700;font-size:12px;letter-spacing:.08em;}
.dp .sess .vv{font-size:14px;}
.dp .sess .sb{font-size:10.5px;color:var(--ink3);margin-top:4px;}
.dp .sbar{height:2px;background:var(--line2);margin-top:9px;position:relative;overflow:hidden;}
.dp .sbar i{position:absolute;inset:0 auto 0 0;}
.dp .sess .wp{display:flex;justify-content:space-between;margin-top:9px;}
.dp .sess .wp .l{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);}
.dp .sess .wp .r{font-size:10px;color:var(--ink2);}

.dp .ls{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px;}
.dp .ls .k{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);margin-bottom:8px;}
.dp .ls .big{font-size:20px;font-weight:500;line-height:1;}
.dp .ls .s{font-size:10px;color:var(--ink3);margin-top:7px;}
.dp .tl{display:flex;flex-wrap:wrap;gap:3px;margin-top:14px;}
.dp .tl span{width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;}
.dp .tw{background:var(--gain-d);color:var(--gain);font-weight:700;} .dp .tlo{background:var(--loss-d);color:var(--loss);font-weight:700;} .dp .tb{background:var(--raise);color:var(--ink2);}

.dp .rr{padding:11px 0;border-top:1px solid var(--line);}
.dp .rr:first-of-type{border-top:0;padding-top:2px;}
.dp .rr .top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;}
.dp .rr .rng{font-size:12px;min-width:58px;}
.dp .rr .nm{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);}
.dp .rr .ct{font-size:9.5px;color:var(--ink3);}
.dp .rr .pc{font-size:13px;}
.dp .rrbar{height:2px;background:var(--line2);margin-top:8px;position:relative;overflow:hidden;}
.dp .rrbar i{position:absolute;inset:0 auto 0 0;}

/* MONTHLY TABLE */
.dp .mwrap{overflow-x:auto;}
.dp .mtbl{width:100%;border-collapse:collapse;}
.dp .mtbl th{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);
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
`;
