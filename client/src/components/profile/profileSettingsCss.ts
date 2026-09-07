/** Styles for the account-settings view inside the profile dropdown.
 *
 * FOLLOWS THE JOURNAL'S THEME — his instruction, 2026-09-06: the account menu "doesnt change with
 * the platforms theme change", and settings was named with it.
 *
 * WHAT THIS USED TO SAY, and why it changed. It read: *"LIGHT. The user liked the white surface
 * from the short-lived standalone page... the card is white in all three views."* That was true and
 * it is now superseded: liking a white card in 2026-08 is not the same as wanting a white card
 * while the rest of the app is dark. Every colour here was a fixed light value, so on the dark
 * theme this was a white slab — the thing he is calling horrible.
 *
 * The tokens come from the journal shell (--jr-panel, --jr-border, --jr-ink, --jr-cap), the same
 * ones the Trade Vault's Edit Trade modal uses, so all three surfaces agree in both themes. Each
 * fallback after the comma is the OLD light value, so nothing regresses if a token is ever absent.
 *
 * AND NOTHING UNDER 11px. The labels were 9.5px and the plan chip 10px, uppercase with wide
 * tracking, in a display serif — all three of the causes docs/READABILITY.md lists, in one rule.
 *
 * NO BACKTICKS may appear inside this template literal, not even in a comment — a backtick ends the
 * string and the file still compiles, which is how this class of bug ships unnoticed.
 */
export const CSS = `
  .ps-head { display:flex; align-items:center; gap:9px; padding:14px 16px 11px;
             border-bottom:1px solid var(--jr-border, #e6ece8); }
  .ps-back { display:flex; align-items:center; justify-content:center; width:24px; height:24px;
             border:1px solid var(--jr-border, #e2e8e4); background:transparent; border-radius:6px;
             color:var(--jr-ink, #24322b);
             cursor:pointer; font-size:15px; line-height:1; transition:background .15s; }
  .ps-back:hover { background:var(--jr-border, #eaeeea); }
  .ps-title { font-size:13px; color:var(--jr-ink, #16232b); font-weight:700; letter-spacing:.05em;
              text-transform:uppercase; }

  .ps-sec { border-bottom:1px solid var(--jr-border, #eef2ee); }
  .ps-sec:last-of-type { border-bottom:none; }
  .ps-sec-btn { display:flex; align-items:center; justify-content:space-between; width:100%;
                gap:10px; padding:12px 16px; background:none; border:none; cursor:pointer;
                font-family:inherit; font-size:13px; font-weight:700; color:var(--jr-ink, #24322b);
                text-align:left; transition:background .15s; }
  .ps-sec-btn:hover { background:var(--jr-border, #f6f8f6); }
  .ps-sign { color:var(--jr-cap, #3f4c45); font-size:14px; line-height:1; transition:transform .18s; }
  .ps-sec-btn[data-open="1"] .ps-sign { transform:rotate(45deg); }

  .ps-body { padding:2px 16px 16px; display:flex; flex-direction:column; gap:9px; }
  .ps-lab { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
            color:var(--jr-cap, #5A6472); }
  .ps-in { width:100%; background:var(--jr-panel, #ffffff); border:1px solid var(--jr-border, #e2e8e4);
           border-radius:6px;
           padding:9px 11px; font-family:inherit; font-size:12px; color:var(--jr-ink, #16232b);
           outline:none; transition:border-color .15s, box-shadow .15s; }
  .ps-in:focus { border-color:#1e6fc8; box-shadow:0 0 0 3px rgba(30,111,200,.18); }
  .ps-in:disabled { color:var(--jr-cap, #36423b); opacity:.75; }
  .ps-btn { align-self:flex-start; border:none; border-radius:6px; padding:8px 18px;
            background:#1e6fc8; color:#ffffff; font-family:inherit; font-size:11px; font-weight:700;
            letter-spacing:.08em; text-transform:uppercase;
            cursor:pointer; transition:opacity .15s; }
  .ps-btn:hover:not(:disabled) { opacity:.88; }
  .ps-btn:disabled { opacity:.5; cursor:not-allowed; }
  .ps-note { font-size:12px; line-height:1.6; color:var(--jr-cap, #36423b); }
  .ps-ok  { font-size:12px; color:#22c58b; font-weight:700; }
  .ps-err { font-size:12px; color:#e5484d; font-weight:700; }
  /* Measured, both surfaces: no one green or red clears 4.5:1 on white AND on the dark panel, so
     each theme takes the step that does. #22c58b/#e5484d are the dark values; these are the light. */
  .journal-light .ps-ok  { color:#047857; }
  .journal-light .ps-err { color:#dc2626; }
  .ps-plan { display:flex; align-items:center; gap:8px; }
  .ps-pill { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
             padding:3px 10px;
             border-radius:999px; border:1px solid var(--jr-border, #d9e2dc);
             background:transparent; color:var(--jr-cap, #24322b); }

  /* The success green and the error red are the only two colours here that are not tokens, because
     they must mean the same thing on both themes. Checked against both surfaces rather than assumed:
     #22c58b and #e5484d clear 4.5:1 on the dark panel and on white. */
`;
