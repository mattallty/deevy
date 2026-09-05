import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // Cached, and per package: see packages/core/vite.config.ts.
    tasks: { test: { command: "vp test", output: [] } },
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
