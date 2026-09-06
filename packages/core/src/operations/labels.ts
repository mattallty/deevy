import { eq } from "drizzle-orm";
import { z } from "zod";
import { issueLabel as issueLabelTable, label as labelTable } from "@deevy/db";
import { LabelSchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";
import { requireLabel } from "./shared.ts";
import { newId } from "../ids.ts";

export const labels = {
  list: defineOperation({
    name: "labels.list",
    summary: "The Labels this Workspace defines",
    method: "GET",
    path: "/labels",
    auth: "member",
    agents: true,
    mcp: true,
    input: NoInput,
    output: z.object({ labels: z.array(LabelSchema) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.label.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { name: "asc" },
      });
      return { labels: rows };
    },
  }),

  create: defineOperation({
    name: "labels.create",
    summary: "Define a Label, plain or scoped",
    method: "POST",
    path: "/labels",
    auth: "member",
    agents: true,
    // An Agent classifying its own work needs the Label it reaches for to
    // exist. Creating one is additive; update and delete stay Human-only,
    // because a Label is Workspace-scoped and changing one reaches Projects
    // the Agent was never granted (docs/plans/m2.md).
    mcp: true,
    input: z.object({
      /** Null for a plain Label; an Issue carries at most one Label per scope. */
      scope: z.string().trim().min(1).max(40).nullish(),
      name: z.string().trim().min(1).max(60),
      color: z.string().trim().max(30),
    }),
    output: LabelSchema,
    handler: async ({ input, context }) => {
      const scope = input.scope ?? null;
      const taken = await context.db.query.label.findFirst({
        // A relational filter takes { isNull: true } rather than a bare null.
        where: {
          workspaceId: context.workspace.id,
          scope: scope === null ? { isNull: true } : scope,
          name: input.name,
        },
      });
      if (taken) throw new ORPCError("CONFLICT", { message: "That Label already exists" });

      const id = newId("label");
      const [row] = await context.db
        .insert(labelTable)
        .values({
          id,
          workspaceId: context.workspace.id,
          scope,
          name: input.name,
          color: input.color,
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      await appendEvent(context, {
        kind: "label.created",
        subjectType: "label",
        subjectId: id,
        payload: { scope, name: input.name },
      });
      return row;
    },
  }),

  update: defineOperation({
    name: "labels.update",
    summary: "Rename a Label or change its colour",
    method: "PATCH",
    path: "/labels/{labelId}",
    auth: "member",
    input: z.object({
      labelId: z.string(),
      name: z.string().trim().min(1).max(60).optional(),
      color: z.string().trim().max(30).optional(),
    }),
    output: LabelSchema,
    handler: async ({ input, context }) => {
      const found = await requireLabel(context, input.labelId);
      const [row] = await context.db
        .update(labelTable)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.color === undefined ? {} : { color: input.color }),
        })
        .where(eq(labelTable.id, found.id))
        .returning();
      await appendEvent(context, {
        kind: "label.updated",
        subjectType: "label",
        subjectId: found.id,
        payload: { name: input.name ?? found.name },
      });
      return row ?? found;
    },
  }),

  delete: defineOperation({
    name: "labels.delete",
    summary: "Remove a Label from the Workspace and from every Issue carrying it",
    method: "DELETE",
    path: "/labels/{labelId}",
    auth: "admin",
    input: z.object({ labelId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireLabel(context, input.labelId);
      // Read the affected Issues before the delete cascades the join rows away,
      // so each one still gets its own Event.
      const affected = await context.db
        .select({ issueId: issueLabelTable.issueId })
        .from(issueLabelTable)
        .where(eq(issueLabelTable.labelId, found.id));
      const projects = await context.db.query.issue.findMany({
        where: { id: { in: affected.map((row) => row.issueId) } },
        columns: { id: true, projectId: true },
      });

      await context.db.delete(labelTable).where(eq(labelTable.id, found.id));
      await appendEvent(context, {
        kind: "label.deleted",
        subjectType: "label",
        subjectId: found.id,
        payload: { scope: found.scope, name: found.name },
      });
      for (const issue of projects) {
        await appendEvent(context, {
          kind: "issue.labels_changed",
          subjectType: "issue",
          subjectId: issue.id,
          projectId: issue.projectId,
          payload: {
            added: [],
            removed: [found.id],
            addedNames: [],
            removedNames: [found.scope ? `${found.scope}: ${found.name}` : found.name],
          },
        });
      }
      return { deleted: true as const };
    },
  }),
};
