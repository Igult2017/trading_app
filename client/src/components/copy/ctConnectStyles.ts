/** Styles for CTraderConnectPanel — dark · DM Mono · square. Scoped to .ct-root. */
export const CT_PANEL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap');

.ct-root{
  --bg:#0C0D10; --card:#141519; --card-2:#101115;
  --line:#23252B; --line-2:#1B1D22; --line-strong:#30333B;
  --ink:#E7E9ED; --ink-2:#9197A2; --ink-3:#636974;
  --brand:#7C84EC; --brand-hov:#9098F2; --brand-soft:rgba(124,132,236,.14); --brand-ring:rgba(124,132,236,.55);
  --green:#33D69B; --green-text:#46E0AB; --green-soft:rgba(51,214,155,.12);
  box-sizing:border-box;
  font-family:'DM Mono',ui-monospace,SFMono-Regular,monospace;
  font-weight:400;
  color:var(--ink);
  -webkit-font-smoothing:antialiased;
  display:block;
}
.ct-root *{ box-sizing:border-box; border-radius:0; }

.ct-shell{ width:100%; background:var(--bg); border:1px solid var(--line); padding:28px 30px; }
.ct-grid{ display:grid; gap:42px; grid-template-columns:minmax(0,1.06fr) minmax(0,.94fr); }
@media (max-width:860px){ .ct-grid{ grid-template-columns:1fr; gap:30px; } }
.ct-col{ min-width:0; }

.ct-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
.ct-brand{ display:flex; align-items:center; gap:11px; }
.ct-logo{ width:38px; height:38px; flex:none; display:grid; place-items:center; background:var(--card-2); border:1px solid var(--line); }
.ct-brand-text{ display:flex; flex-direction:column; gap:2px; }
.ct-title{ font-size:13.5px; font-weight:500; letter-spacing:-.01em; color:var(--ink); }
.ct-sub{ font-size:11px; color:var(--ink-3); letter-spacing:0; }
.ct-conn{ display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:500; color:var(--green-text); letter-spacing:.01em; padding:5px 10px 5px 9px; background:var(--green-soft); border:1px solid rgba(51,214,155,.24); }
.ct-dot{ width:6px; height:6px; flex:none; background:var(--green); box-shadow:0 0 0 0 rgba(51,214,155,.5); animation:ctPulse 2.4s ease-out infinite; }

.ct-list{ display:flex; flex-direction:column; gap:9px; }
.ct-card{ position:relative; display:flex; align-items:center; gap:13px; width:100%; text-align:left; cursor:pointer; padding:13px 15px; background:var(--card-2); border:1px solid var(--line-2); color:inherit; font:inherit; transition:border-color .16s, box-shadow .16s, background .16s, transform .1s; }
.ct-card:hover:not(.is-pending):not(.is-sel){ border-color:var(--line-strong); background:#13141A; }
.ct-card:active:not(.is-pending){ transform:translateY(.5px); }
.ct-card:focus-visible{ outline:2px solid var(--brand); outline-offset:2px; }
.ct-card.is-pending{ cursor:not-allowed; opacity:.6; }
.ct-card.is-sel{ border-color:var(--brand); background:linear-gradient(180deg, rgba(124,132,236,.08), rgba(124,132,236,.02)); box-shadow:0 0 0 1px var(--brand-ring), 0 6px 22px -14px rgba(124,132,236,.7); }
.ct-mark{ width:34px; height:34px; flex:none; display:grid; place-items:center; background:var(--card); border:1px solid var(--line); }
.ct-card-body{ flex:1; min-width:0; display:flex; flex-direction:column; gap:3px; }
.ct-card-top{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ct-name{ font-size:13.5px; font-weight:500; letter-spacing:-.005em; color:var(--ink); }
.ct-num{ font-size:11.5px; color:var(--ink-3); letter-spacing:0; }
.ct-pill{ font-size:10px; font-weight:500; letter-spacing:.05em; text-transform:uppercase; color:var(--ink-2); padding:2.5px 7px; background:#1A1C22; border:1px solid var(--line); }
.ct-pill-wait{ color:var(--ink-3); text-transform:none; letter-spacing:0; }
.ct-card-right{ display:flex; align-items:center; gap:14px; flex:none; }
.ct-bal{ display:flex; flex-direction:column; align-items:flex-end; line-height:1.2; }
.ct-bal b{ font-size:13px; font-weight:500; color:var(--ink); letter-spacing:0; }
.ct-bal i{ font-style:normal; font-size:9.5px; color:var(--ink-3); letter-spacing:.06em; margin-top:1px; }
.ct-bal-muted{ color:var(--ink-3); font-size:15px; }
.ct-radio{ width:18px; height:18px; flex:none; display:grid; place-items:center; border:1.5px solid #3A3E47; color:#fff; transition:all .15s; }
.ct-card.is-sel .ct-radio{ border-color:transparent; background:var(--brand); box-shadow:0 1px 6px rgba(124,132,236,.6); }

.ct-actions{ display:flex; gap:9px; margin-top:14px; flex-wrap:wrap; }
.ct-act{ display:inline-flex; align-items:center; gap:7px; font-size:11.5px; font-weight:500; color:var(--ink-2); cursor:pointer; letter-spacing:.01em; padding:8px 13px; background:var(--card-2); border:1px solid var(--line); transition:border-color .15s, background .15s, color .15s; }
.ct-act:hover{ border-color:var(--line-strong); background:#16171C; color:var(--ink); }
.ct-act:disabled{ opacity:.55; cursor:default; }
.ct-act:focus-visible{ outline:2px solid var(--brand); outline-offset:2px; }
.ct-act-primary{ color:var(--brand-hov); border-color:rgba(124,132,236,.4); background:var(--brand-soft); }
.ct-act-primary:hover{ color:#fff; background:rgba(124,132,236,.22); border-color:rgba(124,132,236,.55); }
.ct-act.is-spinning svg{ animation:ctSpin .9s linear infinite; }

.ct-msg{ margin-top:12px; font-size:11.5px; color:#f0556b; }
.ct-empty{ padding:26px 18px; border:1px dashed var(--line-strong); text-align:center; color:var(--ink-2); font-size:12px; line-height:1.7; }

.ct-oauth{ padding:18px; background:#121317; border:1px solid var(--line); margin-bottom:16px; }
.ct-oauth-chip{ display:inline-flex; align-items:center; gap:7px; font-size:11px; font-weight:500; color:var(--green-text); letter-spacing:.02em; padding:4px 10px 4px 9px; background:var(--green-soft); border:1px solid rgba(51,214,155,.24); margin-bottom:13px; }
.ct-oauth-body{ margin:0; font-size:12px; line-height:1.72; color:var(--ink-2); }
.ct-oauth-body strong{ color:var(--ink); font-weight:500; }

.ct-flowcard{ padding:18px; background:var(--card-2); border:1px solid var(--line); }
.ct-flow-label{ display:block; font-size:10.5px; font-weight:500; letter-spacing:.12em; text-transform:uppercase; color:var(--ink-3); margin-bottom:18px; }
.ct-steps{ list-style:none; margin:0; padding:0; position:relative; display:flex; flex-direction:column; gap:17px; }
.ct-steps::before{ content:""; position:absolute; left:11px; top:14px; bottom:14px; width:1.5px; background:var(--line); }
.ct-step{ position:relative; display:flex; gap:13px; align-items:flex-start; }
.ct-node{ position:relative; z-index:1; flex:none; width:23px; height:23px; display:grid; place-items:center; font-size:11px; font-weight:500; color:var(--brand-hov); background:#181A22; border:1px solid rgba(124,132,236,.35); box-shadow:0 0 0 3px var(--card-2); }
.ct-step-text{ display:flex; flex-direction:column; gap:3px; padding-top:1px; }
.ct-step-text b{ font-size:12.5px; font-weight:500; color:var(--ink); letter-spacing:-.005em; }
.ct-step-text span{ font-size:11.5px; line-height:1.6; color:var(--ink-2); }

@keyframes ctPulse{ 0%{ box-shadow:0 0 0 0 rgba(51,214,155,.5);} 70%{ box-shadow:0 0 0 5px rgba(51,214,155,0);} 100%{ box-shadow:0 0 0 0 rgba(51,214,155,0);} }
@keyframes ctSpin{ to{ transform:rotate(360deg); } }
@media (prefers-reduced-motion:reduce){ .ct-dot,.ct-act.is-spinning svg{ animation:none !important; } }
`;
