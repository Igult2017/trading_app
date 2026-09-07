/** Styles for the streak detail view — the third face of the profile dropdown.
 *
 *  FOLLOWS THE JOURNAL'S THEME, changed 2026-09-06 with the profile card and the settings view it
 *  sits beside. It said "Light card" and every value was a fixed light one, so on the dark theme
 *  this was a white slab like the other two. The tokens (--jr-panel, --jr-border, --jr-ink,
 *  --jr-cap) come from the journal shell; each fallback after the comma is the OLD light value, so
 *  nothing regresses if a token is ever missing.
 *
 *  AND NOTHING UNDER 11px — the two label rules were 9.5px, uppercase, at .11em tracking, in a
 *  display serif. All three of the causes docs/READABILITY.md lists, in one rule, twice.
 *
 *  NO BACKTICKS inside this template literal, not even in a comment — a backtick ends the string and
 *  the file still compiles, which is how this class of bug ships unnoticed.
 */
export const STREAK_CSS = `
  .sd-head { display:flex; align-items:center; gap:9px; padding:14px 16px 11px;
             border-bottom:1px solid var(--jr-border, #e6ece8); }
  .sd-back { display:flex; align-items:center; justify-content:center; width:24px; height:24px;
             border:1px solid var(--jr-border, #e2e8e4); background:transparent; border-radius:6px;
             color:var(--jr-ink, #24322b);
             cursor:pointer; font-size:15px; line-height:1; transition:background .15s; }
  .sd-back:hover { background:var(--jr-border, #eaeeea); }
  .sd-title { font-size:13px; color:var(--jr-ink, #16232b); font-weight:700; letter-spacing:.05em;
              text-transform:uppercase; }

  .sd-body { padding:16px; }
  .sd-figs { display:flex; gap:10px; margin-bottom:16px; }
  .sd-fig { flex:1; background:transparent; border:1px solid var(--jr-border, #e6ece8);
            border-radius:8px; padding:11px 12px; }
  .sd-fig-v { font-size:16px; font-weight:700; color:var(--jr-ink, #16232b); letter-spacing:-.2px; }
  .sd-fig-l { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
              color:var(--jr-cap, #5A6472); margin-top:3px; }

  .sd-strip-lab { font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
                  color:var(--jr-cap, #5A6472); margin-bottom:7px; }
  .sd-strip { display:flex; gap:4px; margin-bottom:13px; }
  .sd-day { flex:1; height:22px; border-radius:4px; background:transparent;
            border:1px solid var(--jr-border, #e2e8e4); }
  /* A DAY HE TRADED. Kept as a colour rather than a token: it is data, and it has to read the same
     on both themes. #1e6fc8 is the journal's primary, the same blue the modal's Save button uses. */
  .sd-day.on { background:#1e6fc8; border-color:#1e6fc8; }

  .sd-note { font-size:12px; line-height:1.6; color:var(--jr-cap, #36423b); margin:0; }
  .sd-note strong { color:var(--jr-ink, #16232b); font-weight:700; }
  .sd-hint { margin-top:8px; color:#1e6fc8; font-weight:700; }
`;
