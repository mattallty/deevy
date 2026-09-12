import { z } from "zod";
import { writeVersion } from "../documents.ts";
import { DocumentAtVersionSchema, DocumentSchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { defineOperation } from "./registry.ts";
import { requireDocument, requireIssue } from "./shared.ts";

export const documents = {
  list: defineOperation({
    name: "documents.list",
    summary: "The Documents on an Issue",
    method: "GET",
    path: "/issues/{issueKey}/documents",
    auth: "member",
    agents: true,
    input: z.object({ issueKey: z.string() }),
    output: z.object({ documents: z.array(DocumentSchema) }),
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.issueKey);
      const rows = await context.db.query.document.findMany({
        where: { issueId: issue.id },
        orderBy: { createdAt: "asc" },
      });
      return { documents: rows };
    },
  }),

  /**
   * Every version of one Document, newest first, without their bodies: who
   * wrote each and when. The Issue page reads it twice over — to name everybody
   * who has had a hand in a Document rather than only whoever wrote the version
   * on screen, and to draw the history somebody opens from it.
   *
   * Bodies stay out of it on purpose: a Document edited thirty times is thirty
   * bodies nobody asked for, and reading one is `documents.get` with a version.
   */
  versions: defineOperation({
    name: "documents.versions",
    summary: "Every version of a Document: who wrote it and when, without the body",
    method: "GET",
    path: "/issues/{issueKey}/documents/{name}/versions",
    auth: "member",
    agents: true,
    input: z.object({ issueKey: z.string(), name: z.string() }),
    output: z.object({
      versions: z.array(
        z.object({
          version: z.number().int(),
          authorMemberId: z.string().nullable(),
          writtenAt: z.date(),
        }),
      ),
    }),
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.issueKey);
      const found = await requireDocument(context, issue.id, input.name);
      const rows = await context.db.query.documentVersion.findMany({
        where: { documentId: found.id },
        orderBy: { version: "desc" },
      });
      return {
        versions: rows.map((row) => ({
          version: row.version,
          authorMemberId: row.authorMemberId,
          writtenAt: row.createdAt,
        })),
      };
    },
  }),

  get: defineOperation({
    name: "documents.get",
    summary: "One Document on an Issue, at its current version or an older one",
    method: "GET",
    path: "/issues/{issueKey}/documents/{name}",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      issueKey: z.string(),
      name: z.string(),
      /** Omitted, the current version. */
      version: z.coerce.number().int().min(1).optional(),
    }),
    output: DocumentAtVersionSchema,
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.issueKey);
      const found = await requireDocument(context, issue.id, input.name);
      const version = input.version ?? found.currentVersion;
      const row = await context.db.query.documentVersion.findFirst({
        where: { documentId: found.id, version },
      });
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: `No version ${version} of ${input.name}` });
      }
      return {
        ...found,
        version: row.version,
        body: row.body,
        authorMemberId: row.authorMemberId,
        writtenAt: row.createdAt,
      };
    },
  }),

  write: defineOperation({
    name: "documents.write",
    summary: "Write a new version of a Document; older ones stay readable",
    method: "POST",
    path: "/issues/{issueKey}/documents/{name}",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({
      issueKey: z.string(),
      name: z.string(),
      body: z.string().max(100_000),
      /**
       * The version this edit started from. Given, and a write that would land
       * on top of somebody else's is refused rather than quietly becoming the
       * current version: two people editing at once is the case deevy has, and
       * silently keeping the later one is the wrong answer to it. Omitted — an
       * Agent over MCP, a script — the write lands as it always did.
       */
      baseVersion: z.number().int().min(1).optional(),
    }),
    output: DocumentAtVersionSchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.issueKey);
      const found = await requireDocument(context, issue.id, input.name);
      if (input.baseVersion !== undefined && input.baseVersion !== found.currentVersion) {
        throw new ORPCError("CONFLICT", {
          message: `${input.name} is at version ${String(found.currentVersion)}; this edit started from ${String(input.baseVersion)}. Read the newer one and write again.`,
        });
      }
      const version = await writeVersion(context.db, found, input.body, context.member.id);
      await appendEvent(context, {
        kind: "document.updated",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: { name: found.name, version },
      });
      return {
        ...found,
        currentVersion: version,
        version,
        body: input.body,
        authorMemberId: context.member.id,
        writtenAt: new Date(),
      };
    },
  }),
};
