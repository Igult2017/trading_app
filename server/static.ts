import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectPrefetch } from "./lib/injectPrefetch";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Immutable assets (hashed filenames) — cache for 1 year
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));

  // HOW LONG THE UNHASHED FILES ARE CACHED — measured 2026-08-23, see docs/performance-audit.md.
  //
  // These all sat at 1 HOUR, which meant a returning visitor re-fetched the font, the logo and the
  // favicon every hour. Measured against the live site, EVERY request costs about 750ms before its
  // first byte arrives — three round trips (connect, encrypt, ask) at ~250ms each — so re-fetching a
  // file that has not changed is three quarters of a second thrown away, per file. The font is the
  // worst of them: text cannot settle until it lands.
  //
  // WHY NOT ONE LONG DURATION FOR ALL OF THEM. Cache a file for a year and you cannot change it —
  // browsers keep the old copy until it expires. `/assets` gets away with a year because Vite puts a
  // content hash in those filenames, so a new build is a new name. These files have fixed names, so
  // the cache time IS the ceiling on how fast a change reaches people. They are split by how often
  // they actually change:
  //
  //   FONTS — a year. A woff2 for a named weight of a named face never changes; replacing the face
  //   means a new filename anyway.
  //
  //   LOGO / FAVICON / BROKER MARKS — a week. The logo was changed TWICE in August 2026 (the 5th and
  //   the 21st), so a month-long cache would have left visitors on a stale mark for weeks. A week
  //   still skips the round trip for essentially every repeat visit within a session or a few days,
  //   and bounds how long a change can hide.
  //
  //   EVERYTHING ELSE — the previous hour, unchanged.
  //
  // `etag`/`lastModified` stay on, so even after expiry the browser revalidates and gets a cheap 304
  // rather than re-downloading the bytes.
  //
  // THE PROPER FIX for the logo is a content hash in its filename, which would allow a year AND
  // instant updates. That touches the build and is deliberately not done here.
  const YEAR = 'public, max-age=31536000, immutable';
  const WEEK = 'public, max-age=604800';
  const HOUR = 'public, max-age=3600';
  const isFont = (p: string) => /\.(woff2?|ttf|otf)$/i.test(p);
  const isBrandArt = (p: string) => /(^|[\\/])(logo(-dark)?\.webp|favicon\.svg|broker-[^\\/]+)$/i.test(p);

  // THE DEPLOY STAMP — must never be cached, or it cannot report a deploy.
  //
  // Added 2026-10-10. `index:false` below already keeps the HTML shell fresh for a NEW page load,
  // but a tab that is already open never asks for the shell again, so it keeps running old code
  // indefinitely — and because every old hashed bundle is still served here, that old code keeps
  // WORKING, with no error to reveal it. He sat on a three-day-old build while the server was
  // serving the current one.
  //
  // The running app polls this file and reloads when the id differs (client/src/lib/buildVersion.ts).
  // ⚠ It is declared BEFORE the express.static below on purpose: that middleware would otherwise
  // serve this file with the one-HOUR default, which would cap how fast a deploy can be noticed at
  // an hour and make the whole mechanism pointless.
  app.get('/version.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.resolve(distPath, 'version.json'), (err) => {
      // Before the first build that emits it, or if it is missing: say so plainly rather than
      // letting the SPA fallback answer with HTML, which the client would fail to parse.
      if (err && !res.headersSent) res.status(404).json({ buildId: null });
    });
  });

  // index:false is load-bearing: without it, express.static serves index.html for "/" with the
  // maxAge below, so returning visitors keep a STALE HTML shell (pointing at old hashed asset
  // filenames) after every deploy — new code deployed but invisible until the cache expires or the
  // user hard-refreshes. With index:false, "/" and all SPA routes fall through to the no-cache
  // handler below, so the shell is always fresh and references the latest assets (which stay
  // immutably cached by their hash). This is what makes a deploy show up immediately instead of
  // needing Ctrl+Shift+R.
  app.use(express.static(distPath, {
    etag: true,
    lastModified: true,
    index: false,
    setHeaders(res, filePath) {
      res.setHeader('Cache-Control',
        isFont(filePath) ? YEAR : isBrandArt(filePath) ? WEEK : HOUR);
    },
  }));

  // SPA fallback — inject prefetch data then serve; never cache the HTML shell
  app.use("*", async (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const raw = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
    const html = await injectPrefetch(raw);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });
}
