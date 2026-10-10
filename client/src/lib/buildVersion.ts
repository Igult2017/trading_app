/**
 * buildVersion — notice when a newer build has been deployed, and OFFER to load it.
 *
 * WHY IT EXISTS. `server/static.ts` sends the HTML shell with `no-cache, no-store`, so a NEW page
 * load always gets the latest code. But a tab that is ALREADY OPEN never asks for the shell again —
 * it keeps running whatever it loaded. And it keeps WORKING, because every old hashed bundle is
 * still on the server. Measured on the live site:
 *
 *     assets/index-D4l2Z83D.js    still served 200   (a build from three days earlier)
 *     assets/index-Dc991HIp.js    still served 200
 *
 * So a stale tab renders a complete, working, OLD site with no error of any kind, and nothing ever
 * pushes it forward.
 *
 * ⚠ IT ASKS, IT DOES NOT RELOAD YOU. Until 2026-10-10 this called `window.location.reload()` on a
 * five-minute timer, guarded only by a "are they typing" check that I wrote and never tested. In a
 * journal full of forms that is a real risk of losing someone's notes, to fix a problem that had
 * never actually bitten him. He chose option C: show a bar, let the person decide. Nothing in this
 * file navigates on its own any more.
 *
 * ⚠ WHAT WAS REMOVED, so nobody adds it back. This also used to unregister service workers, on the
 * theory that a stray one was serving him a stale copy. It was wrong: searching his Chrome profile
 * on disk found NO service worker record for the domain, and this app has never registered one. The
 * real cause was his browser holding that site at 50% zoom, which is not a delivery problem at all.
 * Deleted under the project's own rule about code that is not needed.
 */

// __BUILD_ID__ is declared globally in client/src/globals.d.ts (the footer stamp reads it too).

/** How often to ask, while the tab is in the foreground. */
const CHECK_EVERY_MS = 5 * 60 * 1000;

/** The version we have already offered, so the bar cannot reappear for the same build. */
const OFFERED_FOR = 'dtb-offered-build';

/** The id the SERVER is currently on, or null if it cannot be read. */
async function serverBuildId(): Promise<string | null> {
  try {
    // `no-store` matters: without it the browser can answer from its own cache and we would be
    // comparing the running build against an equally stale copy of the answer.
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.buildId === 'string' ? body.buildId : null;
  } catch {
    // Offline, or dev where the file does not exist and the SPA fallback returns HTML that will not
    // parse as JSON. Either way there is nothing to act on.
    return null;
  }
}

/** Already on screen? Only ever one. */
let barShown = false;

/**
 * The offer. Built with plain DOM calls on purpose — this module runs before React mounts, and it
 * must work on any page of the app regardless of which theme or layout is in charge.
 *
 * `position: fixed` so it can never push the page around, and dark with its own colours so it reads
 * on the pale landing page and the dark journal alike.
 */
function showUpdateBar(latest: string): void {
  if (barShown || typeof document === 'undefined') return;
  barShown = true;

  const bar = document.createElement('div');
  bar.setAttribute('role', 'status');
  bar.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:20px', 'transform:translateX(-50%)',
    'z-index:2147483000', 'display:flex', 'align-items:center', 'gap:14px',
    'padding:11px 14px 11px 18px', 'border-radius:12px',
    'background:#0f172a', 'color:#e8eefc', 'border:1px solid #27354d',
    'box-shadow:0 10px 34px rgba(0,0,0,.34)',
    "font:500 14px/1.3 'Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
    'max-width:calc(100vw - 32px)',
  ].join(';');

  const text = document.createElement('span');
  text.textContent = 'A newer version of this page is available.';

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Refresh';
  refresh.style.cssText = [
    'cursor:pointer', 'border:none', 'border-radius:8px', 'padding:8px 15px',
    'background:#2e86ff', 'color:#fff', 'font:700 13px/1 inherit', 'letter-spacing:.02em',
  ].join(';');
  // The ONLY place in this file that navigates, and a person has to press it.
  refresh.addEventListener('click', () => window.location.reload());

  const later = document.createElement('button');
  later.type = 'button';
  later.textContent = 'Not now';
  later.setAttribute('aria-label', 'Dismiss the update notice');
  later.style.cssText = [
    'cursor:pointer', 'border:none', 'background:transparent', 'color:#9fb0cc',
    'font:600 13px/1 inherit', 'padding:8px 4px',
  ].join(';');
  later.addEventListener('click', () => bar.remove());

  bar.append(text, refresh, later);
  document.body.appendChild(bar);

  // Remember the version we offered, so dismissing it is not undone by the next check five minutes
  // later. A genuinely newer build after this one will have a different id and will ask again.
  try { sessionStorage.setItem(OFFERED_FOR, latest); } catch { /* storage blocked: bar still shown */ }
}

async function check(): Promise<void> {
  if (document.visibilityState !== 'visible') return;   // nothing to see; don't spend the request
  if (barShown) return;

  const latest = await serverBuildId();
  if (!latest || latest === __BUILD_ID__) return;

  try {
    if (sessionStorage.getItem(OFFERED_FOR) === latest) return;   // already asked, they said no
  } catch { /* storage blocked — offering again is harmless */ }

  console.info(`[build] running ${__BUILD_ID__}, server has ${latest}`);
  showUpdateBar(latest);
}

/**
 * Start watching. Called once from main.tsx.
 *
 * IT ALSO PUBLISHES THE RUNNING ID ON `window`, and that is not a nicety — it is the diagnostic
 * that ended a multi-day hunt. Nothing in a running page said which build it was, so a stale tab
 * and a misread expectation looked identical. Now:
 *
 *     __APP_BUILD__                -> the build this tab is running
 *     await __APP_BUILD_CHECK__()  -> { running, server, stale }
 *
 * The same id is printed in the page footer, for anyone who should not need a console.
 */
export function watchForNewBuild(): void {
  try {
    (window as any).__APP_BUILD__ = __BUILD_ID__;
    (window as any).__APP_BUILD_CHECK__ = async () => {
      const server = await serverBuildId();
      return { running: __BUILD_ID__, server, stale: !!server && server !== __BUILD_ID__ };
    };
  } catch { /* never let a diagnostic break the app */ }

  void check();
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
