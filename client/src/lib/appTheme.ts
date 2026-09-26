/**
 * ONE SWITCH. The app's light/dark mode, owned in one place and read by every surface.
 *
 * ══ THE ROOT CAUSE THIS EXISTS FOR ══════════════════════════════════════════════════════════════
 *
 * His report, 2026-09-26: *"FX Copier uses an isolated colour and it also does not use the app's white
 * theme switch. I want you to consolidate it so I switch themes from one switch."* He is describing a
 * symptom of something bigger — surveyed across the codebase, there was no single answer to "what theme
 * is this app in". There were **four**, none of which knew about the others:
 *
 * | owner | state | default | who can see it |
 * |---|---|---|---|
 * | the journal | `localStorage.journal_settings_v2.theme` — 6 palettes, one of them `light` | navy | `.journal-root` only |
 * | the admin panel | its own palette picker, 5 palettes | its own | `--admin-*` only |
 * | FX Copier | `useState<"light"\|"dark">("dark")` in `useTradeSync` — **not persisted at all** | dark | `.ct-app` only |
 * | the public pages | `localStorage.theme` + `<html>.dark`, written by `ThemeToggle.tsx` — **which nothing renders** | dark | nothing |
 *
 * So there was no switch that could drive the app, because there was nothing for a switch to drive. FX
 * Copier's own tokens even say it out loud: *"Every token is declared on `.ct-app` rather than `:root`,
 * so this UI carries its own palette and cannot read or pollute the host app's theme variables."* That
 * isolation is right for the PALETTE and wrong for the MODE — a user who has asked for a light app has
 * asked for all of it.
 *
 * ══ WHAT THIS OWNS, AND WHAT IT DELIBERATELY DOES NOT ═══════════════════════════════════════════
 *
 * It owns ONE fact: **light or dark.** It does not own palettes. The journal keeps its six (navy,
 * midnight, slate, forest, rose, light) and the admin keeps its five, because those are brand choices per
 * surface and flattening them would be a redesign nobody asked for. What changes is that every one of
 * them now DERIVES from, and publishes to, the same mode:
 *
 *   - picking `light` in the journal sets the mode to light, and FX Copier and the admin follow;
 *   - picking any dark palette sets it to dark, and they follow;
 *   - toggling FX Copier's own button sets the mode, and the journal follows — one switch, either end.
 *
 * ══ HOW IT REACHES THE CSS ══════════════════════════════════════════════════════════════════════
 *
 * Both `<html data-theme="light|dark">` and the `.dark` class, because the codebase already has consumers
 * of each: `index.css` declares `:root` / `.dark` blocks in the shadcn convention, and a `data-` attribute
 * is what a non-Tailwind sheet can select on without fighting specificity. Writing both costs nothing and
 * means a surface can use whichever fits it.
 *
 * `useSyncExternalStore` rather than a context, so a component can read the mode without every surface
 * having to be wrapped in a provider — FX Copier renders inside the journal, the admin does not, and the
 * public pages share nothing with either.
 */
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark';

/**
 * ONE KEY, AND IT IS NOT ONE OF THE OLD ONES.
 *
 * `localStorage.theme` was `ThemeToggle`'s, and that component is dead code that nothing renders — a key
 * whose only writer never ran. Reusing it would inherit whatever a browser happens to be holding from a
 * build where it did. `journal_settings_v2` stays the journal's PALETTE store and is not touched here.
 */
const KEY = 'fmj_theme_mode';

const listeners = new Set<() => void>();
let current: ThemeMode | null = null;

function read(): ThemeMode {
  if (current) return current;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return (current = stored);
  } catch { /* private mode, blocked storage — fall through */ }
  // NO SAVED CHOICE FALLS BACK TO THE JOURNAL'S, not to a hardcoded default. Someone who has been using
  // the light journal for months should not meet a dark FX Copier the first time this ships.
  try {
    const journal = JSON.parse(localStorage.getItem('journal_settings_v2') ?? '{}');
    if (journal?.theme) return (current = journal.theme === 'light' ? 'light' : 'dark');
  } catch { /* unparseable — fall through */ }
  return (current = 'dark');
}

/** Paint the mode onto <html> so CSS can select on it, and remember it. */
function apply(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;          // native form controls, scrollbars and autofill follow too
}

export function getThemeMode(): ThemeMode {
  return read();
}

/**
 * Set the mode. Safe to call on every render — it returns early when nothing changed, so a component
 * can simply publish what it believes without tracking whether it is the one that changed it.
 */
export function setThemeMode(mode: ThemeMode): void {
  const changed = read() !== mode;
  current = mode;
  // ALWAYS PERSIST, even when the value did not change.
  //
  // An early `if (read() === mode) return;` looks right and is a bug: `read()` DERIVES a mode from the
  // journal's palette when nothing is stored, so the first explicit choice that happens to agree with
  // that derivation was never written down. Verified in the browser — the journal set light,
  // `<html data-theme>` said light, and `localStorage.fmj_theme_mode` was still null, so the choice was
  // re-derived on every load instead of being remembered. Only the NOTIFY is skipped when nothing moved,
  // which is what stops a render loop.
  try { localStorage.setItem(KEY, mode); } catch { /* not fatal — the session still switches */ }
  apply(mode);
  if (changed) listeners.forEach((l) => l());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // ANOTHER TAB COUNTS. Two journal tabs open is normal, and one of them switching to light while the
  // other stays dark is the same "it did not follow" complaint in a different shape.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY || !e.newValue) return;
    if (e.newValue === 'light' || e.newValue === 'dark') {
      current = e.newValue;
      apply(current);
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

/** The mode, as React state. Re-renders every subscriber when any surface changes it. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, read, () => 'dark' as ThemeMode);
}

/** The mode plus a setter, for a surface that owns a toggle. */
export function useTheme(): [ThemeMode, (m: ThemeMode) => void] {
  return [useThemeMode(), setThemeMode];
}

/**
 * Paint the stored mode before React mounts.
 *
 * WITHOUT THIS THE FIRST PAINT IS THE WRONG COLOUR. `<html>` carries no mode until a component runs an
 * effect, so a light-theme user sees a dark flash on every load — and this codebase already fought that
 * once (App.tsx: *"a literal white flash… he reported staring at an empty screen after signing in"*).
 * Called from main.tsx, before render.
 */
export function initThemeMode(): void {
  apply(read());
}
