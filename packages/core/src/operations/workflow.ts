import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  issue as issueTable,
  workflowState as workflowStateTable,
  workflowStateCategories,
} from "@deevy/db";
import { WorkflowStateSchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { defineOperation } from "./registry.ts";
import type { ContextFor } from "./registry.ts";
import { ProjectKeyLookup, requireProject, requireProjectOrAdmin } from "./shared.ts";

/**
 * Only an Agent of this Workspace can be the Agent a State's rule names: the
 * rule starts a Run, and a Human does not run. One query for every State named,
 * because a Workflow is rewritten whole.
 */
async function assertAgents(
  context: ContextFor<"member">,
  states: Array<{ triggerAgentMemberId?: string | null | undefined }>,
): Promise<void> {
  const named = [...new Set(states.map((state) => state.triggerAgentMemberId).filter(Boolean))];
  if (named.length === 0) return;
  const agents = await context.db.query.member.findMany({
    where: { id: { in: named as string[] }, workspaceId: context.workspace.id, kind: "agent" },
    columns: { id: true },
  });
  if (agents.length !== named.length) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A State can only be assigned to an Agent of this Workspace",
    });
  }
}

export const workflow = {
  get: defineOperation({
    name: "workflow.get",
    summary: "A Project's Workflow: its States in order, and which are Gates",
    method: "GET",
    path: "/projects/{projectKey}/workflow",
    auth: "member",
    input: z.object({ projectKey: ProjectKeyLookup }),
    output: z.object({ states: z.array(WorkflowStateSchema) }),
    handler: async ({ input, context }) => {
      const project = await requireProject(context, input.projectKey);
      const states = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });
      return { states };
    },
  }),

  update: defineOperation({
    name: "workflow.update",
    summary: "Rewrite a Project's Workflow: add, rename, reorder or delete States",
    method: "PUT",
    path: "/projects/{projectKey}/workflow",
    auth: "member",
    input: z.object({
      projectKey: ProjectKeyLookup,
      /** The Workflow as it should end up. Order in this array is the new order. */
      states: z.array(
        z.object({
          /** Omitted for a State being added. */
          id: z.string().optional(),
          name: z.string().trim().min(1).max(60),
          isGate: z.boolean().default(false),
          category: z.enum(workflowStateCategories),
          /** The Document this State asks for on entry, and its starting text. */
          documentName: z.string().trim().max(60).nullish(),
          documentTemplate: z.string().max(100_000).nullish(),
          /**
           * The rule: entering this State assigns the Issue to this Agent and
           * starts a Run (docs/plans/m2.md). Null, or left out, is no rule.
           */
          triggerAgentMemberId: z.string().nullish(),
        }),
      ),
      deleteStates: z.array(z.string()).default([]),
      /** Where the Issues in a deleted State go. Required when any of them holds Issues. */
      moveIssuesTo: z.string().nullish(),
    }),
    output: z.object({ states: z.array(WorkflowStateSchema) }),
    handler: async ({ input, context }) => {
      const project = await requireProjectOrAdmin(context, input.projectKey);
      if (input.states.length === 0) {
        throw new ORPCError("BAD_REQUEST", { message: "A Workflow needs at least one State" });
      }
      const existing = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
      });
      const known = new Set(existing.map((state) => state.id));
      for (const state of input.states) {
        if (state.id && !known.has(state.id)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "That State belongs to another Project's Workflow",
          });
        }
      }

      await assertAgents(context, input.states);

      const doomed = input.deleteStates.filter((id) => known.has(id));
      if (doomed.length > 0) {
        const stranded = await context.db.query.issue.findMany({
          where: { projectId: project.id, stateId: { in: doomed } },
          columns: { id: true },
        });
        if (stranded.length > 0) {
          const destination = input.moveIssuesTo;
          const surviving = new Set(input.states.map((state) => state.id).filter(Boolean));
          if (!destination || !surviving.has(destination)) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Deleting a State that holds Issues needs moveIssuesTo, a State that survives",
            });
          }
          // One statement rather than a write per Issue, since D1 charges per
          // round trip (docs/plans/m1.md).
          await context.db
            .update(issueTable)
            .set({ stateId: destination, stateEnteredAt: new Date() })
            .where(and(eq(issueTable.projectId, project.id), inArray(issueTable.stateId, doomed)));
        }
      }

      // Positions come from the order of `states`, so a reorder is just a
      // different array. Kept as sequential writes: D1 has no transactions.
      const kept: string[] = [];
      for (const [position, state] of input.states.entries()) {
        if (state.id) {
          await context.db
            .update(workflowStateTable)
            .set({
              name: state.name,
              position,
              isGate: state.isGate,
              category: state.category,
              documentName: state.documentName ?? null,
              documentTemplate: state.documentTemplate ?? null,
              triggerAgentMemberId: state.triggerAgentMemberId ?? null,
            })
            .where(eq(workflowStateTable.id, state.id));
          kept.push(state.id);
        } else {
          const id = crypto.randomUUID();
          await context.db.insert(workflowStateTable).values({
            id,
            projectId: project.id,
            name: state.name,
            position,
            isGate: state.isGate,
            category: state.category,
            documentName: state.documentName ?? null,
            documentTemplate: state.documentTemplate ?? null,
            triggerAgentMemberId: state.triggerAgentMemberId ?? null,
          });
          kept.push(id);
        }
      }
      const remove = doomed.filter((id) => !kept.includes(id));
      if (remove.length > 0) {
        await context.db
          .delete(workflowStateTable)
          .where(
            and(
              eq(workflowStateTable.projectId, project.id),
              inArray(workflowStateTable.id, remove),
            ),
          );
      }

      await appendEvent(context, {
        kind: "workflow.updated",
        subjectType: "project",
        subjectId: project.id,
        projectId: project.id,
        payload: { states: input.states.map((state) => state.name), removed: remove.length },
      });
      const states = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });
      return { states };
    },
  }),
};
