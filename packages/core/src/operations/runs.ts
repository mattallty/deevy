import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  activity as activityTable,
  agentActivityKinds,
  run as runTable,
  runStatuses,
} from "@deevy/db";
import { issue as issueTable, project as projectTable } from "@deevy/db";
import { issueKey } from "../issues.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import {
  ActivitySchema,
  RunDetailSchema,
  RunSchema,
  assertFinishable,
  openStatuses,
  setRunStatus,
  statusAfterActivity,
  statusAfterAnswer,
} from "../runs.ts";
import { defineOperation } from "./registry.ts";
import type { Run } from "@deevy/db";
import { assertOwnRun, parseRunCursor, requireIssue, requireRun, runView } from "./shared.ts";

export const runs = {
  start: defineOperation({
    name: "runs.start",
    summary: "Begin a Run on an Issue, pending until the Agent posts its first Activity",
    method: "POST",
    path: "/issues/{issueKey}/runs",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ issueKey: z.string() }),
    output: RunSchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.issueKey);
      // An Agent runs as itself; a Human starting one by hand has to say for
      // which Agent, which arrives with the triggers in slice 4.
      if (context.member.kind !== "agent") {
        throw new ORPCError("BAD_REQUEST", { message: "Only an Agent can start its own Run" });
      }
      // One attempt at a time: a second open Run on the same Issue by the same
      // Agent is two attempts claiming one outcome (docs/plans/m2.md).
      const already = await context.db.query.run.findFirst({
        where: {
          issueId: issue.id,
          agentMemberId: context.member.id,
          status: { in: [...openStatuses] },
        },
        columns: { id: true },
      });
      if (already) {
        throw new ORPCError("CONFLICT", {
          message: "This Agent already has an open Run on this Issue",
        });
      }
      const id = crypto.randomUUID();
      await context.db.insert(runTable).values({
        id,
        issueId: issue.id,
        agentMemberId: context.member.id,
        triggeredByMemberId: context.member.id,
        trigger: "manual",
      });
      const row = (await context.db.query.run.findFirst({ where: { id } })) as Run;
      await appendEvent(context, {
        kind: "run.started",
        subjectType: "run",
        subjectId: id,
        projectId: project.id,
        payload: { issueId: issue.id, trigger: row.trigger, agentMemberId: context.member.id },
      });
      return runView(row, input.issueKey);
    },
  }),

  postActivity: defineOperation({
    name: "runs.postActivity",
    summary: "Post one Activity to your Run: a thought, an action, an elicitation, or an error",
    method: "POST",
    path: "/runs/{runId}/activities",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      runId: z.string(),
      kind: z.enum(agentActivityKinds),
      body: z.string().min(1).max(20_000),
      payload: z.record(z.string(), z.unknown()).nullish(),
    }),
    output: z.object({ run: RunSchema, activity: ActivitySchema }),
    handler: async ({ input, context }) => {
      const { run, issue, project, key } = await requireRun(context, input.runId);
      assertOwnRun(context, run);
      const status = statusAfterActivity(run.status, input.kind);

      const id = crypto.randomUUID();
      await context.db.insert(activityTable).values({
        id,
        runId: run.id,
        kind: input.kind,
        body: input.body,
        payload: input.payload ?? null,
      });
      await setRunStatus(context.db, run, status, { touchActivity: true });

      await appendEvent(context, {
        kind: "run.activity",
        subjectType: "run",
        subjectId: run.id,
        projectId: project.id,
        payload: { issueId: issue.id, activityId: id, activityKind: input.kind },
      });
      // An elicitation is the Agent asking a Human something, so it is its own
      // Event: that is what a Notification and the live feed hang off.
      if (status === "awaiting_input") {
        await appendEvent(context, {
          kind: "run.awaiting_input",
          subjectType: "run",
          subjectId: run.id,
          projectId: project.id,
          payload: { issueId: issue.id, activityId: id, question: input.body },
        });
      }

      const updated = (await context.db.query.run.findFirst({ where: { id: run.id } })) as Run;
      const row = await context.db.query.activity.findFirst({ where: { id } });
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { run: runView(updated, key), activity: row };
    },
  }),

  answer: defineOperation({
    name: "runs.answer",
    summary: "Answer a Run's elicitation, so the Agent carries on",
    method: "POST",
    path: "/runs/{runId}/answer",
    auth: "member",
    input: z.object({ runId: z.string(), body: z.string().min(1).max(20_000) }),
    output: z.object({ run: RunSchema, activity: ActivitySchema }),
    handler: async ({ input, context }) => {
      // No `agents: true`: an elicitation asks a Human, and the registry
      // refuses an Agent this operation without a check of its own.
      const { run, issue, project, key } = await requireRun(context, input.runId);
      const status = statusAfterAnswer(run.status);

      // The answer joins the Activity feed as a `response`, because that feed
      // is where the Agent looks: an answer it cannot read is no answer.
      const id = crypto.randomUUID();
      await context.db.insert(activityTable).values({
        id,
        runId: run.id,
        kind: "prompt",
        body: input.body,
      });
      await setRunStatus(context.db, run, status, { touchActivity: true });

      await appendEvent(context, {
        kind: "run.answered",
        subjectType: "run",
        subjectId: run.id,
        projectId: project.id,
        payload: { issueId: issue.id, activityId: id },
      });

      const updated = (await context.db.query.run.findFirst({ where: { id: run.id } })) as Run;
      const row = await context.db.query.activity.findFirst({ where: { id } });
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return { run: runView(updated, key), activity: row };
    },
  }),

  finish: defineOperation({
    name: "runs.finish",
    summary: "End your Run, completed or failed, with a summary of what happened",
    method: "POST",
    path: "/runs/{runId}/finish",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      runId: z.string(),
      status: z.enum(["completed", "failed"]),
      summary: z.string().min(1).max(10_000),
    }),
    output: RunSchema,
    handler: async ({ input, context }) => {
      const { run, issue, project, key } = await requireRun(context, input.runId);
      assertOwnRun(context, run);
      assertFinishable(run.status);

      await setRunStatus(context.db, run, input.status, { summary: input.summary });
      await appendEvent(context, {
        kind: input.status === "completed" ? "run.completed" : "run.failed",
        subjectType: "run",
        subjectId: run.id,
        projectId: project.id,
        payload: { issueId: issue.id, summary: input.summary },
      });

      const updated = (await context.db.query.run.findFirst({ where: { id: run.id } })) as Run;
      return runView(updated, key);
    },
  }),

  list: defineOperation({
    name: "runs.list",
    summary: "Runs on an Issue or by an Agent, newest first, from a cursor",
    method: "GET",
    path: "/runs",
    auth: "member",
    agents: true,
    input: z.object({
      issueKey: z.string().optional(),
      agentMemberId: z.string().optional(),
      status: z.enum(runStatuses).optional(),
      /** Return Runs older than this position. Pass back the previous page's nextCursor. */
      before: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    output: z.object({
      runs: z.array(RunSchema),
      /** The position of the last Run returned, or null when the page is empty. */
      nextCursor: z.string().nullable(),
    }),
    handler: async ({ input, context }) => {
      // One of the two indexes carries every query: (issueId, createdAt) or
      // (agentMemberId, status). A Workspace-wide scan is not on offer.
      if (!input.issueKey && !input.agentMemberId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Say whose Runs you want: an Issue key or an Agent",
        });
      }
      const onIssue = input.issueKey ? await requireIssue(context, input.issueKey) : null;
      const cursor = input.before ? parseRunCursor(input.before) : null;
      const granted = context.grantedProjectIds;

      const rows = await context.db
        .select({ run: runTable, number: issueTable.number, projectKey: projectTable.key })
        .from(runTable)
        .innerJoin(issueTable, eq(runTable.issueId, issueTable.id))
        .innerJoin(projectTable, eq(issueTable.projectId, projectTable.id))
        .where(
          and(
            eq(projectTable.workspaceId, context.workspace.id),
            granted ? inArray(issueTable.projectId, granted) : undefined,
            onIssue ? eq(runTable.issueId, onIssue.issue.id) : undefined,
            input.agentMemberId === undefined
              ? undefined
              : eq(runTable.agentMemberId, input.agentMemberId),
            input.status === undefined ? undefined : eq(runTable.status, input.status),
            cursor
              ? or(
                  lt(runTable.createdAt, cursor.at),
                  and(eq(runTable.createdAt, cursor.at), lt(runTable.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(runTable.createdAt), desc(runTable.id))
        .limit(input.limit);

      const last = rows.at(-1);
      return {
        runs: rows.map((row) => runView(row.run, issueKey(row.projectKey, row.number))),
        nextCursor: last ? `${last.run.createdAt.getTime()}:${last.run.id}` : null,
      };
    },
  }),

  get: defineOperation({
    name: "runs.get",
    summary: "One Run with its Activity feed in the order it happened",
    method: "GET",
    path: "/runs/{runId}",
    auth: "member",
    agents: true,
    input: z.object({ runId: z.string() }),
    output: RunDetailSchema,
    handler: async ({ input, context }) => {
      const { run, key } = await requireRun(context, input.runId);
      const activities = await context.db.query.activity.findMany({
        where: { runId: run.id },
        orderBy: { createdAt: "asc" },
      });
      return { ...runView(run, key), activities };
    },
  }),
};
