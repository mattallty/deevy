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
    // Nothing is in `dependencies`: the harness is a CLI the image installs
    // at a pinned version and the runtime finds on PATH (src/harness/run.ts).
    copy: [{ from: "src/instructions.md", to: "dist" }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    /**
     * Vitest's 5s default is the wrong budget for this package. Its tests run
     * the real thing — git subprocesses against a real bare repository, a
     * loopback proxy, a deevy of their own — and the slowest is ~1.4s on an
     * idle machine. Under `vp run -r test`, where seven packages share the
     * CPU, the same test has been seen at 5s and failing: not a hang, ten
     * times the wall clock for the same work. A hung test still fails here,
     * twenty seconds later rather than five.
     */
    testTimeout: 20_000,
  },
});
