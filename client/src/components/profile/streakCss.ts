/** Styles for the streak detail view. Light card, matching the account-settings view and the rest
 *  of the app's light surfaces (ink #16232b, body #4d5c55, dim #616f68, green #1f6b4f).
 *
 *  NO BACKTICKS inside this template literal, not even in a comment — a backtick ends the string and
 *  the file still compiles, which is how this class of bug ships unnoticed.
 */
export const STREAK_CSS = `
  .sd-head { display:flex; align-items:center; gap:9px; padding:14px 15px 11px;
             border-bottom:1px solid #e6ece8; }
  .sd-back { display:flex; align-items:center; justify-content:center; width:23px; height:23px;
             border:1px solid #e2e8e4; background:#f6f8f6; border-radius:6px; color:#4d5c55;
             cursor:pointer; font-size:15px; line-height:1; transition:background .15s; }
  .sd-back:hover { background:#eaeeea; }
  .sd-title { font-size:12.5px; color:#16232b; font-weight:600; }

  .sd-body { padding:15px; }
  .sd-figs { display:flex; gap:10px; margin-bottom:16px; }
  .sd-fig { flex:1; background:#f6f8f6; border:1px solid #e6ece8; border-radius:9px; padding:11px 12px; }
  .sd-fig-v { font-size:16px; font-weight:700; color:#16232b; letter-spacing:-.2px; }
  .sd-fig-l { font-size:9.5px; letter-spacing:.11em; text-transform:uppercase; color:#616f68; margin-top:3px; }

  .sd-strip-lab { font-size:9.5px; letter-spacing:.11em; text-transform:uppercase; color:#616f68;
                  margin-bottom:7px; }
  .sd-strip { display:flex; gap:4px; margin-bottom:13px; }
  .sd-day { flex:1; height:22px; border-radius:4px; background:#eef2ee; border:1px solid #e2e8e4; }
  .sd-day.on { background:#1f6b4f; border-color:#1f6b4f; }

  .sd-note { font-size:11.5px; line-height:1.65; color:#616f68; margin:0; }
  .sd-note strong { color:#16232b; font-weight:600; }
  .sd-hint { margin-top:8px; color:#1f6b4f; font-weight:600; }
`;
