import { defineConfig } from "drizzle-kit";

// Migrations are generated here and applied by the runtime migrator on Node
// (packages/adapters/src/node) or by `wrangler d1 migrations apply` on Workers.
// Never run `drizzle-kit migrate` against D1 (ADR-0008).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
});
