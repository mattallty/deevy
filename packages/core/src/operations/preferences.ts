import { notificationKinds, notificationPreference } from "@deevy/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { NoInput, defineOperation } from "./registry.ts";

/**
 * What one Human wants to hear about, and where (schema/channel.ts). Routing is
 * the Workspace's rules and this together: the rules say which Channel a kind
 * of Notification reaches, and this says whether the Human concerned wants it
 * there at all.
 *
 * Own only. Neither operation takes a Member, so a Human sets their own
 * preferences and nobody else's — not even an admin, because this is not
 * administration, and not an Agent, which is denied by default (ADR-0004).
 *
 * Nothing here appends an Event. The Event log is the record of what happened
 * in the Workspace (CONTEXT.md), and one Human's own settings are not that.
 */

const PreferenceView = z.object({
  kind: z.enum(notificationKinds),
  inbox: z.boolean(),
  slack: z.boolean(),
});

export const preferences = {
  get: defineOperation({
    name: "preferences.get",
    summary: "Which Notifications reach you, and in which Channels",
    method: "GET",
    path: "/preferences",
    auth: "member",
    input: NoInput,
    output: z.object({ preferences: z.array(PreferenceView) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.notificationPreference.findMany({
        where: { memberId: context.member.id },
      });
      const saved = new Map(rows.map((row) => [row.kind, row]));
      // Every kind, always: a Human who has never said anything wants
      // everything, and the SPA renders the matrix from this rather than
      // knowing the default itself.
      return {
        preferences: notificationKinds.map((kind) => ({
          kind,
          inbox: saved.get(kind)?.inbox ?? true,
          slack: saved.get(kind)?.slack ?? true,
        })),
      };
    },
  }),

  set: defineOperation({
    name: "preferences.set",
    summary: "Say which of your Notifications reach the inbox and Slack",
    method: "PUT",
    path: "/preferences",
    auth: "member",
    input: z.object({ preferences: z.array(PreferenceView).max(notificationKinds.length) }),
    output: z.object({ preferences: z.array(PreferenceView) }),
    handler: async ({ input, context }) => {
      const changed = [...new Map(input.preferences.map((row) => [row.kind, row])).values()];
      if (changed.length > 0) {
        // Replace only the kinds named, in two statements: D1 has no
        // interactive transactions (ADR-0006), and a kind that is briefly
        // unset is a kind at its default, which is what it was saying anyway.
        await context.db.delete(notificationPreference).where(
          and(
            eq(notificationPreference.memberId, context.member.id),
            inArray(
              notificationPreference.kind,
              changed.map((row) => row.kind),
            ),
          ),
        );
        await context.db.insert(notificationPreference).values(
          changed.map((row) => ({
            memberId: context.member.id,
            kind: row.kind,
            inbox: row.inbox,
            slack: row.slack,
          })),
        );
      }

      const rows = await context.db.query.notificationPreference.findMany({
        where: { memberId: context.member.id },
      });
      const saved = new Map(rows.map((row) => [row.kind, row]));
      return {
        preferences: notificationKinds.map((kind) => ({
          kind,
          inbox: saved.get(kind)?.inbox ?? true,
          slack: saved.get(kind)?.slack ?? true,
        })),
      };
    },
  }),
};
