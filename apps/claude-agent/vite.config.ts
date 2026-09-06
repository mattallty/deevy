import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // Cached, and per package: see packages/core/vite.config.ts.
    tasks: {
      // Tracked by what the suite reads, less two tool-managed files that differ
      // on every CI runner and kept every shard from replaying until 2026-09-06:
      // vitest's own results directory, and pnpm's install record (its prunedAt
      // and storeDir are the machine's). Patterns are relative to this package;
      // `**` does not reach the workspace root. A source this suite imports
      // still counts, as does a dependency's file under node_modules.
      test: {
        command: "vp test",
        input: [{ auto: true }, "!node_modules/.vite/**", "!../../node_modules/.modules.yaml"],
        output: [],
      },
    },
  },
  pack: {
    entry: ["src/main.ts"],
    platform: "node",
    format: "esm",
    dts: false,
    // The Agent SDK resolves a platform-specific CLI binary at runtime, so
    // bundling its JavaScript buys nothing and hides the dependency: it stays
    // external, and the runtime image installs exactly the pinned version.
    // Nothing else is in `dependencies`, so nothing else is external.
    deps: { neverBundle: ["@anthropic-ai/claude-agent-sdk"] },
    copy: [{ from: "src/instructions.md", to: "dist" }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
