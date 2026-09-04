import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { notification as notificationTable } from "@deevy/db";
import { NotificationWithIssueSchema } from "../schemas.ts";
import { NoInput, defineOperation } from "./registry.ts";
import { QueryFlag, issueWith, withKey } from "./shared.ts";

export const inbox = {
  list: defineOperation({
    name: "inbox.list",
    summary: "The Notifications waiting for you, newest first",
    method: "GET",
    path: "/inbox",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      unreadOnly: QueryFlag.optional(),
      /** Return Notifications older than this id's position. */
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    output: z.object({
      notifications: z.array(NotificationWithIssueSchema),
      nextCursor: z.number().int().nullable(),
    }),
    handler: async ({ input, context }) => {
      // A Notification names an Issue and carries it back in full, so the
      // inbox is a way into a Project as much as issues.get is. An Agent sees
      // only what its grants cover; a Human is not scoped (docs/plans/m2.md).
      const granted = context.grantedProjectIds;
      const rows = await context.db.query.notification.findMany({
        where: {
          recipientMemberId: context.member.id,
          ...(input.unreadOnly ? { readAt: { isNull: true } } : {}),
          ...(input.before === undefined ? {} : { eventId: { lt: input.before } }),
          ...(granted ? { issue: { projectId: { in: granted } } } : {}),
        },
        with: { event: true, issue: { with: issueWith } },
        orderBy: { eventId: "desc" },
        limit: input.limit,
      });
      const projects = await context.db.query.project.findMany({
        where: { workspaceId: context.workspace.id },
        columns: { id: true, key: true },
      });
      const keyOf = new Map(projects.map((project) => [project.id, project.key]));
      return {
        notifications: rows.map((row) => ({
          ...row,
          issue: row.issue ? withKey(row.issue, keyOf.get(row.issue.projectId) ?? "") : null,
        })),
        nextCursor: rows.at(-1)?.eventId ?? null,
      };
    },
  }),

  unreadCount: defineOperation({
    name: "inbox.unreadCount",
    summary: "How many Notifications you have not read",
    method: "GET",
    path: "/inbox/unread",
    auth: "member",
    input: NoInput,
    output: z.object({ unread: z.number().int() }),
    handler: async ({ context }) => {
      const [row] = await context.db
        .select({ unread: count() })
        .from(notificationTable)
        .where(
          and(
            eq(notificationTable.recipientMemberId, context.member.id),
            isNull(notificationTable.readAt),
          ),
        );
      return { unread: row?.unread ?? 0 };
    },
  }),

  markRead: defineOperation({
    name: "inbox.markRead",
    summary: "Mark some of your Notifications read",
    method: "POST",
    path: "/inbox/read",
    auth: "member",
    input: z.object({ ids: z.array(z.string()) }),
    output: z.object({ read: z.number().int() }),
    handler: async ({ input, context }) => {
      if (input.ids.length === 0) return { read: 0 };
      // Scoped to the caller in the same statement, so one Member cannot mark
      // another's inbox read by guessing ids.
      const updated = await context.db
        .update(notificationTable)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notificationTable.recipientMemberId, context.member.id),
            inArray(notificationTable.id, input.ids),
            isNull(notificationTable.readAt),
          ),
        )
        .returning({ id: notificationTable.id });
      return { read: updated.length };
    },
  }),

  markAllRead: defineOperation({
    name: "inbox.markAllRead",
    summary: "Mark your whole inbox read",
    method: "POST",
    path: "/inbox/read-all",
    auth: "member",
    input: NoInput,
    output: z.object({ read: z.number().int() }),
    handler: async ({ context }) => {
      const updated = await context.db
        .update(notificationTable)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notificationTable.recipientMemberId, context.member.id),
            isNull(notificationTable.readAt),
          ),
        )
        .returning({ id: notificationTable.id });
      return { read: updated.length };
    },
  }),
};
