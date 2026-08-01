import { useState, useCallback } from 'react';

export type ThemeId = 'navy' | 'midnight' | 'slate' | 'forest' | 'rose' | 'light';
export type FontId = 'playfair-display' | 'montserrat' | 'dm-mono' | 'inter' | 'manrope' | 'sora' | 'jetbrains-mono' | 'plus-jakarta-sans';

export interface JournalSettings {
  theme: ThemeId;
  font: FontId;
  hiddenPanels: string[];
}

// All toggleable panel IDs with their labels, grouped by step
export const JOURNAL_PANELS: { step: number; stepLabel: string; id: string; label: string; critical?: boolean }[] = [
  { step: 1, stepLabel: 'Decision',  id: 'core-thesis',     label: 'Core Thesis' },
  { step: 1, stepLabel: 'Decision',  id: 'pre-entry-state', label: 'Pre-Entry State Check' },
  { step: 1, stepLabel: 'Decision',  id: 'classification',  label: 'Classification & Quality' },
  { step: 1, stepLabel: 'Decision',  id: 'rule-governance', label: 'Rule Governance' },
  { step: 1, stepLabel: 'Decision',  id: 'impulse-control', label: 'Impulse Control Check' },
  { step: 2, stepLabel: 'Execution', id: 'screenshots',      label: 'Trade Screenshots' },
  { step: 2, stepLabel: 'Execution', id: 'position-details', label: 'Position Details', critical: true },
  { step: 2, stepLabel: 'Execution', id: 'timing-duration',  label: 'Timing & Duration' },
  { step: 2, stepLabel: 'Execution', id: 'tf-analysis',      label: 'Timeframe Analysis' },
  { step: 2, stepLabel: 'Execution', id: 'entry-management', label: 'Entry & Trade Management' },
  { step: 3, stepLabel: 'Context',   id: 'market-env',       label: 'Market Environment' },
  { step: 3, stepLabel: 'Context',   id: 'htf-context',      label: 'Higher Timeframe Context' },
  { step: 3, stepLabel: 'Context',   id: 'tech-signals',     label: 'Technical Signals' },
  { step: 3, stepLabel: 'Context',   id: 'key-level',        label: 'Key Level Analysis' },
  { step: 3, stepLabel: 'Context',   id: 'quality-scores',   label: 'Setup Quality Scores' },
  { step: 4, stepLabel: 'Review',    id: 'exit-causation',   label: 'Exit Causation', critical: true },
  { step: 4, stepLabel: 'Review',    id: 'perf-data',        label: 'Performance Data', critical: true },
  { step: 4, stepLabel: 'Review',    id: 'plan-vs-exec',     label: 'Planning vs Execution' },
  { step: 4, stepLabel: 'Review',    id: 'trade-metrics',    label: 'Trade Metrics' },
  { step: 4, stepLabel: 'Review',    id: 'psych-state',      label: 'Psychological State' },
  { step: 4, stepLabel: 'Review',    id: 'trade-debrief',    label: 'Trade Debrief' },
];

export interface ThemeDef {
  label: string;
  dark: boolean;
  bg: string;
  sidebarBg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  swatches: [string, string, string];
  /**
   * Light-theme-only extras. Optional so the five dark themes are untouched — they were brought to
   * AA in their own pass and nothing here should disturb them. Consumers must fall back:
   * `T.panelAlt ?? T.surface`, `T.faint ?? T.textMuted`, `T.borderStrong ?? T.border`.
   */
  panelAlt?: string;
  borderStrong?: string;
  faint?: string;
}

export interface FontDef {
  label: string;
  stack: string;
  sample: string;
  /**
   * Weight Journal force-sets on every element (font-weight:<n>!important).
   * 900 suits the geometric sans faces it was chosen for. `null` means DON'T force one — each
   * panel keeps its own weights, so headings stay bold and body stays regular. Playfair is a
   * high-contrast display serif that turns to mush at 900 in 10-12px UI text, and the look people
   * actually like from it (see features/trade-sync) comes from its natural 400-700 range.
   */
  forceWeight: number | null;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  navy: {
    label: 'Navy',
    dark: true,
    bg: '#010409',
    sidebarBg: '#010409',
    surface: '#0d1117',
    text: '#cbd5e1',
    textMuted: 'rgba(148,163,184,0.8)',   // .6 was 3.38:1 on bg — below AA; .8 = 5.34:1
    border: 'rgba(255,255,255,0.05)',
    accent: '#38bdf8',
    swatches: ['#010409', '#0d1117', '#38bdf8'],
  },
  midnight: {
    label: 'Midnight',
    dark: true,
    bg: '#06070F',
    sidebarBg: '#040610',
    surface: '#0D0F1C',
    text: '#E2E6F4',
    textMuted: '#7981AB',   // was #505880 — 2.92:1 on bg, below AA; now 5.30:1
    border: '#161930',
    accent: '#818cf8',
    swatches: ['#06070F', '#0D0F1C', '#818cf8'],
  },
  slate: {
    label: 'Slate',
    dark: true,
    bg: '#0B1320',
    sidebarBg: '#07101C',
    surface: '#111E2D',
    text: '#D0DAEC',
    textMuted: '#768BA9',   // was #5A7090 — 3.68:1 on bg, below AA; now 5.35:1
    border: '#1A2840',
    accent: '#7dd3fc',
    swatches: ['#0B1320', '#111E2D', '#7dd3fc'],
  },
  forest: {
    label: 'Forest',
    dark: true,
    bg: '#070F0A',
    sidebarBg: '#040A07',
    surface: '#0B1610',
    text: '#C4D9CB',
    textMuted: '#5E9079',   // was #4A7260 — 3.57:1 on bg, below AA; now 5.31:1
    border: '#142018',
    accent: '#34d399',
    swatches: ['#070F0A', '#0B1610', '#34d399'],
  },
  rose: {
    label: 'Rose',
    dark: true,
    bg: '#130A0E',
    sidebarBg: '#0D0608',
    surface: '#1C0F14',
    text: '#EDD4DC',
    textMuted: '#AC7786',   // was #7A4A58 — 2.74:1 on bg, below AA; now 5.32:1
    border: '#2A1420',
    accent: '#fb7185',
    swatches: ['#130A0E', '#1C0F14', '#fb7185'],
  },
  light: {
    label: 'Light',
    dark: false,
    // WARM off-white palette, adopted 2026-08-01 from the reference design the user supplied.
    // Only the COLOUR TOKENS and the text-weight rules crossed over from it — no layout, no
    // components, no accent palette. The previous cool-grey canvas (#EEF2F8 / #E2E8F0) is gone.
    bg: '#FFFEFB',          // warm canvas
    sidebarBg: '#FFFFFF',   // clean white rail
    surface: '#FFFFFF',     // cards/panels
    text: '#141310',        // near-black, ~19:1 on surface
    textMuted: '#5C5646',   // labels — 7.4:1 on surface, comfortably AA at 11-12px
    border: '#E7E2D5',      // warm hairline
    accent: '#2563eb',      // blue-600 — kept; the existing accent was never the problem
    swatches: ['#FFFEFB', '#FFFFFF', '#2563eb'],
    panelAlt: '#FBFAF6',    // progress tracks, wells, zebra rows
    borderStrong: '#D9D2BF',
    faint: '#7A735F',       // axes, timestamps — 4.9:1, still AA
  },
};

// All families are self-hosted via Fontsource (imported in index.css) — no Google
// Fonts request. Variable packages register a "<Name> Variable" family, so those
// stacks list the variable name first with the static name as a fallback.
export const FONTS: Record<FontId, FontDef> = {
  // Self-hosted already: index.css imports @fontsource-variable/playfair-display, which
  // registers the 'Playfair Display Variable' family — no Google Fonts request needed.
  'playfair-display': {
    label: 'Playfair Display',
    stack: "'Playfair Display Variable', 'Playfair Display', Georgia, serif",
    sample: 'Aa Bb 0123',
    forceWeight: null,   // keep each panel's own weights — see FontDef.forceWeight
  },
  montserrat: {
    label: 'Montserrat',
    stack: "'Montserrat', sans-serif",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  'dm-mono': {
    label: 'DM Mono',
    stack: "'DM Mono', monospace",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  inter: {
    label: 'Inter',
    stack: "'Inter Variable', 'Inter', sans-serif",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  manrope: {
    label: 'Manrope',
    stack: "'Manrope Variable', 'Manrope', sans-serif",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  sora: {
    label: 'Sora',
    stack: "'Sora Variable', 'Sora', sans-serif",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  'jetbrains-mono': {
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
  'plus-jakarta-sans': {
    label: 'Plus Jakarta Sans',
    stack: "'Plus Jakarta Sans', sans-serif",
    sample: 'Aa Bb 0123',
    forceWeight: 900,
  },
};

const SETTINGS_KEY = 'journal_settings_v2';
const DEFAULT_FONT: FontId = 'playfair-display';
/** Marker for the one-time move off the old 'montserrat' default. Presence = already applied. */
const FONT_DEFAULT_MIGRATION_KEY = 'journal_settings_font_default_playfair';
/**
 * v2 — the pass above only rescued devices saved on 'montserrat', yet it stamped its marker on EVERY
 * device it ran on, so anything saved on any other font can never be reached by it again.
 * localStorage is PER-DEVICE, so a phone that had some other font saved kept showing it while the
 * same account on desktop showed Playfair — which is exactly how this surfaced ("the whole journal
 * is not using playfair on mobile"). Move the remainder across, once.
 */
const FONT_DEFAULT_MIGRATION_KEY_V2 = 'journal_settings_font_default_playfair_v2';

function load(): JournalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as JournalSettings;
      // Validate every field — a stale/invalid persisted theme (e.g. a renamed theme
      // from an older build) must fall back to the default, not leave THEMES[theme]
      // undefined (which renders a white background).
      if (!THEMES[parsed.theme]) parsed.theme = 'navy';
      if (!FONTS[parsed.font]) parsed.font = DEFAULT_FONT;
      if (!Array.isArray(parsed.hiddenPanels)) parsed.hiddenPanels = [];

      // Changing DEFAULT_FONT only reaches people with nothing saved — everyone else already has
      // font:'montserrat' persisted and would never see the new default. Move that group across
      // ONCE. Runs a single time, so re-picking Montserrat afterwards sticks, and it leaves theme
      // and hiddenPanels alone (bumping the whole settings key would have wiped both).
      if (!localStorage.getItem(FONT_DEFAULT_MIGRATION_KEY)) {
        localStorage.setItem(FONT_DEFAULT_MIGRATION_KEY, '1');
        if (parsed.font === 'montserrat') {
          parsed.font = DEFAULT_FONT;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
        }
      }
      // v2 (see the constant): catches every device the first pass stamped but did not move — any
      // saved font that is not the default, on any device. Touches ONLY `font`; theme and
      // hiddenPanels are left exactly as they are. Runs a single time, so a font picked after this
      // still sticks.
      if (!localStorage.getItem(FONT_DEFAULT_MIGRATION_KEY_V2)) {
        localStorage.setItem(FONT_DEFAULT_MIGRATION_KEY_V2, '1');
        if (parsed.font !== DEFAULT_FONT) {
          parsed.font = DEFAULT_FONT;
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
        }
      }
      return parsed;
    }
  } catch {}
  return { theme: 'navy', font: DEFAULT_FONT, hiddenPanels: [] };
}

export function useJournalSettings() {
  const [settings, setSettingsState] = useState<JournalSettings>(load);

  const setSettings = useCallback((next: Partial<JournalSettings>) => {
    setSettingsState(prev => {
      const updated = { ...prev, ...next };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { settings, setSettings };
}
