/**
 * Build-time constants that Vite substitutes into the bundle.
 *
 * `__BUILD_ID__` is set by `define` in vite.config.ts and is written to /version.json by the same
 * build, so the two can be compared. Declared globally because two places read it: the watcher that
 * reloads a stale tab (client/src/lib/buildVersion.ts) and the visible stamp in the footer.
 */
declare const __BUILD_ID__: string;
