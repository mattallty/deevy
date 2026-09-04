// Used only by `pnpm generate:auth` (the `auth` CLI) to emit src/schema/auth.ts.
// It must mirror the Better Auth options that affect the schema in
// packages/core/src/auth.ts: additional user fields and plugins. It is a
// generation-time config, not a runtime one, so it opens an in-memory database.
import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-sqlite";

const db = drizzle(":memory:");

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
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
