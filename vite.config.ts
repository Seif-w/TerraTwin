import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { applyTokens, metaTokens, prerender } from "./scripts/prerender.mjs";

/** Crawler-visible initial HTML. A bare <div id="root"> would give a search engine an empty
 *  page, so the artifact numbers are written into the shell at build time and React takes
 *  over on mount. Nothing is hand-typed: the block is generated from data/ on every build. */
function prerenderShell() {
  return {
    name: "terratwin-prerender",
    transformIndexHtml(html: string) {
      const body = prerender(process.cwd());
      const tokens = metaTokens(
        JSON.parse(readFileSync(resolve("public/data/ml_products.json"), "utf8")),
        JSON.parse(readFileSync(resolve("public/data/bodies.json"), "utf8")),
        JSON.parse(readFileSync(resolve("public/data/terratwin_ml_ranked.json"), "utf8")),
      );
      return applyTokens(html.replace('<div id="root"></div>', `<div id="root">${body}</div>`), tokens);
    },
  };
}

// Static artifact site: no server API, no proxy. Preview binds the configured port.
export default defineConfig({
  plugins: [react(), prerenderShell()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    // Cloud Preview and the sandbox port forwarder reach this dev server through a
    // platform host name, so the Vite host check must accept it.
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          globe: ["globe.gl"],
          charts: ["chart.js"],
        },
      },
    },
  },
});
