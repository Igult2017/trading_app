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

/** Remembers that we already cleared a stray service worker, so that reload cannot loop either. */
const SW_CLEARED = 'dtb-sw-cleared';

/**
 * REMOVE ANY SERVICE WORKER ON THIS ORIGIN. THIS APP HAS NEVER HAD ONE, so anything found here is
 * not ours and is intercepting requests it should not.
 *
 * WHY THIS EXISTS — the evidence, 2026-10-10. He reported that the Coolify address showed every
 * update while his own domain stayed stale until he opened a different Chrome profile:
 *
 *     http://nok80c8kksg00so08884ggk4.72.61.3.130.sslip.io/   always current
 *     https://www.fsdzones.cloud/                             stale, except in a fresh profile
 *
 * Both names resolve to the SAME server (72.61.3.130, no CDN) and return byte-identical responses —
 * same status, same no-store headers, the same ETag W/"6115-fxueX1Foh..." and the same build id. So
 * the server is provably not the difference. Whatever it is, it is stored in his browser, scoped to
 * one origin, survives a hard refresh, and is absent from a new profile.
 *
 * ⚠ ONE MECHANISM FITS ALL OF THAT, AND THE HTTP/HTTPS SPLIT IS WHY: a service worker can only run
 * on a secure origin. The sslip.io address is plain HTTP, so it CANNOT have one, which is exactly
 * why it is never stale. His domain is HTTPS and can. A registered worker sits in front of the
 * network, serves its own cached copies, and a hard refresh does not remove it.
 *
 * I CANNOT SEE HIS PROFILE, so I have not confirmed one is there — this removes it if it is, and
 * costs one cheap call if it is not. Nothing here can break the app: we register no worker, so
 * there is never one of ours to destroy.
 */
async function removeForeignServiceWorkers(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (!regs.length) return false;
    await Promise.all(regs.map(r => r.unregister().catch(() => false)));
    // Its cached copies outlive it, so they go too.
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
    }
    console.warn(`[build] removed ${regs.length} service worker(s) that this app never registered`);
    return true;
  } catch {
    return false;
  }
}

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

/**
 * Start watching. Called once from main.tsx.
 *
 * IT ALSO PUBLISHES THE RUNNING ID ON `window`, and that is not a nicety — it is the diagnostic
 * this mechanism was missing. On 2026-10-10 he reported seeing SOME new work and not other work in
 * the same deploy, and I could not tell whether his tab was stale or the change simply was not what
 * he expected, because nothing in a running page says which build it is. Now:
 *
 *     __APP_BUILD__            -> the build this tab is running
 *     await __APP_BUILD_CHECK__() -> { running, server, stale }
 *
 * Typed into the browser console, those answer in one line what otherwise costs a round trip.
 */
export function watchForNewBuild(): void {
  try {
    (window as any).__APP_BUILD__ = __BUILD_ID__;
    (window as any).__APP_BUILD_CHECK__ = async () => {
      const server = await serverBuildId();
      return { running: __BUILD_ID__, server, stale: !!server && server !== __BUILD_ID__ };
    };
  } catch { /* never let a diagnostic break the app */ }

  // A worker that is still in place would keep serving its own copies of everything, so it goes
  // BEFORE the version check — otherwise the check could be answered from its cache too. One
  // reload after removing it, guarded so it cannot repeat.
  void removeForeignServiceWorkers().then(removed => {
    if (!removed) return;
    try {
      if (sessionStorage.getItem(SW_CLEARED) === '1') return;
      sessionStorage.setItem(SW_CLEARED, '1');
    } catch { /* storage blocked — reloading once is still the right move */ }
    window.location.reload();
  });

  void check();
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  // Coming back to the tab is the moment a stale page is most likely AND the least disruptive
  // moment to replace it.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
