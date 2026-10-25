import { AfterDelay, BONE_CSS } from '@/components/skeletons/shellBones';
import JournalShellSkeleton from '@/components/skeletons/JournalShellSkeleton';
import AdminShellSkeleton from '@/components/skeletons/AdminShellSkeleton';
import { ADMIN_THEMES, ADMIN_THEME_DEFAULT, storedAdminTheme } from '@/components/admin-ui/adminThemes';
import { THEMES, storedJournalTheme } from '@/hooks/useJournalSettings';

/**
 * The app-shell placeholder — the wait between "you are signed in" and "the screen is here", shown
 * while the journal or admin BUNDLE is still downloading, before a line of that page's own code
 * exists.
 *
 * ⚠ IT MUST LOOK LIKE THE PAGE IT STANDS IN FOR, and it did not. His report, 2026-10-12: *"Where
 * is this skeleton coming from? It doesnt look like any of the pages."*
 *
 * ⚠ AND HE HAD ASKED ONCE BEFORE. `DashboardSkeletons.tsx` carries the same sentence from
 * 2026-09-06 and was carefully measured in response — but that one only covers the SECOND loading
 * moment, once the journal is running and fetching data. This one, the first, was never brought in
 * line. Two placeholders for one page, only one of them accurate.
 *
 * ⚠ THE TWO VARIANTS ARE SEPARATE FILES ON PURPOSE. The old single tree conditioned every value on
 * one `admin` flag, and the journal's shape leaked straight through it: the admin screen was drawn
 * with the journal's six-column 4px-gap row and its 7fr/5fr split, neither of which the admin panel
 * has. The two pages share no measurement, so they share no code.
 *
 * ⚠ EVERY NUMBER IN BOTH WAS READ OFF THE RENDERED PAGE OR ITS SOURCE, never guessed. Guessing is
 * what produced the version he complained about, and two numbers in `DASH_GEOMETRY` were guesses
 * that measured wrong (card height 64 vs 80, panel height 240 vs 302) — both left the placeholder
 * short, so content slid upward the moment it arrived.
 */
export default function LoadingScreen({ variant = 'journal' }: { variant?: 'journal' | 'admin' }) {
  const admin = variant === 'admin';
  // THE GROUND IS PAINTED BEFORE THE DELAY ELAPSES, so the 400ms of "nothing" is the page's own
  // colour rather than a white flash. For the admin that colour is whichever of the five palettes
  // is stored, which is why this reads the key here as well.
  // ⚠ BOTH VARIANTS READ THEIR OWN SAVED THEME. The admin one always did; the journal one was a
  // hardcoded near-black, so a journal on the Light theme went white (first paint) -> near-black
  // (this screen) -> white (the page). `index.html` picks the same saved theme for the very first
  // frame, and this now agrees with it instead of overpainting it.
  const ground = admin
    ? (ADMIN_THEMES[storedAdminTheme()] ?? ADMIN_THEMES[ADMIN_THEME_DEFAULT]).bg
    : (THEMES[storedJournalTheme()] ?? THEMES.navy).bg;

  return (
    <div style={{ position: 'fixed', inset: 0, background: ground, display: 'flex', flexDirection: 'column' }}
         role="status" aria-label="Loading">
      <style>{BONE_CSS}</style>
      <AfterDelay>
        {admin ? <AdminShellSkeleton /> : <JournalShellSkeleton />}
      </AfterDelay>
    </div>
  );
}
