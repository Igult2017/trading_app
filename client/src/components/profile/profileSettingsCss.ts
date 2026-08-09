/** Styles for the account-settings view inside the profile dropdown.
 *
 * LIGHT. The user liked the white surface from the short-lived standalone page ("that white
 * theme/background for account setting looked cool"), so it survived the move back into the panel —
 * and on 2026-08-08 the WHOLE panel went white, profile view included. There is no dark variant and
 * no .pc-light toggle any more; the card is white in all three views.
 *
 * Colours are the same ones the legal and support pages use, so the light surfaces across the app
 * agree: ink #16232b, body #24322b, dim #36423b, green #175540.
 *
 * NO BACKTICKS may appear inside this template literal, not even in a comment — a backtick ends the
 * string and the file still compiles, which is how this class of bug ships unnoticed.
 */
export const CSS = `
  .ps-head { display:flex; align-items:center; gap:9px; padding:14px 15px 11px;
             border-bottom:1px solid #e6ece8; }
  .ps-back { display:flex; align-items:center; justify-content:center; width:23px; height:23px;
             border:1px solid #e2e8e4; background:#f6f8f6; border-radius:6px; color:#24322b;
             cursor:pointer; font-size:15px; line-height:1; transition:background .15s; }
  .ps-back:hover { background:#eaeeea; }
  .ps-title { font-size:12.5px; color:#16232b; font-weight:600; letter-spacing:.01em; }

  .ps-sec { border-bottom:1px solid #eef2ee; }
  .ps-sec:last-of-type { border-bottom:none; }
  .ps-sec-btn { display:flex; align-items:center; justify-content:space-between; width:100%;
                gap:10px; padding:12px 15px; background:none; border:none; cursor:pointer;
                font-family:inherit; font-size:12.5px; color:#24322b; text-align:left;
                transition:color .15s, background .15s; }
  .ps-sec-btn:hover { color:#16232b; background:#f6f8f6; }
  .ps-sec-btn[data-open="1"] { color:#16232b; font-weight:600; }
  .ps-sign { color:#3f4c45; font-size:14px; line-height:1; transition:transform .18s; }
  .ps-sec-btn[data-open="1"] .ps-sign { transform:rotate(45deg); }

  .ps-body { padding:2px 15px 15px; display:flex; flex-direction:column; gap:9px; }
  .ps-lab { font-size:9.5px; letter-spacing:.11em; text-transform:uppercase; color:#36423b; }
  .ps-in { width:100%; background:#ffffff; border:1px solid #e2e8e4; border-radius:8px;
           padding:9px 11px; font-family:inherit; font-size:12.5px; color:#16232b;
           outline:none; transition:border-color .15s, box-shadow .15s; }
  .ps-in:focus { border-color:#175540; box-shadow:0 0 0 3px rgba(31,107,79,.13); }
  .ps-in:disabled { color:#36423b; background:#f6f8f6; }
  .ps-btn { align-self:flex-start; border:none; border-radius:999px; padding:9px 18px;
            background:#175540; color:#ffffff; font-family:inherit; font-size:12px; font-weight:700;
            cursor:pointer; transition:background .15s; }
  .ps-btn:hover:not(:disabled) { background:#0f4433; }
  .ps-btn:disabled { opacity:.65; cursor:not-allowed; }
  .ps-note { font-size:11.5px; line-height:1.65; color:#36423b; }
  .ps-ok  { font-size:11.5px; color:#175540; font-weight:600; }
  .ps-err { font-size:11.5px; color:#b91c1c; font-weight:600; }
  .ps-plan { display:flex; align-items:center; gap:8px; }
  .ps-pill { font-size:10px; letter-spacing:.08em; text-transform:uppercase; padding:3px 10px;
             border-radius:999px; border:1px solid #d9e2dc; background:#f6f8f6; color:#24322b; }
`;
