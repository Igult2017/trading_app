/**
 * Quiet Capital — design tokens + base classes for the Trade Sync redesign.
 * Injected via a <style> inside the Trade Sync root only (scoped under `.qc-root`),
 * so the rest of the app's theme is untouched. Manrope + JetBrains Mono are already
 * loaded globally via Fontsource. Use: <div className="qc-root"><style>{QC_CSS}</style>…</div>
 */
export const QC_CSS = `
.qc-root{
  --bg:#0A0B0D;--s1:#121317;--s2:#1A1C21;--s3:#23262C;--inset:#0E0F12;
  --b1:rgba(255,255,255,.06);--b2:rgba(255,255,255,.10);--b3:rgba(255,255,255,.16);
  --t1:#ECEEF2;--t2:#A8AEB8;--t3:#6E7480;--t4:#44484F;
  --acc:#5B6CFF;--acc-h:#6F7DFF;--acc-soft:rgba(91,108,255,.12);--acc-bd:rgba(91,108,255,.40);
  --ok:#2FCB7E;--ok-s:rgba(47,203,126,.12);--bad:#F0556B;--bad-s:rgba(240,85,107,.12);
  --warn:#F5A623;--warn-s:rgba(245,166,35,.12);--info:#46B4E6;--info-s:rgba(70,180,230,.12);
  background:var(--bg);color:var(--t1);font-family:'Manrope Variable',Manrope,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;min-height:100vh;
}
.qc-root *{box-sizing:border-box;}
.qc-root h1,.qc-root h2,.qc-root h3,.qc-root h4{font-family:'Manrope Variable',Manrope,system-ui,sans-serif;letter-spacing:-.01em;}
.qc-root .mono{font-family:'JetBrains Mono Variable','JetBrains Mono',monospace;font-feature-settings:"tnum" 1,"zero" 1;}
.qc-root .qc-eyebrow{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--t3);}
.qc-root .qc-h1{font-family:'Manrope Variable',Manrope,system-ui,sans-serif;font-size:24px;font-weight:700;letter-spacing:-.015em;line-height:1.2;color:var(--t1);}
.qc-root .qc-sub{font-size:14px;color:var(--t2);line-height:1.6;}
.qc-root .qc-up{color:var(--ok);} .qc-root .qc-down{color:var(--bad);} .qc-root .qc-muted{color:var(--t3);}

/* shell */
.qc-top{height:56px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between;padding:0 24px;flex-shrink:0;}
.qc-brand{font-size:14px;font-weight:700;letter-spacing:-.01em;}.qc-brand b{color:var(--acc);}
.qc-toplink{font-size:12px;font-weight:500;color:var(--t3);padding:7px 12px;border-radius:7px;display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;cursor:pointer;}
.qc-toplink:hover{color:var(--t1);background:var(--s2);}
.qc-stepwrap{display:flex;justify-content:center;padding:26px 24px 4px;}
.qc-stepper{display:flex;align-items:center;}
.qc-step{display:flex;flex-direction:column;align-items:center;gap:8px;width:92px;}
.qc-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;}
.qc-dot.done{background:var(--ok);color:#06210f;} .qc-dot.active{background:var(--acc);color:#fff;box-shadow:0 0 0 5px var(--acc-soft);}
.qc-dot.next{background:var(--s2);color:var(--t3);border:1px solid var(--b2);}
.qc-step .lbl{font-size:11.5px;font-weight:500;color:var(--t3);} .qc-step.on .lbl{color:var(--t1);}
.qc-conn{height:1px;width:44px;background:var(--b2);margin-bottom:24px;} .qc-conn.fill{background:var(--ok);}
.qc-body{flex:1;display:flex;flex-direction:column;align-items:center;padding:40px 24px 110px;}
.qc-content{width:100%;max-width:760px;}
.qc-foot{position:sticky;bottom:0;height:72px;border-top:1px solid var(--b1);background:rgba(10,11,13,.82);backdrop-filter:blur(8px);display:flex;align-items:center;}
.qc-foot .inner{width:100%;max-width:760px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center;}

/* cards / inputs / buttons / badges */
.qc-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:26px;}
.qc-card{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:20px;transition:all .2s cubic-bezier(.16,1,.3,1);cursor:pointer;}
.qc-card:hover{border-color:var(--b3);transform:translateY(-2px);} .qc-card.sel{border-color:var(--acc-bd);background:var(--acc-soft);}
.qc-card .ic{width:40px;height:40px;border-radius:9px;background:var(--s2);display:flex;align-items:center;justify-content:center;color:var(--t1);margin-bottom:14px;}
.qc-card.sel .ic{background:rgba(91,108,255,.18);color:var(--acc-h);}
.qc-card h3{font-size:16px;font-weight:600;margin-bottom:5px;} .qc-card p{font-size:13px;color:var(--t3);line-height:1.5;}
.qc-chk{width:20px;height:20px;border-radius:50%;border:1px solid var(--b2);flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.qc-chk.on{background:var(--acc);border-color:var(--acc);color:#fff;}
.qc-inp{height:40px;width:100%;background:var(--s2);border:1px solid var(--b2);border-radius:8px;padding:0 12px;color:var(--t1);font-size:14px;font-family:inherit;outline:none;}
.qc-inp:focus{border-color:transparent;box-shadow:0 0 0 2px var(--acc);} .qc-inp::placeholder{color:var(--t3);}
.qc-hint{font-size:12px;color:var(--t3);margin-top:6px;}
.qc-sw{width:38px;height:22px;border-radius:999px;background:var(--acc);position:relative;flex-shrink:0;cursor:pointer;}
.qc-sw::after{content:"";position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:50%;background:#fff;}
.qc-sw.off{background:var(--s3);} .qc-sw.off::after{left:3px;right:auto;}
.qc-well{background:var(--inset);border-radius:10px;padding:8px;}
.qc-acct{height:56px;display:flex;align-items:center;gap:12px;padding:0 14px;border-radius:8px;cursor:pointer;}
.qc-acct:hover{background:var(--s2);} .qc-acct.sel{background:var(--acc-soft);box-shadow:inset 0 0 0 1px var(--acc-bd);}
.qc-badge{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:999px;}
.qc-b-demo{background:var(--warn-s);color:var(--warn);} .qc-b-live{background:var(--ok-s);color:var(--ok);}
.qc-b-conn{background:var(--ok-s);color:var(--ok);} .qc-b-tg{background:var(--info-s);color:var(--info);}
.qc-btn{height:40px;padding:0 18px;border-radius:8px;font-size:14px;font-weight:500;font-family:inherit;border:1px solid transparent;display:inline-flex;align-items:center;gap:8px;cursor:pointer;transition:all .15s;}
.qc-btn-pri{background:var(--acc);color:#fff;} .qc-btn-pri:hover{background:var(--acc-h);}
.qc-btn-sec{background:var(--s2);color:var(--t1);border-color:var(--b2);}
.qc-btn-ghost{background:transparent;color:var(--t2);} .qc-btn-ghost.dis{color:var(--t4);cursor:default;}
.qc-btn-dgr{background:transparent;color:var(--bad);border-color:rgba(240,85,107,.4);}
@media (prefers-reduced-motion:reduce){.qc-card{transition:none;}}
@media (max-width:680px){.qc-cards{grid-template-columns:1fr;} .qc-step{width:64px;} .qc-step .lbl{display:none;}}
`;
