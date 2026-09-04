import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspace as workspaceTable } from "@deevy/db";
import { slugify } from "../handles.ts";
import { WorkspaceSchema } from "../schemas.ts";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";

export const workspace = {
  get: defineOperation({
    name: "workspace.get",
    summary: "The Workspace this instance serves",
    method: "GET",
    path: "/workspace",
    auth: "member",
    input: NoInput,
    output: WorkspaceSchema,
    handler: async ({ context }) => context.workspace,
  }),

  update: defineOperation({
    name: "workspace.update",
    summary: "Rename the Workspace this instance serves",
    method: "PATCH",
    path: "/workspace",
    auth: "admin",
    input: z.object({ name: z.string().trim().min(1).max(120) }),
    output: WorkspaceSchema,
    handler: async ({ input, context }) => {
      if (input.name === context.workspace.name) return context.workspace;
      const [row] = await context.db
        .update(workspaceTable)
        .set({ name: input.name, slug: slugify(input.name) })
        .where(eq(workspaceTable.id, context.workspace.id))
        .returning();
      await appendEvent(context, {
        kind: "workspace.updated",
        subjectType: "workspace",
        subjectId: context.workspace.id,
        payload: { from: context.workspace.name, to: input.name },
      });
      return row ?? context.workspace;
    },
  }),
};
