/**
 * Trade Sync — design tokens (Material 3 palette, ported from the Stitch export).
 *
 * Every token is declared on `.ct-app` rather than `:root`, so this UI carries its own
 * palette and cannot read or pollute the host app's theme variables.
 */
export const CT_TOKENS = `
.ct-app{
  --md-background:#fdfdf6;
  --md-surface:#f9f9f9;
  --md-surface-dim:#dadada;
  --md-surface-bright:#f9f9f9;
  --md-surface-container-lowest:#ffffff;
  --md-surface-container-low:#f3f3f3;
  --md-surface-container:#eeeeee;
  --md-surface-container-high:#e8e8e8;
  --md-surface-container-highest:#e2e2e2;
  --md-surface-variant:#e1e4da;
  --md-on-surface:#1a1c18;
  --md-on-surface-variant:#44483d;
  --md-on-background:#1a1c18;
  --md-outline:#74776f;
  --md-outline-variant:#c4c7c0;

  --md-primary:#b5942d;
  --md-on-primary:#ffffff;
  --md-primary-container:#f6df95;
  --md-on-primary-container:#3a2f00;
  --md-inverse-primary:#f2ca50;

  --md-secondary:#56624a;
  --md-on-secondary:#ffffff;
  --md-secondary-container:#dbe8c8;
  --md-on-secondary-container:#111e0e;

  --md-tertiary:#006b54;
  --md-on-tertiary:#ffffff;
  --md-tertiary-container:#a7f0d0;
  --md-on-tertiary-container:#002018;

  --md-error:#ba1a1a;
  --md-on-error:#ffffff;
  --md-error-container:#ffdad6;
  --md-on-error-container:#410002;

  --md-inverse-surface:#2f312c;
  --md-inverse-on-surface:#f1f1ea;

  --radius-sm:2px;
  --radius-md:4px;
  --radius-lg:8px;
  --radius-full:12px;

  background:var(--md-background);
  color:var(--md-on-surface);
  font-family:'Playfair Display',serif;
  min-height:100vh;
  transition:background-color .3s ease,color .3s ease;
}

/* dark blue theme ---------------------------------------------------
   TRIGGERED BY THE JOURNAL'S OWN MARKER CLASS, not by a class this panel sets itself
   (2026-09-27, his "consolidate theme color switch so that even fx copier theme can be switched
   from the main switch"). This panel used to hold its own useState<"light"|"dark">("dark") plus a
   second toggle button in its header, so it stayed dark while the rest of the app went white and
   the main LIGHT pill could not reach it.

   WHY A CLASS AND NOT A REACT HOOK. The obvious wiring — call useJournalSettings() here — would
   have shipped DEAD. That hook (hooks/useJournalSettings.ts) is plain useState: it writes the
   theme to localStorage but never notifies other callers, so a second caller gets its OWN copy,
   reads the theme once at mount and never hears the switch flip. Measured before choosing.

   .journal-root carries journal-dark or journal-light (Journal.tsx), and this panel always
   renders inside it (Journal.tsx -> TradeSyncPage -> TradeSyncApp). So the ancestor class changes
   in the same render as the rest of the app and the palette follows with zero JavaScript.
   Specificity: .ct-app is (0,1,0) and holds the light palette; .journal-dark .ct-app is (0,2,0). */
.journal-dark .ct-app{
  --md-background:#0a1220;
  --md-surface:#0f1930;
  --md-surface-container-lowest:#070d1a;
  --md-surface-container-low:#111d38;
  --md-surface-container:#152242;
  --md-surface-container-high:#1a294d;
  --md-surface-container-highest:#213262;
  --md-surface-variant:#1c2a4d;
  --md-on-surface:#e8edf9;
  --md-on-surface-variant:#a6b3d1;
  --md-on-background:#e8edf9;
  --md-outline:#4d5d8a;
  --md-outline-variant:#2a3760;
  --md-inverse-surface:#e8edf9;
  --md-inverse-on-surface:#101a33;
}
.journal-dark .ct-app,
.journal-dark .ct-app *{transition:background-color .3s ease,color .3s ease,border-color .3s ease}
`;
