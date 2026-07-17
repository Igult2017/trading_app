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
 * The header stays `sticky top-0`: inside a scrolling `<main>` it pins to the panel's top edge,
 * which is the behaviour a panel wants anyway.
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
`;
