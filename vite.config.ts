import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "docs/research/**",
      "packages/db/drizzle/**",
      "packages/db/src/schema/auth.ts",
      "packages/core/openapi.json",
    ],
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: [
          "apps/server/**",
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
