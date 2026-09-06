import { eq } from "drizzle-orm";
import { z } from "zod";
import { issueLink as issueLinkTable, issueLinkKinds } from "@deevy/db";
import { parseLink } from "../links.ts";
import { IssueLinkWithRepositorySchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { defineOperation } from "./registry.ts";
import { assertProjectVisible, requireIssue, requireRun } from "./shared.ts";
import { newId } from "../ids.ts";

export const links = {
  list: defineOperation({
    name: "links.list",
    summary: "What an Issue points at",
    method: "GET",
    path: "/issues/{issueKey}/links",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ issueKey: z.string() }),
    output: z.object({ links: z.array(IssueLinkWithRepositorySchema) }),
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.issueKey);
      const rows = await context.db.query.issueLink.findMany({
        where: { issueId: issue.id },
        with: { repository: true },
        orderBy: { createdAt: "asc" },
      });
      return { links: rows };
    },
  }),

  add: defineOperation({
    name: "links.add",
    summary: "Point an Issue at a pull request, a commit, a branch, or any URL",
    method: "POST",
    path: "/issues/{issueKey}/links",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      issueKey: z.string(),
      url: z.url().max(2000),
      title: z.string().trim().max(300).nullish(),
      /** Derived from the URL unless given. */
      kind: z.enum(issueLinkKinds).optional(),
      /** The Run that found it, so evidence is attributed to the attempt that produced it. */
      runId: z.string().optional(),
    }),
    output: IssueLinkWithRepositorySchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.issueKey);
      if (input.runId) {
        const attributed = await requireRun(context, input.runId);
        if (attributed.run.issueId !== issue.id) {
          throw new ORPCError("BAD_REQUEST", { message: "That Run is on another Issue" });
        }
      }
      const known = await context.db.query.repository.findMany({
        where: { workspaceId: context.workspace.id },
        columns: { id: true, url: true },
      });
      const parsed = parseLink(input.url, known);

      const id = newId("link");
      await context.db.insert(issueLinkTable).values({
        id,
        issueId: issue.id,
        kind: input.kind ?? parsed.kind,
        url: input.url,
        title: input.title ?? null,
        ref: parsed.ref,
        repositoryId: parsed.repositoryId,
        runId: input.runId ?? null,
        createdBy: context.member.id,
      });
      await appendEvent(context, {
        kind: "issue.link_added",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: {
          linkId: id,
          kind: input.kind ?? parsed.kind,
          url: input.url,
          ...(input.runId ? { runId: input.runId } : {}),
        },
      });
      const row = await context.db.query.issueLink.findFirst({
        where: { id },
        with: { repository: true },
      });
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      return row;
    },
  }),

  remove: defineOperation({
    name: "links.remove",
    summary: "Stop an Issue pointing at something",
    method: "DELETE",
    path: "/links/{linkId}",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ linkId: z.string() }),
    output: z.object({ removed: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await context.db.query.issueLink.findFirst({
        where: { id: input.linkId },
        with: { issue: { with: { project: true } }, run: true },
      });
      if (!found || found.issue.project.workspaceId !== context.workspace.id) {
        throw new ORPCError("NOT_FOUND", { message: "No such Link" });
      }
      assertProjectVisible(context, found.issue.projectId);
      // An Agent takes back its own evidence and nobody else's: a Link another
      // Run attached is that attempt's record, and an Agent that could erase it
      // would leave the Event log reading as housekeeping (docs/plans/m3.md).
      if (context.member.kind === "agent" && found.run?.agentMemberId !== context.member.id) {
        throw new ORPCError("FORBIDDEN", {
          message: "An Agent can only remove a Link its own Run attached",
        });
      }
      await context.db.delete(issueLinkTable).where(eq(issueLinkTable.id, found.id));
      await appendEvent(context, {
        kind: "issue.link_removed",
        subjectType: "issue",
        subjectId: found.issueId,
        projectId: found.issue.projectId,
        payload: { linkId: found.id, url: found.url },
      });
      return { removed: true as const };
    },
  }),
};
