import { eq } from "drizzle-orm";
import { z } from "zod";
import { comment as commentTable } from "@deevy/db";
import { resolveMentions } from "../mentions.ts";
import { CommentWithAuthorSchema } from "../schemas.ts";
import { appendEvent } from "../events.ts";
import { defineOperation } from "./registry.ts";
import { assertMayEdit, loadComment, requireComment, requireIssue } from "./shared.ts";
import { newId } from "../ids.ts";

export const comments = {
  list: defineOperation({
    name: "comments.list",
    summary: "The comments on an Issue, oldest first",
    method: "GET",
    path: "/issues/{issueKey}/comments",
    auth: "member",
    agents: true,
    input: z.object({ issueKey: z.string() }),
    output: z.object({ comments: z.array(CommentWithAuthorSchema) }),
    handler: async ({ input, context }) => {
      const { issue } = await requireIssue(context, input.issueKey);
      const rows = await context.db.query.comment.findMany({
        where: { issueId: issue.id },
        with: { author: { with: { user: true } } },
        orderBy: { createdAt: "asc" },
      });
      // A deleted comment keeps its place in the thread but not its words.
      return {
        comments: rows.map((row) => (row.deletedAt ? { ...row, body: "" } : row)),
      };
    },
  }),

  create: defineOperation({
    name: "comments.create",
    summary: "Say something on an Issue, mentioning Members and Teams by handle",
    method: "POST",
    path: "/issues/{issueKey}/comments",
    auth: "member",
    agents: true,
    mcp: true,
    input: z.object({ issueKey: z.string(), body: z.string().trim().min(1).max(100_000) }),
    output: CommentWithAuthorSchema,
    handler: async ({ input, context }) => {
      const { issue, project } = await requireIssue(context, input.issueKey);
      const id = newId("comment");
      await context.db.insert(commentTable).values({
        id,
        issueId: issue.id,
        authorMemberId: context.member.id,
        body: input.body,
      });
      const mentionedMemberIds = await resolveMentions(
        context.db,
        context.workspace.id,
        input.body,
      );
      await appendEvent(context, {
        kind: "comment.created",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: { commentId: id, mentionedMemberIds },
      });
      return loadComment(context, id);
    },
  }),

  update: defineOperation({
    name: "comments.update",
    summary: "Edit a comment you wrote",
    method: "PATCH",
    path: "/comments/{commentId}",
    auth: "member",
    input: z.object({ commentId: z.string(), body: z.string().trim().min(1).max(100_000) }),
    output: CommentWithAuthorSchema,
    handler: async ({ input, context }) => {
      const found = await requireComment(context, input.commentId);
      assertMayEdit(context, found.authorMemberId);
      await context.db
        .update(commentTable)
        .set({ body: input.body, editedAt: new Date() })
        .where(eq(commentTable.id, found.id));
      const mentionedMemberIds = await resolveMentions(
        context.db,
        context.workspace.id,
        input.body,
      );
      await appendEvent(context, {
        kind: "comment.edited",
        subjectType: "issue",
        subjectId: found.issueId,
        projectId: found.issue.projectId,
        payload: { commentId: found.id, mentionedMemberIds },
      });
      return loadComment(context, found.id);
    },
  }),

  delete: defineOperation({
    name: "comments.delete",
    summary: "Withdraw a comment; it keeps its place in the thread",
    method: "DELETE",
    path: "/comments/{commentId}",
    auth: "member",
    input: z.object({ commentId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireComment(context, input.commentId);
      if (context.member.role !== "admin") assertMayEdit(context, found.authorMemberId);
      if (found.deletedAt) return { deleted: true as const };

      await context.db
        .update(commentTable)
        .set({ deletedAt: new Date() })
        .where(eq(commentTable.id, found.id));
      await appendEvent(context, {
        kind: "comment.deleted",
        subjectType: "issue",
        subjectId: found.issueId,
        projectId: found.issue.projectId,
        payload: { commentId: found.id },
      });
      return { deleted: true as const };
    },
  }),
};
