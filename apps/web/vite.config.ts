import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";

// DEEVY_TARGET=workers adds the Cloudflare plugin so `vp build` emits the Worker
// next to the SPA (ADR-0006). The default build is the plain SPA served by
// apps/server; in dev it proxies the API to the Node server.
const workers = process.env.DEEVY_TARGET === "workers";

export default defineConfig({
  fmt: {},
  lint: {
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: { typeAware: true, typeCheck: true },
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  },
  plugins: lazyPlugins(() => [react(), tailwindcss(), ...(workers ? [cloudflare()] : [])]),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/rpc": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
      // An MCP client pointed at the dev origin has to reach the server, and
      // discovery has to answer from the same origin as the endpoint it
      // describes, or the OAuth dance in slice 7 looks at the wrong server.
      "/mcp": "http://localhost:3000",
      "/.well-known": "http://localhost:3000",
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
