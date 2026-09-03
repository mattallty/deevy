// Used only by `pnpm generate:auth` (the `auth` CLI) to emit src/schema/auth.ts.
// It must mirror the Better Auth options that affect the schema in
// packages/core/src/auth.ts: additional user fields and plugins. It is a
// generation-time config, not a runtime one, so it opens an in-memory database.
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-sqlite";

const db = drizzle(":memory:");

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: false },
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
