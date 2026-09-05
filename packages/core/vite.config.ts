import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    // Named as a task so it is cached: `run.cache.scripts` is false at the root
    // for the generators' sake, and a task is the way to opt one script back in
    // without opting all of them in. Per package rather than at the root,
    // because a root task also applies to the workspace root, which has no test
    // config of its own and would run vitest over the whole tree.
    tasks: { test: { command: "vp test", output: [] } },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
