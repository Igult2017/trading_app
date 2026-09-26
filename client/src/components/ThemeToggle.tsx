/**
 * The light/dark switch, for a surface that has no palette picker of its own.
 *
 * ══ WHAT THIS USED TO BE ════════════════════════════════════════════════════════════════════════
 *
 * The fourth of four disconnected theme systems, and the only one that never ran: it held its own
 * `useState`, wrote its own `localStorage.theme` key, toggled `<html>.dark` — and **nothing in the app
 * rendered it**. So `localStorage.theme` had a writer that never executed and a reader that never
 * existed, while the journal, the admin panel and FX Copier each kept a private answer to the same
 * question. That is why there was no switch that could drive the app: there was nothing for one to drive.
 *
 * It now reads and writes `lib/appTheme`, the single owner. Wherever it is rendered, it flips the whole
 * app — the journal's palette, the admin panel's, FX Copier's — and it shows the mode any of those set.
 */
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/appTheme';

export default function ThemeToggle() {
  const [mode, setMode] = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
      className="w-9 h-9"
      aria-label={mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      title={mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      data-testid="button-theme-toggle"
    >
      {mode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  );
}
