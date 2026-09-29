/**
 * Trade Sync — PANEL MODE (`.ct-app.ct-panel`).
 *
 * Trade Sync is a panel inside Journal, alongside Calendar / Drawdown / Metrics / Audit / Trader AI:
 * Journal keeps its navbar and its left sidebar, and this UI renders in the content area — keeping
 * its own inner sidebar.
 *
 * The design is authored viewport-anchored (`min-height:100vh`, a sidebar at
 * `calc(100vh - 3.5rem)`). Journal's `<main>` is `overflowY:auto`, so it — not the viewport — is
 * the containing block. Left alone, `100vh` overshoots that box by the height of Journal's ticker
 * + navbar and the panel spills. These rules re-anchor the frame to the panel; nothing about the
 * type, colour, spacing or component layout changes.
 *
 * ⚠ THERE IS NO HEADER ANY MORE (2026-09-29). This used to explain that the header stayed
 * `sticky top-0` so it pinned to the panel's top edge. He had it removed — it held a notifications
 * bell for a feature that does not exist, a Help menu that only raised toasts, and an account menu
 * naming a person who is not him. Nothing pins to the top now; the content starts there.
 */
export const CT_PANEL = `
.ct-app.ct-panel{
  min-height:100%;
}

/* The aside's viewport sizing is dropped in JSX (sections/Sidebar.tsx) rather than fought with
   !important here — it was an inline style, which no stylesheet rule can outrank. This just lets
   it fill the panel's flex row. */
.ct-app.ct-panel .ct-sidebar{
  align-self:stretch;
}

/* HUG THE JOURNAL NAV AND ITS TOP EDGE. Standalone, this UI sits in a browser window and its
   content main carries p-6 (24px) all round, which is right — it needs breathing room against the
   viewport edge. In PANEL mode neither the left nor the top edge is the viewport: the left is
   Journal's nav rail and the top is Journal's own navbar, and 24px against either reads as the card
   floating with its border hanging in space rather than sitting against them.

   THE TOP WENT ON 2026-09-29, at his instruction — he drew a line across where the content should
   begin and said "remove the top space". It became visible the same day the copier's own header
   strip was removed: that bar used to occupy the space, and taking it away left the padding behind
   as a bare gap, with the nav rail on the right starting 24px higher than the content beside it.
   Dropping it closes the gap AND squares the two up.

   RIGHT AND BOTTOM ARE KEPT — they separate the content from the panel's own edges, which is a real
   job. Panel-scoped, so the standalone /trade-sync page is unaffected. */
.ct-app.ct-panel > .flex > main{
  padding-left:0;
  padding-top:0;
}
`;
