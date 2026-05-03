import { useState, useCallback } from 'react';

export type ThemeId = 'navy' | 'midnight' | 'slate' | 'forest' | 'rose' | 'light';
export type FontId = 'montserrat' | 'dm-mono' | 'inter' | 'manrope' | 'sora' | 'jetbrains-mono' | 'plus-jakarta-sans';

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
}

export interface FontDef {
  label: string;
  stack: string;
  googleUrl: string;
  sample: string;
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  navy: {
    label: 'Navy',
    dark: true,
    bg: '#010409',
    sidebarBg: '#010409',
    surface: '#0d1117',
    text: '#cbd5e1',
    textMuted: 'rgba(148,163,184,0.6)',
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
    textMuted: '#505880',
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
    textMuted: '#5A7090',
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
    textMuted: '#4A7260',
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
    textMuted: '#7A4A58',
    border: '#2A1420',
    accent: '#fb7185',
    swatches: ['#130A0E', '#1C0F14', '#fb7185'],
  },
  light: {
    label: 'Light',
    dark: false,
    bg: '#EEF2F7',
    sidebarBg: '#E2E8F2',
    surface: '#FFFFFF',
    text: '#1E293B',
    textMuted: '#64748B',
    border: '#CBD5E1',
    accent: '#2563eb',
    swatches: ['#EEF2F7', '#FFFFFF', '#2563eb'],
  },
};

export const FONTS: Record<FontId, FontDef> = {
  montserrat: {
    label: 'Montserrat',
    stack: "'Montserrat', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap',
    sample: 'Aa Bb 0123',
  },
  'dm-mono': {
    label: 'DM Mono',
    stack: "'DM Mono', monospace",
    googleUrl: 'https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500&display=swap',
    sample: 'Aa Bb 0123',
  },
  inter: {
    label: 'Inter',
    stack: "'Inter', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    sample: 'Aa Bb 0123',
  },
  manrope: {
    label: 'Manrope',
    stack: "'Manrope', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
    sample: 'Aa Bb 0123',
  },
  sora: {
    label: 'Sora',
    stack: "'Sora', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap',
    sample: 'Aa Bb 0123',
  },
  'jetbrains-mono': {
    label: 'JetBrains Mono',
    stack: "'JetBrains Mono', monospace",
    googleUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap',
    sample: 'Aa Bb 0123',
  },
  'plus-jakarta-sans': {
    label: 'Plus Jakarta Sans',
    stack: "'Plus Jakarta Sans', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
    sample: 'Aa Bb 0123',
  },
};

function load(): JournalSettings {
  try {
    const raw = localStorage.getItem('journal_settings_v2');
    if (raw) {
      const parsed = JSON.parse(raw) as JournalSettings;
      if (!FONTS[parsed.font]) parsed.font = 'montserrat';
      if (!Array.isArray(parsed.hiddenPanels)) parsed.hiddenPanels = [];
      return parsed;
    }
  } catch {}
  return { theme: 'navy', font: 'montserrat', hiddenPanels: [] };
}

export function useJournalSettings() {
  const [settings, setSettingsState] = useState<JournalSettings>(load);

  const setSettings = useCallback((next: Partial<JournalSettings>) => {
    setSettingsState(prev => {
      const updated = { ...prev, ...next };
      localStorage.setItem('journal_settings_v2', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { settings, setSettings };
}
