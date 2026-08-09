/** Styles for the account-settings view inside the profile dropdown.
 *  Split out of ProfileSettings.tsx purely to hold the 150-line-per-file rule.
 *  NO BACKTICKS may appear inside this template literal, not even in a comment — a backtick ends
 *  the string and the file still compiles, which is how this class of bug ships unnoticed.
 */
export const CSS = `
  .ps-head { display:flex; align-items:center; gap:8px; padding:12px 14px 10px; }
  .ps-back { display:flex; align-items:center; justify-content:center; width:22px; height:22px;
             border:none; background:rgba(255,255,255,.06); border-radius:6px; color:#c7cbe0;
             cursor:pointer; font-size:15px; line-height:1; transition:background .15s; }
  .ps-back:hover { background:rgba(255,255,255,.13); }
  .ps-title { font-size:12px; letter-spacing:.02em; color:#ede9ff; font-weight:500; }

  .ps-sec { border-top:1px solid rgba(255,255,255,.06); }
  .ps-sec-btn { display:flex; align-items:center; justify-content:space-between; width:100%;
                gap:10px; padding:11px 14px; background:none; border:none; cursor:pointer;
                font-family:inherit; font-size:12.5px; color:#b9bfd6; text-align:left;
                transition:color .15s, background .15s; }
  .ps-sec-btn:hover { color:#ede9ff; background:rgba(255,255,255,.03); }
  .ps-sec-btn[data-open="1"] { color:#ede9ff; }
  .ps-sign { color:rgba(255,255,255,.32); font-size:14px; line-height:1; transition:transform .18s; }
  .ps-sec-btn[data-open="1"] .ps-sign { transform:rotate(45deg); }

  .ps-body { padding:2px 14px 14px; display:flex; flex-direction:column; gap:9px; }
  .ps-lab { font-size:9.5px; letter-spacing:.11em; text-transform:uppercase; color:rgba(255,255,255,.38); }
  .ps-in { width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.10);
           border-radius:7px; padding:9px 11px; font-family:inherit; font-size:12.5px; color:#ede9ff;
           outline:none; transition:border-color .15s; }
  .ps-in:focus { border-color:rgba(124,142,255,.55); }
  .ps-in:disabled { color:rgba(255,255,255,.42); background:rgba(255,255,255,.02); }
  .ps-btn { align-self:flex-start; border:none; border-radius:999px; padding:8px 16px;
            background:#4f46e5; color:#fff; font-family:inherit; font-size:12px; font-weight:600;
            cursor:pointer; transition:background .15s; }
  .ps-btn:hover:not(:disabled) { background:#5f57ee; }
  .ps-btn:disabled { opacity:.6; cursor:not-allowed; }
  .ps-note { font-size:11px; line-height:1.6; color:rgba(255,255,255,.45); }
  .ps-ok  { font-size:11.5px; color:#5fbf95; }
  .ps-err { font-size:11.5px; color:#fca5a5; }
  .ps-plan { display:flex; align-items:center; gap:8px; }
  .ps-pill { font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:3px 9px;
             border-radius:999px; border:1px solid rgba(255,255,255,.16); color:#c7cbe0; }
`;
