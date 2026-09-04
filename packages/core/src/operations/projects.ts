import { eq } from "drizzle-orm";
import { z } from "zod";
import { project as projectTable } from "@deevy/db";
import { createProject } from "../projects.ts";
import { ProjectWithStatesSchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { defineOperation } from "./registry.ts";
import {
  ProjectKey,
  ProjectKeyLookup,
  QueryFlag,
  loadProject,
  requireProject,
  requireProjectOrAdmin,
  requireTeam,
} from "./shared.ts";

export const projects = {
  list: defineOperation({
    name: "projects.list",
    summary: "The Projects in this Workspace",
    method: "GET",
    path: "/projects",
    auth: "member",
    agents: true,
    input: z.object({
      /** Archived Projects are left out unless asked for. */
      includeArchived: QueryFlag.default(false),
    }),
    output: z.object({ projects: z.array(ProjectWithStatesSchema) }),
    handler: async ({ input, context }) => {
      const rows = await context.db.query.project.findMany({
        where: {
          workspaceId: context.workspace.id,
          ...(input.includeArchived ? {} : { archivedAt: { isNull: true } }),
          ...(context.grantedProjectIds ? { id: { in: context.grantedProjectIds } } : {}),
        },
        with: { states: { orderBy: { position: "asc" } }, team: true },
        orderBy: { createdAt: "asc" },
      });
      return { projects: rows };
    },
  }),

  get: defineOperation({
    name: "projects.get",
    summary: "One Project by its key, with its Workflow",
    method: "GET",
    path: "/projects/{key}",
    auth: "member",
    agents: true,
    input: z.object({ key: ProjectKeyLookup }),
    output: ProjectWithStatesSchema,
    handler: async ({ input, context }) => {
      // Through requireProject rather than a query of its own: the grant check
      // lives there, and an operation that reads the table directly is how an
      // ungranted Project becomes readable (docs/plans/m2.md).
      const found = await requireProject(context, input.key);
      return loadProject(context.db, found.id);
    },
  }),

  update: defineOperation({
    name: "projects.update",
    summary: "Rename a Project, change its description, or hand it to a Team",
    method: "PATCH",
    path: "/projects/{key}",
    auth: "member",
    input: z.object({
      key: ProjectKeyLookup,
      name: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(4000).nullish(),
      teamId: z.string().nullish(),
    }),
    output: ProjectWithStatesSchema,
    handler: async ({ input, context }) => {
      const found = await requireProjectOrAdmin(context, input.key);
      if (input.teamId) await requireTeam(context, input.teamId);

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (input.name !== undefined && input.name !== found.name) {
        changes.name = { from: found.name, to: input.name };
      }
      if (input.description !== undefined && input.description !== found.description) {
        changes.description = { from: found.description, to: input.description ?? null };
      }
      if (input.teamId !== undefined && input.teamId !== found.teamId) {
        changes.teamId = { from: found.teamId, to: input.teamId ?? null };
      }
      if (Object.keys(changes).length === 0) return loadProject(context.db, found.id);

      await context.db
        .update(projectTable)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description ?? null }),
          ...(input.teamId === undefined ? {} : { teamId: input.teamId ?? null }),
        })
        .where(eq(projectTable.id, found.id));
      await appendEvent(context, {
        kind: "project.updated",
        subjectType: "project",
        subjectId: found.id,
        projectId: found.id,
        payload: changes,
      });
      return loadProject(context.db, found.id);
    },
  }),

  archive: defineOperation({
    name: "projects.archive",
    summary: "Close a Project down; it stays readable and keeps its Issues",
    method: "POST",
    path: "/projects/{key}/archive",
    auth: "admin",
    input: z.object({ key: ProjectKeyLookup }),
    output: ProjectWithStatesSchema,
    handler: async ({ input, context }) => {
      const found = await requireProject(context, input.key);
      if (found.archivedAt) return loadProject(context.db, found.id);

      await context.db
        .update(projectTable)
        .set({ archivedAt: new Date() })
        .where(eq(projectTable.id, found.id));
      await appendEvent(context, {
        kind: "project.archived",
        subjectType: "project",
        subjectId: found.id,
        projectId: found.id,
        payload: { key: found.key },
      });
      return loadProject(context.db, found.id);
    },
  }),

  create: defineOperation({
    name: "projects.create",
    summary: "Start a Project with the default Workflow",
    method: "POST",
    path: "/projects",
    auth: "admin",
    input: z.object({
      key: ProjectKey,
      name: z.string().trim().min(1).max(120),
      description: z.string().max(4000).nullish(),
      teamId: z.string().nullish(),
    }),
    output: ProjectWithStatesSchema,
    handler: async ({ input, context }) => {
      const taken = await context.db.query.project.findFirst({
        where: { workspaceId: context.workspace.id, key: input.key },
      });
      if (taken) {
        throw new ORPCError("CONFLICT", { message: `Another Project already uses ${input.key}` });
      }
      if (input.teamId) await requireTeam(context, input.teamId);

      const created = await createProject(context.db, {
        workspaceId: context.workspace.id,
        key: input.key,
        name: input.name,
        description: input.description,
        teamId: input.teamId,
      });
      await appendEvent(context, {
        kind: "project.created",
        subjectType: "project",
        subjectId: created.id,
        projectId: created.id,
        payload: { key: created.key, name: created.name },
      });
      return loadProject(context.db, created.id);
    },
  }),
};
