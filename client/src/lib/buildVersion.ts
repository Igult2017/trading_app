/**
 * buildVersion — notice that a new version has been deployed, and reload once to pick it up.
 *
 * WHY THIS EXISTS, 2026-10-10. He reported: *"Hard refresh does not work but openning it in a new
 * chrome profile shows you fixed it."* He was right, and the reason is worth writing down.
 *
 * `server/static.ts` already does the server half correctly — the HTML shell is sent with
 * `no-cache, no-store` so a NEW page load always gets the latest asset filenames. But a tab that is
 * ALREADY OPEN never asks for the shell again. It just keeps running the JavaScript it loaded
 * however long ago.
 *
 * And it keeps working, which is what makes this invisible: every old hashed bundle is still on the
 * server and still answers 200. Checked on the live site —
 *
 *     assets/index-D4l2Z83D.js   still served   (a build from three days earlier)
 *     assets/index-Dc991HIp.js   still served
 *     assets/Journal-JsrDndEf.js still served
 *
 * So a stale tab renders a complete, working, OLD site with no error of any kind. Nothing ever
 * forces it to update. That is why he sat on an old build for days while the server was serving the
 * new one the whole time.
 *
 * ⚠ I TOLD HIM CACHING COULD NOT DO THIS, AND I WAS WRONG. My reasoning was that a content hash in
 * the filename makes a stale bundle impossible — which only holds if the old file STOPS EXISTING.
 * It does not. Do not repeat that argument.
 *
 * HOW IT WORKS: the build stamps an id into the bundle (`__BUILD_ID__`, set in vite.config.ts) and
 * writes the same id to `/version.json`. This asks the server for that file now and then; if the id
 * differs from the one baked into the running code, a newer build exists and the page reloads.
 */

declare const __BUILD_ID__: string;

/** How often to ask, while the tab is in the foreground. */
const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Remembers which version we already reloaded for, so a failed update cannot loop. */
const RELOADED_FOR = 'dtb-reloaded-for-build';

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

/**
 * ⚠ NEVER RELOAD WHILE HE IS TYPING. This runs on a timer in a journal full of forms, and throwing
 * a reload at someone mid-sentence would lose what they wrote — a far worse bug than the stale page
 * this fixes. The check repeats, so it simply updates at the next quiet moment instead.
 */
function isBusyTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

async function check(): Promise<void> {
  if (document.visibilityState !== 'visible') return;   // nothing to see; don't spend the request
  if (isBusyTyping()) return;

  const latest = await serverBuildId();
  if (!latest || latest === __BUILD_ID__) return;

  // THE LOOP GUARD. If the reload somehow does not land on the new build — a proxy, an extension,
  // a browser holding the shell anyway — reloading again would spin forever. One attempt per new
  // id per tab, then leave it alone.
  try {
    if (sessionStorage.getItem(RELOADED_FOR) === latest) return;
    sessionStorage.setItem(RELOADED_FOR, latest);
  } catch {
    // Storage blocked (private window, blocked cookies). Reloading once is still right; we just
    // cannot remember it, so fall through rather than skipping the update entirely.
  }

  console.info(`[build] running ${__BUILD_ID__}, server has ${latest} — reloading`);
  window.location.reload();
}

/** Start watching. Called once from main.tsx. */
export function watchForNewBuild(): void {
  void check();
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  // Coming back to the tab is the moment a stale page is most likely AND the least disruptive
  // moment to replace it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
