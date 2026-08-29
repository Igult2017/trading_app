/**
 * Blog palette — the calm, pale-green look he asked for on 2026-08-29:
 *
 *   "Can we make the blog to display like this. This one looks clean, less chaotic and also it is
 *    clear. Can you copy even font, background color/theme and arrangement of articles."
 *
 * Read off the reference he sent. Kept as tokens in ONE file rather than sprinkled through the JSX,
 * so the next colour tweak is a single edit and the light and dark sets cannot drift apart.
 *
 * DARK MODE IS NOT IN THE REFERENCE — it is light-only. The public site has a working dark toggle
 * (`usePublicTheme`) that other pages honour, so a dark set is derived here rather than dropping the
 * feature: the same layout on a deep green-black ground, with the mint accents kept so the two modes
 * read as the same design.
 */
export type BlogTone = {
  page: string;          // page background
  card: string;          // card surface
  cardBorder: string;
  cardShadow: string;
  title: string;         // headline ink
  body: string;          // excerpt ink
  meta: string;          // author, date, read time
  tagBg: string;         // the little category pill ON a card
  tagInk: string;
  pillBg: string;        // the filter pills above the grid
  pillInk: string;
  pillBorder: string;
  pillActiveBg: string;
  pillActiveInk: string;
  accent: string;        // the "Load more" button
  accentHover: string;
  placeholder: string;   // card image fallback
};

export const LIGHT: BlogTone = {
  page:          '#F1F7F2',
  card:          '#FFFFFF',
  cardBorder:    'rgba(16,54,34,0.07)',
  cardShadow:    '0 1px 2px rgba(16,54,34,0.04), 0 8px 24px rgba(16,54,34,0.05)',
  title:         '#14271C',
  body:          '#55665C',
  meta:          '#8A9990',
  tagBg:         '#E7F2EA',
  tagInk:        '#2C7A52',
  pillBg:        '#FFFFFF',
  pillInk:       '#3D5346',
  pillBorder:    'rgba(16,54,34,0.12)',
  pillActiveBg:  '#2C6E4A',
  pillActiveInk: '#FFFFFF',
  accent:        '#2C6E4A',
  accentHover:   '#245B3D',
  placeholder:   'linear-gradient(160deg,#E9F4EC 0%,#DCEDE1 100%)',
};

export const DARK: BlogTone = {
  page:          '#0C1410',
  card:          '#13201A',
  cardBorder:    'rgba(255,255,255,0.07)',
  cardShadow:    '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.28)',
  title:         '#ECF3EE',
  body:          '#A9BBB0',
  meta:          '#7E9188',
  tagBg:         'rgba(74,190,130,0.14)',
  tagInk:        '#6FD8A2',
  pillBg:        '#13201A',
  pillInk:       '#B7C8BE',
  pillBorder:    'rgba(255,255,255,0.12)',
  pillActiveBg:  '#4ABE82',
  pillActiveInk: '#08150E',
  accent:        '#3E9E6C',
  accentHover:   '#48B47B',
  placeholder:   'linear-gradient(160deg,#17281F 0%,#12201A 100%)',
};

export const tone = (dark: boolean): BlogTone => (dark ? DARK : LIGHT);

/** Headlines. Playfair Display is ALREADY bundled (client/src/index.css imports both the static
 *  400–700 faces and the variable one), so matching the reference's serif costs no extra bytes.
 *  The static family name is used because it is the one guaranteed to be registered — the variable
 *  package registers "Playfair Display Variable", and referring to a face by the wrong name fails
 *  silently rather than erroring. */
export const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";

/** Everything else — labels, excerpts, metadata. Inter is bundled and is close to the reference. */
export const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
