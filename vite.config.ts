import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/**
 * ONE ID PER BUILD, stamped into the bundle AND written to `/version.json`.
 *
 * The running app compares the two and reloads itself when they differ — see
 * `client/src/lib/buildVersion.ts` for why that is needed at all (short version: an already-open
 * tab never re-requests the HTML shell, and every old hashed bundle is still served, so a stale tab
 * keeps working perfectly and never notices a deploy).
 *
 * A timestamp, not a content hash, and deliberately: it has to change on every deploy, including a
 * redeploy of the same commit, because "the files on the server changed" is the thing we are
 * detecting. The cost of being wrong is one reload.
 */
const BUILD_ID = Date.now().toString(36);

/** Writes the id where the browser can ask for it. */
function emitVersionFile(): Plugin {
  return {
    name: "emit-version-file",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }),
      });
    },
  };
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    emitVersionFile(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // SPLIT THE BUNDLE (2026-08-30). Everything used to ship as ONE 2,130 KB file, so somebody
    // arriving on a blog article from a search result downloaded the whole application — admin
    // panel, journal, charting, all of it — before a word appeared. Pages are now loaded on
    // demand (see App.tsx) and the big shared libraries get their own files, which also means a
    // visitor's browser can keep them cached across releases instead of re-downloading everything
    // whenever any page changes.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom", "wouter"],
          "vendor-query":  ["@tanstack/react-query", "@tanstack/react-query-persist-client"],
          // recharts is deliberately NOT named here. Naming it created a chunk that the HTML
          // preloaded on EVERY page — 148 KB compressed of charting arriving on a blog article
          // that draws no charts. Left unnamed, it lands inside the pages that actually use it
          // (the admin panel) and a blog visitor never fetches it.
          "vendor-icons":  ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
