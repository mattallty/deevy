import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // Cached, and per package: see packages/core/vite.config.ts.
    tasks: { test: { command: "vp test", output: [] } },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
