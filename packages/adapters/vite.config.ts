import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // Cached, and per package: see packages/core/vite.config.ts.
    tasks: {
      // Tracked by what the suite reads, less vitest's own results directory: a
      // tool cache a fresh CI runner never has, which is why no shard ever
      // replayed before 2026-09-06. A source this suite imports still counts.
      test: { command: "vp test", input: [{ auto: true }, "!node_modules/.vite/**"], output: [] },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
