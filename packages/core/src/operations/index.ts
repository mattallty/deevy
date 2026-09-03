import { and, asc, count, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import {
  allowlistRule as allowlistRuleTable,
  event as eventTable,
  member as memberTable,
} from "@deevy/db";
import {
  allowlistRuleKinds,
  project as projectTable,
  team as teamTable,
  teamMember as teamMemberTable,
} from "@deevy/db";
import { allocateHandle, slugify } from "../handles.ts";
import { createProject, ProjectKeyPattern } from "../projects.ts";
import {
  AllowlistRuleSchema,
  EventSchema,
  ProjectWithStatesSchema,
  TeamWithMembersSchema,
  MemberSchema,
  MemberWithUserSchema,
  UserSchema,
  WorkspaceSchema,
} from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";
import type { ContextFor } from "./registry.ts";

/** The Member an admin operation names, or NOT_FOUND. Scoped to the Workspace. */
async function findMember(context: ContextFor<"admin">, memberId: string) {
  const found = await context.db.query.member.findFirst({
    where: { id: memberId, workspaceId: context.workspace.id },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Member of this Workspace" });
  return found;
}

/** A Workspace always keeps one admin who can still act, so the last one is protected. */
async function assertNotTheLastAdmin(context: ContextFor<"admin">, memberId: string) {
  const [row] = await context.db
    .select({ remaining: count() })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.workspaceId, context.workspace.id),
        eq(memberTable.role, "admin"),
        isNull(memberTable.suspendedAt),
        ne(memberTable.id, memberId),
      ),
    );
  if ((row?.remaining ?? 0) === 0) {
    throw new ORPCError("BAD_REQUEST", {
      message: "A Workspace needs one admin: this is the last one",
    });
  }
}

export const health = {
  ping: defineOperation({
    name: "health.ping",
    summary: "Liveness check",
    method: "GET",
    path: "/health/ping",
    auth: "public",
    input: NoInput,
    output: z.object({ ok: z.literal(true), time: z.string() }),
    handler: async () => ({ ok: true as const, time: new Date().toISOString() }),
  }),
};

export const me = {
  get: defineOperation({
    name: "me.get",
    summary: "The signed-in Human, their Member row, and the Workspace",
    method: "GET",
    path: "/me",
    auth: "session",
    input: NoInput,
    output: z.object({
      user: UserSchema,
      member: MemberSchema.nullable(),
      workspace: WorkspaceSchema.nullable(),
    }),
    handler: async ({ context }) => ({
      user: {
        id: context.session.user.id,
        name: context.session.user.name,
        email: context.session.user.email,
        image: context.session.user.image ?? null,
        kind: context.session.user.kind ?? "human",
      },
      member: context.member,
      workspace: context.workspace,
    }),
  }),
};

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
};

export const events = {
  list: defineOperation({
    name: "events.list",
    summary: "Events in this Workspace, oldest first, from a cursor",
    method: "GET",
    path: "/events",
    auth: "member",
    input: z.object({
      /** Return Events after this seq. Pass back the previous page's nextCursor. */
      after: z.coerce.number().int().nonnegative().optional(),
      subjectType: z.string().optional(),
      subjectId: z.string().optional(),
      projectId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
    output: z.object({
      events: z.array(EventSchema),
      /** The seq of the last Event returned, or null when the page is empty. */
      nextCursor: z.number().int().nullable(),
    }),
    handler: async ({ input, context }) => {
      const rows = await context.db
        .select()
        .from(eventTable)
        .where(
          and(
            eq(eventTable.workspaceId, context.workspace.id),
            input.after === undefined ? undefined : gt(eventTable.seq, input.after),
            input.subjectType === undefined
              ? undefined
              : eq(eventTable.subjectType, input.subjectType),
            input.subjectId === undefined ? undefined : eq(eventTable.subjectId, input.subjectId),
            input.projectId === undefined ? undefined : eq(eventTable.projectId, input.projectId),
          ),
        )
        .orderBy(asc(eventTable.seq))
        .limit(input.limit);
      return { events: rows, nextCursor: rows.at(-1)?.seq ?? null };
    },
  }),
};

export const members = {
  list: defineOperation({
    name: "members.list",
    summary: "Every Member of this Workspace",
    method: "GET",
    path: "/members",
    auth: "member",
    input: NoInput,
    output: z.object({ members: z.array(MemberWithUserSchema) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.member.findMany({
        where: { workspaceId: context.workspace.id },
        with: { user: true },
        orderBy: { createdAt: "asc" },
      });
      return { members: rows };
    },
  }),

  updateRole: defineOperation({
    name: "members.updateRole",
    summary: "Make a Member an admin of this Workspace, or an ordinary Member again",
    method: "POST",
    path: "/members/{memberId}/role",
    auth: "admin",
    input: z.object({ memberId: z.string(), role: z.enum(["admin", "member"]) }),
    output: MemberSchema,
    handler: async ({ input, context }) => {
      const found = await findMember(context, input.memberId);
      if (found.role === input.role) return found;
      if (found.role === "admin") await assertNotTheLastAdmin(context, found.id);

      const [row] = await context.db
        .update(memberTable)
        .set({ role: input.role })
        .where(eq(memberTable.id, found.id))
        .returning();
      await appendEvent(context, {
        kind: "member.role_changed",
        subjectType: "member",
        subjectId: found.id,
        payload: { from: found.role, to: input.role },
      });
      return row as typeof found;
    },
  }),

  suspend: defineOperation({
    name: "members.suspend",
    summary: "Shut a Member out of the Workspace without deleting their trail",
    method: "POST",
    path: "/members/{memberId}/suspend",
    auth: "admin",
    input: z.object({ memberId: z.string() }),
    output: MemberSchema,
    handler: async ({ input, context }) => {
      const found = await findMember(context, input.memberId);
      if (found.suspendedAt) return found;
      if (found.role === "admin") await assertNotTheLastAdmin(context, found.id);

      const [row] = await context.db
        .update(memberTable)
        .set({ suspendedAt: new Date() })
        .where(eq(memberTable.id, found.id))
        .returning();
      await appendEvent(context, {
        kind: "member.suspended",
        subjectType: "member",
        subjectId: found.id,
      });
      return row as typeof found;
    },
  }),

  reinstate: defineOperation({
    name: "members.reinstate",
    summary: "Let a suspended Member back into the Workspace",
    method: "POST",
    path: "/members/{memberId}/reinstate",
    auth: "admin",
    input: z.object({ memberId: z.string() }),
    output: MemberSchema,
    handler: async ({ input, context }) => {
      const found = await findMember(context, input.memberId);
      if (!found.suspendedAt) return found;

      const [row] = await context.db
        .update(memberTable)
        .set({ suspendedAt: null })
        .where(eq(memberTable.id, found.id))
        .returning();
      await appendEvent(context, {
        kind: "member.reinstated",
        subjectType: "member",
        subjectId: found.id,
      });
      return row as typeof found;
    },
  }),
};

/**
 * An email domain (`flippable.net`) or a GitHub organization login. Both are
 * stored lowercased so a rule matches whatever case the sign-in arrives in.
 */
const AllowlistValue = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "A domain such as flippable.net, or an organization login");

export const allowlist = {
  list: defineOperation({
    name: "allowlist.list",
    summary: "The rules that admit a sign-in to this Workspace",
    method: "GET",
    path: "/allowlist",
    auth: "admin",
    input: NoInput,
    output: z.object({ rules: z.array(AllowlistRuleSchema) }),
    handler: async ({ context }) => {
      const rules = await context.db.query.allowlistRule.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "asc" },
      });
      return { rules };
    },
  }),

  add: defineOperation({
    name: "allowlist.add",
    summary: "Admit every sign-in matching an email domain or a GitHub organization",
    method: "POST",
    path: "/allowlist",
    auth: "admin",
    input: z.object({ kind: z.enum(allowlistRuleKinds), value: AllowlistValue }),
    output: AllowlistRuleSchema,
    handler: async ({ input, context }) => {
      const existing = await context.db.query.allowlistRule.findFirst({
        where: { workspaceId: context.workspace.id, kind: input.kind, value: input.value },
      });
      if (existing) throw new ORPCError("CONFLICT", { message: "That rule is already in place" });

      const [row] = await context.db
        .insert(allowlistRuleTable)
        .values({
          id: crypto.randomUUID(),
          workspaceId: context.workspace.id,
          kind: input.kind,
          value: input.value,
          createdBy: context.member.id,
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      await appendEvent(context, {
        kind: "allowlist.rule_added",
        subjectType: "allowlist_rule",
        subjectId: row.id,
        payload: { kind: row.kind, value: row.value },
      });
      return row;
    },
  }),

  remove: defineOperation({
    name: "allowlist.remove",
    summary: "Stop admitting sign-ins that only this rule matched",
    method: "DELETE",
    path: "/allowlist/{ruleId}",
    auth: "admin",
    input: z.object({ ruleId: z.string() }),
    output: z.object({ removed: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await context.db.query.allowlistRule.findFirst({
        where: { id: input.ruleId, workspaceId: context.workspace.id },
      });
      if (!found) throw new ORPCError("NOT_FOUND", { message: "No such allowlist rule" });

      await context.db.delete(allowlistRuleTable).where(eq(allowlistRuleTable.id, found.id));
      await appendEvent(context, {
        kind: "allowlist.rule_removed",
        subjectType: "allowlist_rule",
        subjectId: found.id,
        payload: { kind: found.kind, value: found.value },
      });
      return { removed: true as const };
    },
  }),
};

/** Strict on the way in: `dev` is a mistake worth reporting, not something to correct silently. */
const ProjectKey = z
  .string()
  .trim()
  .regex(ProjectKeyPattern, "Two to six uppercase letters, as in DEV");

/** Lenient on the way out, so `/projects/dev` finds DEV. */
const ProjectKeyLookup = z.string().trim().toUpperCase().regex(ProjectKeyPattern);

/**
 * A boolean in a GET input. The OpenAPI surface sends it as a query string and
 * the RPC link sends a real boolean, so both are accepted.
 */
const QueryFlag = z.union([z.boolean(), z.stringbool()]);

/** The Project an operation names by key, or NOT_FOUND. Scoped to the Workspace. */
async function requireProject(context: ContextFor<"member">, key: string) {
  const found = await context.db.query.project.findFirst({
    where: { workspaceId: context.workspace.id, key },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Project" });
  return found;
}

/**
 * An admin, or a Member of the Team that owns the Project, may change it. A
 * Project no Team owns is the admins' to change (docs/plans/m1.md).
 */
async function requireProjectOrAdmin(context: ContextFor<"member">, key: string) {
  const found = await requireProject(context, key);
  if (context.member.role === "admin") return found;
  const onTeam = found.teamId
    ? await context.db.query.teamMember.findFirst({
        where: { teamId: found.teamId, memberId: context.member.id },
      })
    : undefined;
  if (!onTeam) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only an admin or a Member of the owning Team can change this Project",
    });
  }
  return found;
}

/** The Team an operation names, or NOT_FOUND. Scoped to the Workspace. */
async function requireTeam(context: ContextFor<"member">, teamId: string) {
  const found = await context.db.query.team.findFirst({
    where: { id: teamId, workspaceId: context.workspace.id },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Team in this Workspace" });
  return found;
}

/** A Project with its Workflow and Team, the shape every Project operation returns. */
async function loadProject(db: ContextFor<"member">["db"], id: string) {
  const found = await db.query.project.findFirst({
    where: { id },
    with: { states: { orderBy: { position: "asc" } }, team: true },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Project" });
  return found;
}

export const projects = {
  list: defineOperation({
    name: "projects.list",
    summary: "The Projects in this Workspace",
    method: "GET",
    path: "/projects",
    auth: "member",
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
    input: z.object({ key: ProjectKeyLookup }),
    output: ProjectWithStatesSchema,
    handler: async ({ input, context }) => {
      const found = await context.db.query.project.findFirst({
        where: { workspaceId: context.workspace.id, key: input.key },
        with: { states: { orderBy: { position: "asc" } }, team: true },
      });
      if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Project" });
      return found;
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

/** A Team with the Members on it, the shape every Team operation returns. */
async function loadTeam(db: ContextFor<"member">["db"], id: string) {
  const found = await db.query.team.findFirst({
    where: { id },
    with: { members: { with: { user: true } } },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Team" });
  return found;
}

/**
 * A Team is not a permission wall, but its own Members maintain it: an admin,
 * or someone on the Team, may change it (docs/plans/m1.md).
 */
async function requireTeamOrAdmin(context: ContextFor<"member">, teamId: string) {
  const found = await requireTeam(context, teamId);
  if (context.member.role === "admin") return found;
  const onTeam = await context.db.query.teamMember.findFirst({
    where: { teamId, memberId: context.member.id },
  });
  if (!onTeam) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only an admin or a Member of this Team can do that",
    });
  }
  return found;
}

export const teams = {
  list: defineOperation({
    name: "teams.list",
    summary: "The Teams in this Workspace, with their Members",
    method: "GET",
    path: "/teams",
    auth: "member",
    input: NoInput,
    output: z.object({ teams: z.array(TeamWithMembersSchema) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.team.findMany({
        where: { workspaceId: context.workspace.id },
        with: { members: { with: { user: true } } },
        orderBy: { createdAt: "asc" },
      });
      return { teams: rows };
    },
  }),

  create: defineOperation({
    name: "teams.create",
    summary: "Name a group of Members that owns Projects and can be mentioned",
    method: "POST",
    path: "/teams",
    auth: "admin",
    input: z.object({
      name: z.string().trim().min(1).max(120),
      /** Defaults to a slug of the name, suffixed if a Member or Team holds it. */
      handle: z.string().trim().max(60).nullish(),
    }),
    output: TeamWithMembersSchema,
    handler: async ({ input, context }) => {
      const id = crypto.randomUUID();
      const handle = await allocateHandle(context.db, slugify(input.handle ?? input.name));
      await context.db
        .insert(teamTable)
        .values({ id, workspaceId: context.workspace.id, name: input.name, handle });
      await appendEvent(context, {
        kind: "team.created",
        subjectType: "team",
        subjectId: id,
        payload: { name: input.name, handle },
      });
      return loadTeam(context.db, id);
    },
  }),

  update: defineOperation({
    name: "teams.update",
    summary: "Rename a Team",
    method: "PATCH",
    path: "/teams/{teamId}",
    auth: "member",
    input: z.object({ teamId: z.string(), name: z.string().trim().min(1).max(120) }),
    output: TeamWithMembersSchema,
    handler: async ({ input, context }) => {
      const found = await requireTeamOrAdmin(context, input.teamId);
      await context.db
        .update(teamTable)
        .set({ name: input.name })
        .where(eq(teamTable.id, found.id));
      await appendEvent(context, {
        kind: "team.updated",
        subjectType: "team",
        subjectId: found.id,
        payload: { from: found.name, to: input.name },
      });
      return loadTeam(context.db, found.id);
    },
  }),

  delete: defineOperation({
    name: "teams.delete",
    summary: "Disband a Team; its Projects keep going without one",
    method: "DELETE",
    path: "/teams/{teamId}",
    auth: "admin",
    input: z.object({ teamId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireTeam(context, input.teamId);
      await context.db.delete(teamTable).where(eq(teamTable.id, found.id));
      await appendEvent(context, {
        kind: "team.deleted",
        subjectType: "team",
        subjectId: found.id,
        payload: { name: found.name, handle: found.handle },
      });
      return { deleted: true as const };
    },
  }),

  addMember: defineOperation({
    name: "teams.addMember",
    summary: "Put a Member on a Team",
    method: "POST",
    path: "/teams/{teamId}/members",
    auth: "member",
    input: z.object({ teamId: z.string(), memberId: z.string() }),
    output: TeamWithMembersSchema,
    handler: async ({ input, context }) => {
      const found = await requireTeamOrAdmin(context, input.teamId);
      const target = await context.db.query.member.findFirst({
        where: { id: input.memberId, workspaceId: context.workspace.id },
      });
      if (!target) {
        throw new ORPCError("NOT_FOUND", { message: "No such Member of this Workspace" });
      }
      const already = await context.db.query.teamMember.findFirst({
        where: { teamId: found.id, memberId: target.id },
      });
      if (already) return loadTeam(context.db, found.id);

      await context.db.insert(teamMemberTable).values({ teamId: found.id, memberId: target.id });
      await appendEvent(context, {
        kind: "team.member_added",
        subjectType: "team",
        subjectId: found.id,
        payload: { memberId: target.id },
      });
      return loadTeam(context.db, found.id);
    },
  }),

  removeMember: defineOperation({
    name: "teams.removeMember",
    summary: "Take a Member off a Team",
    method: "DELETE",
    path: "/teams/{teamId}/members/{memberId}",
    auth: "member",
    input: z.object({ teamId: z.string(), memberId: z.string() }),
    output: TeamWithMembersSchema,
    handler: async ({ input, context }) => {
      const found = await requireTeamOrAdmin(context, input.teamId);
      const already = await context.db.query.teamMember.findFirst({
        where: { teamId: found.id, memberId: input.memberId },
      });
      if (!already) return loadTeam(context.db, found.id);

      await context.db
        .delete(teamMemberTable)
        .where(
          and(eq(teamMemberTable.teamId, found.id), eq(teamMemberTable.memberId, input.memberId)),
        );
      await appendEvent(context, {
        kind: "team.member_removed",
        subjectType: "team",
        subjectId: found.id,
        payload: { memberId: input.memberId },
      });
      return loadTeam(context.db, found.id);
    },
  }),
};

export const router = { health, me, workspace, events, members, allowlist, projects, teams };
export type AppRouter = typeof router;
