import { C } from './tokens';

/**
 * The admin panel's five palettes, and the one stored key that picks between them.
 *
 * ⚠ WHY THIS IS ITS OWN FILE. These lived inside `AdminPanel.tsx`, and the app-shell placeholder
 * in `App.tsx` needs them: the placeholder stands in for the admin panel while its bundle is still
 * downloading, and it was painting a WHITE screen for a panel the user had set to dark. But
 * `AdminPanel.tsx` is lazy-loaded on purpose — importing anything from it in `App.tsx` would drag
 * the whole 2,800-line panel into the main chunk and destroy the very code-split the placeholder
 * exists to cover. `tokens.ts` is constants-only, so this module costs the main chunk a colour
 * table and nothing else.
 *
 * ⚠ IT IS ALSO THE SINGLE COPY. Hand-copying three colours per theme into the placeholder would
 * have worked today and drifted the first time a palette was retouched — the exact failure that
 * put `DASH_GEOMETRY` in `DashboardSkeletons.tsx`.
 */

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// EVERY COLOUR THE PANEL USES IS A THEME TOKEN — it was not, and that is why the panel could only
// ever be dark. `text` and `muted` were hardcoded light-on-dark further down, so a light palette was
// impossible however the other values were set. `applyAdminTheme` turns each key here into a CSS
// variable (`--admin-<key>`), so adding a key here is all it takes to make it themeable.
//
// `light` is the reference look: a dark navigation rail against a pale page, white cards, one green
// accent used sparingly. The four dark palettes keep their character and gain the same new keys so
// they carry on working.
export const ADMIN_THEMES: Record<string, Record<string, string>> = {
  // Every colour below that is ever set as TEXT was measured on this palette's own card (#ffffff)
  // and clears 4.5:1. accentL is the one to watch: #00c8e0 is the brand cyan and measures 2.03:1 on
  // white, so on this palette the readable cyan is the deep one and the bright one is not used for
  // text at all.
  light:    { bg:'#f5f7fa', sidebar:'#0a0f16', rail:'#0a0f16', railInk:'#e8f0fb', railDim:'#8ea6c4',
              card:'#ffffff', border:'#e4e9f0', border2:'#d7dfe8', dim:'#cbd5e1', thead:'#f4f7fa',
              text:'#0f172a', muted:'#5b6b7f', accent:'#0a7285', accentL:'#086070', accentSoft:'#e2f4f8',
              green:'#046c4e', greenL:'#047857', red:'#b91c1c', redL:'#dc2626',
              amber:'#92400e', amberL:'#b45309', blue:'#1e40af', blueL:'#2563eb',
              shadow:'0 1px 2px rgba(16,24,40,0.06)' },
  dark:     { bg:'#07090e', sidebar:'#07090e', rail:'#0a0e15', railInk:'#e8f0fb', railDim:'#8ea6c4',
              card:'#0c1018', border:'#131c28', border2:'#1b2840', dim:'#1b2840', thead:'#101825',
              text:'#e8f0fb', muted:'#9db5d1', accent:'#00c8e0', accentL:'#33d8f0', accentSoft:'rgba(0,200,224,0.10)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.35)' },
  midnight: { bg:'#000000', sidebar:'#050508', rail:'#050508', railInk:'#ece9fb', railDim:'#a99dd1',
              card:'#0d0d14', border:'#1a1a2e', border2:'#16213e', dim:'#16213e', thead:'#12121f',
              text:'#ece9fb', muted:'#a99dd1', accent:'#7c3aed', accentL:'#9d65f5', accentSoft:'rgba(124,58,237,0.12)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.5)' },
  slate:    { bg:'#0f172a', sidebar:'#0f172a', rail:'#0b1220', railInk:'#e6eefb', railDim:'#94a9c4',
              card:'#1e293b', border:'#334155', border2:'#475569', dim:'#475569', thead:'#243044',
              text:'#e6eefb', muted:'#a8bcd4', accent:'#0ea5e9', accentL:C.indigo, accentSoft:'rgba(14,165,233,0.12)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.3)' },
  forest:   { bg:'#052e16', sidebar:'#04200f', rail:'#04200f', railInk:'#e4f6e9', railDim:'#8fbf9f',
              card:'#073b1d', border:'#166534', border2:'#15803d', dim:'#15803d', thead:'#0a4523',
              text:'#e4f6e9', muted:'#a6d4b4', accent:'#22c55e', accentL:'#4ade80', accentSoft:'rgba(34,197,94,0.14)',
              green:'#0f9d63', greenL:'#12b873', red:'#dc2626', redL:'#ef4444',
              amber:'#b45309', amberL:'#d97706', blue:'#2563eb', blueL:'#3b82f6',
              shadow:'0 1px 3px rgba(0,0,0,0.3)' },
};

/** A NEW KEY. The old `admin_theme` holds a value picked against the previous palette, when the panel
 *  could only be dark; honouring it would hide the redesign behind a months-old click. */
export const ADMIN_THEME_KEY = 'admin_theme_v2';
export const ADMIN_THEME_DEFAULT = 'light';

export function applyAdminTheme(id: string) {
  const t = ADMIN_THEMES[id] ?? ADMIN_THEMES.dark;
  const r = document.documentElement;
  Object.entries(t).forEach(([k, v]) => r.style.setProperty(`--admin-${k}`, v));
}

/** The stored choice, read safely. `localStorage` throws in a locked-down browser, and the
 *  placeholder must not be the thing that takes the whole app down. */
export function storedAdminTheme(): string {
  try { return localStorage.getItem(ADMIN_THEME_KEY) ?? ADMIN_THEME_DEFAULT; }
  catch { return ADMIN_THEME_DEFAULT; }
}
