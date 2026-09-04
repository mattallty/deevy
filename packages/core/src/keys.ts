import type { Db } from "@deevy/db";
import { apikey } from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Auth } from "./auth.ts";
import type { AppContext } from "./operations/registry.ts";

/**
 * The seam between the `agents.keys.*` operations and whatever stores API keys.
 *
 * An Agent reaches the API with `Authorization: Bearer deevy_sk_…`
 * (docs/plans/m2.md). Issuing, listing and revoking those keys is the Better
 * Auth `apiKey` plugin's job: it owns the `apikey` table and the verification
 * that turns a bearer into a user. The operations do not, so they talk to this
 * interface and the plugin is wired in behind it.
 *
 * `betterAuthKeys` below is the implementation. Issuing goes through the
 * plugin; listing and revoking do not, because `auth.api.listApiKeys` and
 * `auth.api.deleteApiKey` sit behind `sessionMiddleware` and are hard-scoped to
 * the caller's own `session.user.id`, with no server-side `userId` escape hatch
 * of the kind `createApiKey` has. A Sponsor managing an Agent's keys is exactly
 * the case that scoping forbids, so those two read and write the plugin's own
 * table directly, always filtered by the Agent's user id.
 */
export interface ApiKeys {
  /** Mints a key for an Agent's Better Auth user; the plaintext is returned exactly once. */
  issue(input: IssueKeyInput): Promise<IssuedKey>;
  /** Every key that identity holds, without any plaintext. */
  list(input: { userId: string }): Promise<ApiKeySummary[]>;
  /** Retires one key. Returns false when that identity holds no such key. */
  revoke(input: { userId: string; keyId: string }): Promise<boolean>;
}

export interface IssueKeyInput {
  /** The Better Auth user behind the Agent Member (ADR-0007). */
  userId: string;
  name: string;
  /** Null never expires, which is the default an agent loop needs. */
  expiresInDays?: number | null;
}

/** A key as any surface may show it: everything but the secret. */
export const ApiKeySummarySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  /** The leading characters, so a Human can tell two keys apart. */
  start: z.string().nullable(),
  createdAt: z.date(),
  lastRequestAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  enabled: z.boolean(),
});
export type ApiKeySummary = z.infer<typeof ApiKeySummarySchema>;

/** What issuing gives back: the summary plus the one and only sight of the key. */
export const IssuedKeySchema = ApiKeySummarySchema.extend({ key: z.string() });
export type IssuedKey = z.infer<typeof IssuedKeySchema>;

/**
 * The store this request may use. Absent means nothing wired it up, which is a
 * misconfiguration rather than a caller's mistake, so it reads as one.
 */
export function apiKeysOf(context: AppContext): ApiKeys {
  if (!context.apiKeys) {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "This deevy instance cannot issue API keys",
    });
  }
  return context.apiKeys;
}

declare module "./operations/registry.ts" {
  interface AppContext {
    /** Where API keys live, put here once per request. See the TODO above. */
    apiKeys?: ApiKeys;
  }
}

/**
 * The real store: the Better Auth `apiKey` plugin, which owns the `apikey`
 * table, hashes every secret, and is what turns a bearer into a user.
 */
export function betterAuthKeys(auth: Auth, db: Db): ApiKeys {
  return {
    async issue({ userId, name, expiresInDays }) {
      // No headers: createApiKey refuses a userId when a request or headers
      // ride along, because that is the caller acting for themselves.
      const created = await auth.api.createApiKey({
        body: {
          userId,
          name,
          ...(expiresInDays == null ? {} : { expiresIn: expiresInDays * 24 * 60 * 60 }),
        },
      });
      return {
        id: created.id,
        name: created.name,
        start: created.start,
        createdAt: created.createdAt,
        lastRequestAt: created.lastRequest,
        expiresAt: created.expiresAt,
        enabled: created.enabled !== false,
        key: created.key,
      };
    },

    async list({ userId }) {
      const rows = await db.query.apikey.findMany({
        where: { referenceId: userId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        start: row.start,
        createdAt: row.createdAt,
        lastRequestAt: row.lastRequest,
        expiresAt: row.expiresAt,
        // The column is nullable and defaults to true; only an explicit false
        // stops a key authenticating, so read null as usable.
        enabled: row.enabled !== false,
      }));
    },

    async revoke({ userId, keyId }) {
      // Scoped by referenceId as well as id, so a Sponsor cannot reach past
      // the Agent they are managing.
      const gone = await db
        .delete(apikey)
        .where(and(eq(apikey.id, keyId), eq(apikey.referenceId, userId)))
        .returning({ id: apikey.id });
      return gone.length > 0;
    },
  };
}
