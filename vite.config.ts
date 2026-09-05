import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "docs/research/**",
      "packages/db/drizzle/**",
      "packages/db/src/schema/auth.ts",
      "packages/core/openapi.json",
      // Written by snapshot:mcp-tools and diffed in CI; the generator owns its
      // shape, so the formatter must not have an opinion about it.
      "packages/core/mcp-tools.json",
    ],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // shadcn components are vendored: `shadcn add --overwrite` rewrites
        // them wholesale (CLAUDE.md), so a finding in one is not something
        // anybody can act on and comes back with the next update. The rule is
        // off for that directory rather than the directory being ignored —
        // `ignorePatterns` would take the files out of the typechecker too,
        // and a real type error in a component we ship should still fail.
        files: ["apps/web/src/components/ui/**"],
        rules: { "typescript/restrict-template-expressions": "off" },
      },
      {
        files: [
          "apps/claude-agent/**",
          "apps/server/**",
          "apps/web/scripts/**",
          "packages/adapters/src/node/**",
          "packages/db/scripts/**",
          "packages/core/scripts/**",
        ],
        env: { node: true },
      },
    ],
  },
  run: {
    // package.json scripts include generators with side effects (snapshot:openapi,
    // generate), so only vite.config tasks are cached.
    cache: { scripts: false, tasks: true },
  },
});
