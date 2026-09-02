/**
 * Blog palette — THE SITE'S OWN COLOURS.
 *
 * WAS PALE GREEN, on his 2026-08-29 note asking to copy a reference he liked ("clean, less chaotic").
 * He reversed that on 2026-09-02: *"remove the green color, because i dont see it anywhere as part
 * of our brand"* — and he is right. The public site is a BLUE on SLATE: `#2563eb` appears 9 times on
 * the homepage and 7 in the header, alongside the slate ramp (#0f172a, #1e293b, #64748b, #94a3b8,
 * #e2e8f0, #f1f5f9, #f8fafc). Nothing green appears anywhere else on the site.
 *
 * THE LAYOUT FROM THE REFERENCE IS KEPT — his words were "by design not color". What changes here is
 * only the ink and the ground; the arrangement, the serif headlines and the card rhythm stay.
 *
 * Kept as tokens in ONE file rather than sprinkled through the JSX, so a colour change is a single
 * edit and the light and dark sets cannot drift apart.
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
  // ── the ARTICLE page (added 2026-08-29 when /blog/:slug was brought in line) ──
  link: string;          // links inside the article body
  quoteInk: string;      // block quotes
  quoteEdge: string;
  codeInk: string;       // inline code and embed snippets
  codeBg: string;
  rule: string;          // horizontal rules and hairlines
  subtle: string;        // faint surfaces: share buttons, comment boxes
};

export const LIGHT: BlogTone = {
  page:          '#F7F9FC',
  card:          '#FFFFFF',
  cardBorder:    'rgba(15,23,42,0.08)',
  cardShadow:    '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)',
  title:         '#0F172A',
  body:          '#475569',
  meta:          '#94A3B8',
  tagBg:         '#EFF4FF',
  tagInk:        '#2563EB',
  pillBg:        '#FFFFFF',
  pillInk:       '#334155',
  pillBorder:    'rgba(15,23,42,0.12)',
  pillActiveBg:  '#2563EB',
  pillActiveInk: '#FFFFFF',
  accent:        '#2563EB',
  accentHover:   '#1D4ED8',
  placeholder:   'linear-gradient(160deg,#EEF2F8 0%,#E2E8F0 100%)',
  link:          '#2563EB',
  quoteInk:      '#475569',
  quoteEdge:     '#CBD8EC',
  codeInk:       '#1E40AF',
  codeBg:        '#EEF3FD',
  rule:          'rgba(15,23,42,0.10)',
  subtle:        '#F1F5F9',
};

export const DARK: BlogTone = {
  page:          '#0B1220',
  card:          '#131C2B',
  cardBorder:    'rgba(255,255,255,0.08)',
  cardShadow:    '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.30)',
  title:         '#E9EEF6',
  body:          '#AAB6C8',
  meta:          '#7C8AA0',
  tagBg:         'rgba(96,165,250,0.14)',
  tagInk:        '#93C5FD',
  pillBg:        '#131C2B',
  pillInk:       '#BCC8DA',
  pillBorder:    'rgba(255,255,255,0.12)',
  pillActiveBg:  '#3B82F6',
  pillActiveInk: '#08131F',
  accent:        '#60A5FA',
  accentHover:   '#7CB6FB',
  placeholder:   'linear-gradient(160deg,#18243A 0%,#131C2B 100%)',
  link:          '#93C5FD',
  quoteInk:      '#A6B3C6',
  quoteEdge:     '#2B3B55',
  codeInk:       '#A9CBFF',
  codeBg:        'rgba(96,165,250,0.10)',
  rule:          'rgba(255,255,255,0.09)',
  subtle:        'rgba(255,255,255,0.04)',
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
