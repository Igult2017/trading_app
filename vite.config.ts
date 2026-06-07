import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fontaine } from "vite-plugin-fontaine";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    fontaine({
      resolvePath: (id) => new URL("." + id, import.meta.url).pathname,
      fallbacks: {
        "Inter Variable":             ["Arial", "Helvetica Neue", "sans-serif"],
        "Playfair Display Variable":  ["Georgia", "Times New Roman", "serif"],
        "JetBrains Mono Variable":    ["Menlo", "Consolas", "monospace"],
        "Montserrat":                 ["Arial", "Helvetica Neue", "sans-serif"],
        "DM Mono":                    ["Menlo", "Consolas", "monospace"],
        "DM Serif Display":           ["Georgia", "Times New Roman", "serif"],
        "Onest":                      ["Arial", "Helvetica Neue", "sans-serif"],
        "Plus Jakarta Sans":          ["Arial", "Helvetica Neue", "sans-serif"],
      },
    }),
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
  },
  server: {
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
