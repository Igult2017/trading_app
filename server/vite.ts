import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";

// DELETED 2026-08-23: `log` and `serveStatic` lived here with NO importers — both entry points
// (`index.ts`, `index.prod.ts`) take them from `./static`. The dead `serveStatic` was the real
// hazard: same name, adjacent file, but with NO cache headers and NO `index:false`, so importing
// it by mistake would have silently undone both the asset caching and the fix that makes a deploy
// visible without a hard refresh. `setupVite` below is live — dynamically imported by index.ts
// for the dev server.
import { nanoid } from "nanoid";
import { injectPrefetch } from "./lib/injectPrefetch";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Log the error but do NOT exit — a single Vite transform error
        // should never bring down the whole server (causes Bad Gateway on reload).
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const transformed = await vite.transformIndexHtml(url, template);
      const page = await injectPrefetch(transformed);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
