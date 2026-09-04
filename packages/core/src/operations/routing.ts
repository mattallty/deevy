import { notificationKinds, routingRule as routingRuleTable } from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";

/**
 * Routing rules: which kind of Notification, for which Project, reaches which
 * Channel (CONTEXT.md, schema/channel.ts). A null kind or Project means any of
 * them, so one rule sends everything to one Slack Channel.
 *
 * The rules are set as a whole rather than one at a time. A rule is only
 * meaningful next to the others — two of them can send the same Notification to
 * the same room — so the set is the unit a Human edits and the unit the API
 * takes, and replacing it is two statements rather than a diff.
 *
 * Neither operation is open to an Agent (ADR-0004).
 */

const RuleInput = z.object({
  /** Null is every kind. */
  notificationKind: z.enum(notificationKinds).nullable(),
  /** Null is every Project. */
  projectId: z.string().nullable(),
  channelId: z.string(),
});

const RuleView = RuleInput.extend({ id: z.string(), createdAt: z.date() });

/** As many rules as there are kinds times a handful of Channels, and no more. */
const maxRules = 50;

export const routing = {
  list: defineOperation({
    name: "routing.list",
    summary: "Which Notifications this Workspace sends to which Channels",
    method: "GET",
    path: "/routing",
    auth: "admin",
    input: NoInput,
    output: z.object({ rules: z.array(RuleView) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.routingRule.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "asc" },
      });
      return {
        rules: rows.map((row) => ({
          id: row.id,
          notificationKind: row.notificationKind,
          projectId: row.projectId,
          channelId: row.channelId,
          createdAt: row.createdAt,
        })),
      };
    },
  }),

  set: defineOperation({
    name: "routing.set",
    summary: "Replace the routing rules with this set",
    method: "PUT",
    path: "/routing",
    auth: "admin",
    input: z.object({ rules: z.array(RuleInput).max(maxRules) }),
    output: z.object({ rules: z.array(RuleView) }),
    handler: async ({ input, context }) => {
      const channelIds = [...new Set(input.rules.map((rule) => rule.channelId))];
      if (channelIds.length > 0) {
        // One statement, not one per rule: a rule aimed at a Channel this
        // Workspace does not have would be a rule that never fires.
        const found = await context.db.query.channel.findMany({
          where: { workspaceId: context.workspace.id, id: { in: channelIds } },
          columns: { id: true },
        });
        if (found.length !== channelIds.length) {
          throw new ORPCError("NOT_FOUND", { message: "No such Channel" });
        }
      }
      const projectIds = [
        ...new Set(input.rules.map((rule) => rule.projectId).filter((id) => id !== null)),
      ];
      if (projectIds.length > 0) {
        const found = await context.db.query.project.findMany({
          where: { workspaceId: context.workspace.id, id: { in: projectIds } },
          columns: { id: true },
        });
        if (found.length !== projectIds.length) {
          throw new ORPCError("NOT_FOUND", { message: "No such Project" });
        }
      }

      // Replace, in two statements: D1 has no interactive transactions
      // (ADR-0006), and a Workspace with no rules for a moment delivers to the
      // inbox as it always does. Nothing is lost, only unrouted.
      await context.db
        .delete(routingRuleTable)
        .where(eq(routingRuleTable.workspaceId, context.workspace.id));
      if (input.rules.length > 0) {
        await context.db.insert(routingRuleTable).values(
          input.rules.map((rule) => ({
            id: crypto.randomUUID(),
            workspaceId: context.workspace.id,
            notificationKind: rule.notificationKind,
            projectId: rule.projectId,
            channelId: rule.channelId,
          })),
        );
      }

      const rows = await context.db.query.routingRule.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "asc" },
      });
      // One Event for the set, because the set is what changed.
      await appendEvent(context, {
        kind: "routing.updated",
        subjectType: "workspace",
        subjectId: context.workspace.id,
        payload: { rules: rows.length },
      });
      return {
        rules: rows.map((row) => ({
          id: row.id,
          notificationKind: row.notificationKind,
          projectId: row.projectId,
          channelId: row.channelId,
          createdAt: row.createdAt,
        })),
      };
    },
  }),
};
