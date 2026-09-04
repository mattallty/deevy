import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@deevy/db";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { NoInput, defineOperation } from "./registry.ts";

/**
 * The MCP clients one Human has let act as themselves (docs/plans/m2.md).
 * deevy is the OAuth authorization server (ADR-0007), so a consent is a row in
 * its own database and these read and delete it directly rather than through
 * Better Auth's admin endpoints, which are gated on privileges deevy does not
 * model.
 *
 * Own only, and there is deliberately no admin view: a consent is the Human's
 * own grant, and an admin who wants a client gone suspends the Member. Nothing
 * here appends an Event, for the same reason the notification preferences do
 * not: this is one person's settings, not a change in the Workspace (CONTEXT.md).
 *
 * `agents` and `mcp` are both omitted. An Agent has no consents, and letting a
 * delegated credential revoke the credentials beside it is exactly the shape
 * `sessionOnly` exists to refuse.
 */

const ClientView = z.object({
  clientId: z.string(),
  name: z.string().nullable(),
  uri: z.string().nullable(),
  icon: z.string().nullable(),
  /** What the Human agreed to. Nothing enforces scopes in v1 (docs/plans/m2.md). */
  scopes: z.array(z.string()),
  consentedAt: z.date().nullable(),
});

export const oauthClients = {
  list: defineOperation({
    name: "oauthClients.list",
    summary: "The MCP clients you have let act as you",
    method: "GET",
    path: "/oauth-clients",
    auth: "session",
    sessionOnly: true,
    input: NoInput,
    output: z.object({ clients: z.array(ClientView) }),
    handler: async ({ context }) => {
      const consents = await context.db
        .select({ consent: oauthConsent, client: oauthClient })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(eq(oauthConsent.userId, context.session.user.id));
      return {
        clients: consents.map(({ consent, client }) => ({
          clientId: consent.clientId,
          // A client registered over CIMD names itself in its metadata
          // document; one that came through DCR named itself in its request.
          name: client.name ?? null,
          uri: client.uri ?? null,
          icon: client.icon ?? null,
          scopes: Array.isArray(consent.scopes) ? (consent.scopes as string[]) : [],
          consentedAt: consent.updatedAt ?? consent.createdAt ?? null,
        })),
      };
    },
  }),

  revoke: defineOperation({
    name: "oauthClients.revoke",
    summary: "Withdraw one MCP client's permission to act as you",
    method: "DELETE",
    path: "/oauth-clients/{clientId}",
    auth: "session",
    sessionOnly: true,
    input: z.object({ clientId: z.string() }),
    output: z.object({ revoked: z.literal(true) }),
    handler: async ({ input, context }) => {
      const userId = context.session.user.id;
      const owned = await context.db.query.oauthConsent.findFirst({
        where: { clientId: input.clientId, userId },
      });
      // Someone else's consent is not found rather than forbidden: whether a
      // client id exists at all is not this caller's business.
      if (!owned) throw new ORPCError("NOT_FOUND", { message: "No such client" });

      // The consent, then the credentials that hang off it. An access token
      // deevy already minted is a signed JWT it verifies without a lookup
      // (principal.ts), so marking it revoked stops it being refreshed rather
      // than stopping it now: it dies with its own expiry, within the hour.
      await context.db
        .delete(oauthConsent)
        .where(and(eq(oauthConsent.clientId, input.clientId), eq(oauthConsent.userId, userId)));
      await context.db
        .update(oauthAccessToken)
        .set({ revoked: new Date() })
        .where(
          and(eq(oauthAccessToken.clientId, input.clientId), eq(oauthAccessToken.userId, userId)),
        );
      await context.db
        .delete(oauthRefreshToken)
        .where(
          and(eq(oauthRefreshToken.clientId, input.clientId), eq(oauthRefreshToken.userId, userId)),
        );
      return { revoked: true as const };
    },
  }),
};
