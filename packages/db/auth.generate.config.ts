// Used only by `pnpm generate:auth` (the `auth` CLI) to emit src/schema/auth.ts.
// It must mirror the Better Auth options that affect the schema in
// packages/core/src/auth.ts: additional user fields and plugins. It is a
// generation-time config, not a runtime one, so it opens an in-memory database.
import { apiKey } from "@better-auth/api-key";
import { mcp } from "@better-auth/mcp";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-sqlite";

import * as schema from "./src/schema/index.ts";

const db = drizzle(":memory:");
// The mcp plugin resolves its models and queries its own resource table as it
// initialises, so those tables have to exist before betterAuth() is
// constructed. `node scripts/bootstrap-auth-schema.ts` writes auth.bootstrap.ts
// with throwaway definitions read off the plugin; it is not committed, so this
// block is inert unless a regeneration is in progress.
// Resolved through a variable so the typechecker does not look for a file that
// is only ever on disk mid-regeneration.
const bootstrapModule = "./auth.bootstrap.ts";
const bootstrap = (await import(bootstrapModule).catch(() => null)) as {
  bootstrapSql?: string[];
} | null;
for (const statement of bootstrap?.bootstrapSql ?? []) db.$client.exec(statement);

export const auth = betterAuth({
  // The mcp plugin resolves its resource against this.
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(db, { provider: "sqlite", schema: { ...schema, ...bootstrap } }),
  emailAndPassword: { enabled: false },
  // Mirrors packages/core/src/auth.ts, whose apiKeyPlugins() this repeats:
  // only the plugin list shapes the schema, but the options stay identical so
  // the two files can be read side by side.
  plugins: [
    apiKey({
      defaultPrefix: "deevy_sk_",
      rateLimit: { enabled: false },
      customAPIKeyGetter: (ctx) => {
        const [scheme, token] = (ctx.headers?.get("authorization") ?? "").split(" ");
        if (scheme?.toLowerCase() !== "bearer" || !token) return null;
        return token.startsWith("deevy_sk_") ? token : null;
      },
    }),
    // deevy is its own authorization server for Human MCP clients (ADR-0007).
    // mcp() is the OAuth provider, so no separate oauthProvider goes beside it.
    jwt(),
    mcp({ loginPage: "/", consentPage: "/consent", resource: "http://localhost:3000/mcp" }),
  ],
  user: {
    additionalFields: {
      kind: {
        type: ["human", "agent"],
        required: false,
        defaultValue: "human",
        input: false,
      },
    },
  },
});
