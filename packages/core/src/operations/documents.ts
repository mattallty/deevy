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
    }),
    output: DocumentAtVersionSchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.issueKey);
      const found = await requireDocument(context, issue.id, input.name);
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
