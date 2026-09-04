import { eq } from "drizzle-orm";
import { z } from "zod";
import { repository as repositoryTable, repositoryProviders } from "@deevy/db";
import { RepositorySchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";

export const repositories = {
  list: defineOperation({
    name: "repositories.list",
    summary: "The Repositories this Workspace knows about",
    method: "GET",
    path: "/repositories",
    auth: "member",
    input: NoInput,
    output: z.object({ repositories: z.array(RepositorySchema) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.repository.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { name: "asc" },
      });
      return { repositories: rows };
    },
  }),

  create: defineOperation({
    name: "repositories.create",
    summary: "Register a Repository so Links into it are recognised",
    method: "POST",
    path: "/repositories",
    auth: "admin",
    input: z.object({
      provider: z.enum(repositoryProviders),
      /** `owner/repo`. */
      name: z.string().trim().min(1).max(200),
      url: z.url().max(500),
    }),
    output: RepositorySchema,
    handler: async ({ input, context }) => {
      const url = input.url.replace(/\/+$/, "");
      const taken = await context.db.query.repository.findFirst({
        where: { workspaceId: context.workspace.id, url },
      });
      if (taken) {
        throw new ORPCError("CONFLICT", { message: "That Repository is already registered" });
      }
      const id = crypto.randomUUID();
      const [row] = await context.db
        .insert(repositoryTable)
        .values({
          id,
          workspaceId: context.workspace.id,
          provider: input.provider,
          name: input.name,
          url,
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      await appendEvent(context, {
        kind: "repository.created",
        subjectType: "repository",
        subjectId: id,
        payload: { name: input.name, url },
      });
      return row;
    },
  }),

  delete: defineOperation({
    name: "repositories.delete",
    summary: "Forget a Repository; Links into it keep working, unmatched",
    method: "DELETE",
    path: "/repositories/{repositoryId}",
    auth: "admin",
    input: z.object({ repositoryId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await context.db.query.repository.findFirst({
        where: { id: input.repositoryId, workspaceId: context.workspace.id },
      });
      if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Repository" });
      await context.db.delete(repositoryTable).where(eq(repositoryTable.id, found.id));
      await appendEvent(context, {
        kind: "repository.deleted",
        subjectType: "repository",
        subjectId: found.id,
        payload: { name: found.name, url: found.url },
      });
      return { deleted: true as const };
    },
  }),
};
