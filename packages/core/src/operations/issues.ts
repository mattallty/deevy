import { eq } from "drizzle-orm";
import { z } from "zod";
import { issue as issueTable } from "@deevy/db";
import { insertIssue, isSelfOrDescendant, issueKey, nextIssueNumber } from "../issues.ts";
import { oneLabelPerScope, replaceIssueLabels } from "../labels.ts";
import { resolveMentions } from "../mentions.ts";
import { assertLeavable, enterState } from "../workflow.ts";
import { IssueDetailSchema, IssueSummarySchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { defineOperation, type ContextFor } from "./registry.ts";
import {
  ProjectKeyLookup,
  QueryFlag,
  issueWith,
  loadIssue,
  openStateDocument,
  requireAssignee,
  requireIssue,
  requireIssueForMove,
  requireProject,
  withKey,
} from "./shared.ts";

export const issues = {
  create: defineOperation({
    name: "issues.create",
    summary: "Add an Issue to a Project, in the first State of its Workflow",
    method: "POST",
    path: "/issues",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      projectKey: ProjectKeyLookup,
      title: z.string().trim().min(1).max(300),
      description: z.string().max(100_000).nullish(),
      assigneeMemberId: z.string().nullish(),
      parentKey: z.string().nullish(),
    }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      const project = await requireProject(context, input.projectKey);
      const first = await context.db.query.workflowState.findFirst({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });
      if (!first) {
        throw new ORPCError("BAD_REQUEST", { message: "This Project has no Workflow States" });
      }
      if (input.assigneeMemberId) await requireAssignee(context, input.assigneeMemberId);

      let parentId: string | null = null;
      if (input.parentKey) {
        const parent = await requireIssue(context, input.parentKey);
        if (parent.project.id !== project.id) {
          throw new ORPCError("BAD_REQUEST", {
            message: "A parent Issue must be in the same Project",
          });
        }
        parentId = parent.issue.id;
      }

      const number = await nextIssueNumber(context.db, project.id);
      const created = await insertIssue(context.db, {
        projectId: project.id,
        number,
        title: input.title,
        description: input.description,
        stateId: first.id,
        assigneeMemberId: input.assigneeMemberId,
        parentId,
        createdBy: context.member.id,
      });
      await appendEvent(context, {
        kind: "issue.created",
        subjectType: "issue",
        subjectId: created.id,
        projectId: project.id,
        payload: { key: issueKey(project.key, number), title: created.title },
      });
      await openStateDocument(context, created.id, project.id, first);
      return loadIssue(context, created.id);
    },
  }),

  list: defineOperation({
    name: "issues.list",
    summary: "A Project's Issues, by number, from a cursor",
    method: "GET",
    // Not under /projects/{projectKey}: the Project is optional now, and a path
    // parameter cannot be. Nothing outside this repository called the old path.
    path: "/issues",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      /**
       * Left out, every Project the caller may see, newest change first, in
       * one query: the Issues home and the command palette are Workspace-wide
       * screens, and one list beats one per Project on D1's per-invocation
       * budget (docs/plans/ui-redesign.md slice 2). Named, that Project's
       * Issues in key order, paged by `after`.
       */
      projectKey: ProjectKeyLookup.optional(),
      /**
       * An Issue key (`DEV-12`), a number, or a word of the title. A key finds
       * exactly that Issue; anything else matches titles, case-insensitively.
       */
      q: z.string().trim().min(1).max(200).optional(),
      /** Return Issues numbered above this. Only meaningful with a projectKey. */
      after: z.coerce.number().int().nonnegative().optional(),
      stateId: z.string().optional(),
      assigneeMemberId: z.string().optional(),
      labelId: z.string().optional(),
      /** Only Issues whose State is not a `done` one. */
      open: QueryFlag.optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    output: z.object({
      issues: z.array(IssueSummarySchema),
      /** The number of the last Issue returned, or null when the page is empty. */
      nextCursor: z.number().int().nullable(),
    }),
    handler: async ({ input, context }) => {
      const projects = input.projectKey
        ? [await requireProject(context, input.projectKey)]
        : await visibleProjects(context);
      const keyOf = new Map(projects.map((project) => [project.id, project.key]));
      const only = projects.length === 1 ? projects[0] : undefined;
      const rows = await context.db.query.issue.findMany({
        where: {
          ...(only ? { projectId: only.id } : { projectId: { in: [...keyOf.keys()] } }),
          ...(input.after === undefined ? {} : { number: { gt: input.after } }),
          ...(input.stateId === undefined ? {} : { stateId: input.stateId }),
          ...(input.assigneeMemberId === undefined
            ? {}
            : { assigneeMemberId: input.assigneeMemberId }),
          ...(input.open ? { closedAt: { isNull: true } } : {}),
          ...(input.labelId === undefined ? {} : { labels: { id: input.labelId } }),
          ...(input.q === undefined ? {} : searchClause(input.q, projects)),
        },
        with: issueWith,
        // A Project's list reads in key order and pages; the Workspace's reads
        // as a feed, and a cursor over numbers means nothing across Projects.
        orderBy: input.projectKey ? { number: "asc" } : { updatedAt: "desc" },
        limit: input.limit,
      });
      return {
        issues: rows.map((row) => withKey(row, keyOf.get(row.projectId) ?? "")),
        nextCursor: input.projectKey ? (rows.at(-1)?.number ?? null) : null,
      };
    },
  }),

  get: defineOperation({
    name: "issues.get",
    summary: "One Issue by its key, with its State, Assignee, parent and children",
    method: "GET",
    path: "/issues/{key}",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ key: z.string() }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.key);
      return loadIssue(context, issue.id);
    },
  }),

  move: defineOperation({
    name: "issues.move",
    summary: "Put an Issue in another State of its Project's Workflow",
    method: "POST",
    path: "/issues/{key}/move",
    auth: "member",
    agents: true,
    input: z.object({ key: z.string(), stateId: z.string() }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      const { issue, project, states, from } = await requireIssueForMove(context, input.key);
      const to = states.find((state) => state.id === input.stateId);
      if (!to) {
        throw new ORPCError("BAD_REQUEST", {
          message: "That State belongs to another Project's Workflow",
        });
      }
      if (to.id === from.id) return loadIssue(context, issue.id);
      assertLeavable(from, input.key);

      await enterState(context.db, issue, to);
      await appendEvent(context, {
        kind: "issue.moved",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: { from: from.name, to: to.name },
      });
      await openStateDocument(context, issue.id, project.id, to);
      return loadIssue(context, issue.id);
    },
  }),

  setLabels: defineOperation({
    name: "issues.setLabels",
    summary: "Replace an Issue's Labels; one per scope survives, the last given",
    method: "PUT",
    path: "/issues/{key}/labels",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ key: z.string(), labelIds: z.array(z.string()) }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.key);
      const chosen = await context.db.query.label.findMany({
        where: { id: { in: input.labelIds }, workspaceId: context.workspace.id },
      });
      if (chosen.length !== new Set(input.labelIds).size) {
        throw new ORPCError("BAD_REQUEST", {
          message: "One of those Labels is not defined in this Workspace",
        });
      }
      // Order matters for the one-per-scope rule, and findMany does not keep it.
      const ordered = input.labelIds
        .map((id) => chosen.find((label) => label.id === id))
        .filter((label) => label !== undefined);

      const change = await replaceIssueLabels(
        context.db,
        issue.id,
        oneLabelPerScope(ordered).map((label) => label.id),
      );
      if (change.added.length > 0 || change.removed.length > 0) {
        await appendEvent(context, {
          kind: "issue.labels_changed",
          subjectType: "issue",
          subjectId: issue.id,
          projectId: project.id,
          payload: change,
        });
      }
      return loadIssue(context, issue.id);
    },
  }),

  update: defineOperation({
    name: "issues.update",
    summary: "Change an Issue's title, description, Assignee, or parent",
    method: "PATCH",
    path: "/issues/{key}",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      key: z.string(),
      title: z.string().trim().min(1).max(300).optional(),
      description: z.string().max(100_000).nullish(),
      assigneeMemberId: z.string().nullish(),
      /** Pass null to detach the Issue from its parent. */
      parentKey: z.string().nullish(),
    }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      const { issue: found, project } = await requireIssue(context, input.key);

      // Assignment and reparenting each get their own Event, since the inbox
      // and the timeline read them differently from an edit (docs/plans/m1.md).
      let parentId: string | null | undefined;
      if (input.parentKey !== undefined) {
        if (input.parentKey === null) {
          parentId = null;
        } else {
          const parent = await requireIssue(context, input.parentKey);
          if (parent.project.id !== project.id) {
            throw new ORPCError("BAD_REQUEST", {
              message: "A parent Issue must be in the same Project",
            });
          }
          if (await isSelfOrDescendant(context.db, found.id, parent.issue.id)) {
            throw new ORPCError("BAD_REQUEST", {
              message: "An Issue cannot be its own parent or a child of its own descendant",
            });
          }
          parentId = parent.issue.id;
        }
      }
      if (input.assigneeMemberId) await requireAssignee(context, input.assigneeMemberId);

      const edits: Record<string, { from: unknown; to: unknown }> = {};
      if (input.title !== undefined && input.title !== found.title) {
        edits.title = { from: found.title, to: input.title };
      }
      if (input.description !== undefined && input.description !== found.description) {
        edits.description = { from: found.description, to: input.description ?? null };
      }
      const assigneeChanged =
        input.assigneeMemberId !== undefined &&
        (input.assigneeMemberId ?? null) !== found.assigneeMemberId;
      const parentChanged = parentId !== undefined && parentId !== found.parentId;

      if (Object.keys(edits).length === 0 && !assigneeChanged && !parentChanged) {
        return loadIssue(context, found.id);
      }

      await context.db
        .update(issueTable)
        .set({
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description ?? null }),
          ...(assigneeChanged ? { assigneeMemberId: input.assigneeMemberId ?? null } : {}),
          ...(parentChanged ? { parentId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(issueTable.id, found.id));

      const subject = {
        subjectType: "issue",
        subjectId: found.id,
        projectId: project.id,
      } as const;
      if (Object.keys(edits).length > 0) {
        // A description mentions people the same way a comment does, so the
        // inbox reads one payload shape for both.
        const mentionedMemberIds =
          input.description === undefined
            ? []
            : await resolveMentions(context.db, context.workspace.id, input.description ?? "");
        await appendEvent(context, {
          kind: "issue.updated",
          ...subject,
          payload: { ...edits, mentionedMemberIds },
        });
      }
      if (assigneeChanged) {
        await appendEvent(context, {
          kind: "issue.assigned",
          ...subject,
          payload: { from: found.assigneeMemberId, to: input.assigneeMemberId ?? null },
        });
      }
      if (parentChanged) {
        await appendEvent(context, {
          kind: "issue.reparented",
          ...subject,
          payload: { from: found.parentId, to: parentId ?? null },
        });
      }
      return loadIssue(context, found.id);
    },
  }),
};

/** The Projects a Workspace-wide list reads: every unarchived one, or an Agent's grants. */
async function visibleProjects(context: ContextFor<"member">) {
  const granted = context.grantedProjectIds;
  return context.db.query.project.findMany({
    where: {
      workspaceId: context.workspace.id,
      archivedAt: { isNull: true },
      ...(granted ? { id: { in: granted } } : {}),
    },
    columns: { id: true, key: true },
  });
}

/**
 * What `q` means: `DEV-12` is exactly that Issue, a bare number is that number
 * in any Project (or a title containing it), anything else is a word of the
 * title. SQLite's LIKE is case-insensitive for ASCII, which is what a key or
 * a title is.
 */
function searchClause(q: string, projects: Array<{ id: string; key: string }>) {
  const asKey = /^([A-Za-z]{2,6})-(\d+)$/.exec(q);
  if (asKey) {
    const project = projects.find((candidate) => candidate.key === asKey[1]?.toUpperCase());
    return project ? { projectId: project.id, number: Number(asKey[2]) } : { number: -1 };
  }
  const pattern = `%${q.replace(/[%_]/g, (char) => `\\${char}`)}%`;
  if (/^\d+$/.test(q)) return { OR: [{ number: Number(q) }, { title: { like: pattern } }] };
  return { title: { like: pattern } };
}
