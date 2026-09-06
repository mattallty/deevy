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
  pack: {
    // The seed is a second entry rather than a script run from source: Node
    // cannot resolve the workspace packages' `.ts` exports on its own, and the
    // pack already knows how (docs/DEVELOPMENT.md, "Running without an OAuth App").
    entry: ["src/index.ts", "src/seed.ts"],
    platform: "node",
    format: "esm",
    dts: false,
    // One self-contained file: no native modules (ADR-0008), so every
    // dependency is inlined and the Docker image ships dist/ alone.
    deps: { alwaysBundle: [/.*/], onlyBundle: false },
    copy: [{ from: "../../packages/db/drizzle", to: "dist" }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
