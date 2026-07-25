/**
 * Trade Sync — colour utilities, radius scale and type scale.
 *
 * All scoped under `.ct-app`. The radius block deliberately re-points Tailwind's own
 * `rounded/rounded-lg/rounded-xl/rounded-full` names at this UI's scale, so the classes in the
 * markup read as normal Tailwind while resolving to the Material 3 values — inside `.ct-app` only.
 */
export const CT_UTILITIES = `
/* colour utilities ------------------------------------------------- */
.ct-app .bg-background{background:var(--md-background)}
.ct-app .bg-surface{background:var(--md-surface)}
.ct-app .bg-surface-container-lowest{background:var(--md-surface-container-lowest)}
.ct-app .bg-surface-container-low{background:var(--md-surface-container-low)}
.ct-app .bg-surface-container{background:var(--md-surface-container)}
.ct-app .bg-surface-container-high{background:var(--md-surface-container-high)}
.ct-app .bg-surface-container-highest{background:var(--md-surface-container-highest)}
.ct-app .bg-surface-variant{background:var(--md-surface-variant)}
.ct-app .bg-primary{background:var(--md-primary)}
.ct-app .bg-primary-container{background:var(--md-primary-container)}
.ct-app .bg-secondary-container{background:var(--md-secondary-container)}
.ct-app .bg-tertiary{background:var(--md-tertiary)}
.ct-app .bg-tertiary-container{background:var(--md-tertiary-container)}
.ct-app .bg-error{background:var(--md-error)}
.ct-app .bg-error-container{background:var(--md-error-container)}
.ct-app .bg-inverse-surface{background:var(--md-inverse-surface)}

.ct-app .text-on-background{color:var(--md-on-background)}
.ct-app .text-on-surface{color:var(--md-on-surface)}
.ct-app .text-on-surface-variant{color:var(--md-on-surface-variant)}
.ct-app .text-primary{color:var(--md-primary)}
.ct-app .text-on-primary{color:var(--md-on-primary)}
.ct-app .text-on-primary-container{color:var(--md-on-primary-container)}
.ct-app .text-secondary{color:var(--md-secondary)}
.ct-app .text-tertiary{color:var(--md-tertiary)}
.ct-app .text-on-tertiary-container{color:var(--md-on-tertiary-container)}
.ct-app .text-error{color:var(--md-error)}
.ct-app .text-on-error{color:var(--md-on-error)}
.ct-app .text-outline{color:var(--md-outline)}
.ct-app .text-inverse-on-surface{color:var(--md-inverse-on-surface)}

.ct-app .border-outline-variant{border-color:var(--md-outline-variant)}
.ct-app .border-surface-container-highest{border-color:var(--md-surface-container-highest)}
.ct-app .border-primary{border-color:var(--md-primary)}
.ct-app .border-tertiary{border-color:var(--md-tertiary)}
.ct-app .border-error{border-color:var(--md-error)}

.ct-app ::selection{background:var(--md-primary);color:var(--md-on-primary)}

/* radius scale (overrides the default Tailwind scale) -------------- */
.ct-app .rounded{border-radius:var(--radius-sm)}
.ct-app .rounded-lg{border-radius:var(--radius-md)}
.ct-app .rounded-xl{border-radius:var(--radius-lg)}
.ct-app .rounded-full{border-radius:var(--radius-full)}

/* type scale --------------------------------------------------------
   Fallback is Georgia, NOT the bare serif default: Georgia's metrics are far closer to Playfair
   Display, so the one frame before the webfont arrives does not visibly resize the layout. */
.ct-app .font-label-xs{font-family:'Playfair Display',Georgia,serif;font-size:9px;line-height:12px;letter-spacing:.08em;font-weight:500}
.ct-app .font-label-sm{font-family:'Playfair Display',Georgia,serif;font-size:11px;line-height:14px;letter-spacing:.05em;font-weight:500}
.ct-app .font-body-md{font-family:'Playfair Display',Georgia,serif;font-size:12px;line-height:17px;font-weight:400}
.ct-app .font-body-lg{font-family:'Playfair Display',Georgia,serif;font-size:14px;line-height:20px;font-weight:400}
.ct-app .font-headline-md{font-family:'Playfair Display',Georgia,serif;font-size:16px;line-height:22px;font-weight:600}
.ct-app .font-headline-lg{font-family:'Playfair Display',Georgia,serif;font-size:26px;line-height:32px;letter-spacing:-.02em;font-weight:700}

/* NUMBERS — Playfair too (user, 2026-07-25). The class name is historical: it used to load DM Mono
   and is applied at ~27 call sites, so it is repointed rather than renamed everywhere. DM Mono is
   no longer requested at all (styles/install.ts).

   MEASURED, do not assume otherwise: Google's Playfair Display has NO tnum feature — its figures
   are PROPORTIONAL. Verified in a browser against the real stylesheet: at 16px "1111111111" is
   59px wide and "0000000000" is 96px. The tabular-nums request below is therefore INERT today; it
   is kept only so the font shipping tnum later fixes this for free. The practical consequence is
   that digits do not sit on a fixed grid, so number cells must stay RIGHT-ALIGNED (they are) —
   right alignment plus a fixed 2-decimal format keeps the decimal points lined up regardless. */
.ct-app .font-dm-mono{font-family:'Playfair Display',Georgia,serif;font-variant-numeric:tabular-nums}

/* hidden scrollbars (content stays scrollable) ----------------------*/
.ct-hide-scrollbar{scrollbar-width:none;-ms-overflow-style:none;overflow-x:hidden}
.ct-hide-scrollbar::-webkit-scrollbar{display:none;width:0;height:0}
`;
