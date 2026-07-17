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

/* dark blue theme ---------------------------------------------------*/
.ct-app.theme-dark{
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
.ct-app.theme-dark,
.ct-app.theme-dark *{transition:background-color .3s ease,color .3s ease,border-color .3s ease}
`;
