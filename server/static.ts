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

  // Everything else — cache for 1 hour, must revalidate
  app.use(express.static(distPath, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
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
