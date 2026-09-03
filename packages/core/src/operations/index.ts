import { and, asc, count, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import {
  allowlistRule as allowlistRuleTable,
  event as eventTable,
  member as memberTable,
} from "@deevy/db";
import {
  allowlistRuleKinds,
  issue as issueTable,
  project as projectTable,
  workflowState as workflowStateTable,
  workflowStateCategories,
  team as teamTable,
  teamMember as teamMemberTable,
} from "@deevy/db";
import { allocateHandle, slugify } from "../handles.ts";
import {
  insertIssue,
  isSelfOrDescendant,
  issueKey,
  nextIssueNumber,
  parseIssueKey,
} from "../issues.ts";
import { ensureStateDocument, writeVersion } from "../documents.ts";
import { createProject, ProjectKeyPattern } from "../projects.ts";
import {
  assertHuman,
  assertLeavable,
  enterState,
  nextState,
  previousState,
  recordGateDecision,
} from "../workflow.ts";
import {
  AllowlistRuleSchema,
  EventSchema,
  IssueDetailSchema,
  IssueSummarySchema,
  DocumentAtVersionSchema,
  DocumentSchema,
  ProjectWithStatesSchema,
  TeamWithMembersSchema,
  WorkflowStateSchema,
  MemberSchema,
  MemberWithUserSchema,
  UserSchema,
  WorkspaceSchema,
} from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { eventIterator } from "@orpc/server";
import { subscribeToEvents } from "../live.ts";
import { NoInput, defineOperation, defineStreamOperation } from "./registry.ts";
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

  subscribe: defineStreamOperation({
    name: "events.subscribe",
    summary: "The Event log as it happens, from a cursor, with heartbeats",
    method: "GET",
    path: "/events/subscribe",
    auth: "member",
    input: z.object({
      /** Resume from here. Omitted, the stream starts with what happens next. */
      after: z.coerce.number().int().nonnegative().optional(),
      projectId: z.string().optional(),
    }),
    output: eventIterator(
      z.union([
        z.object({ type: z.literal("event"), event: EventSchema }),
        z.object({ type: z.literal("heartbeat"), cursor: z.number().int().nullable() }),
      ]),
    ),
    handler: ({ input, context, signal }) =>
      subscribeToEvents({
        db: context.db,
        workspaceId: context.workspace.id,
        projectId: input.projectId,
        after: input.after,
        signal,
      }),
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

/** The relations every Issue shape needs loaded, and the key derived onto it. */
const issueWith = { state: true, assignee: { with: { user: true } } } as const;

type LoadedIssue = { number: number; project?: { key: string } } & Record<string, unknown>;

function withKey<T extends LoadedIssue>(row: T, projectKey: string) {
  return { ...row, key: issueKey(projectKey, row.number) };
}

/** The Issue an operation names by key, or NOT_FOUND. Scoped to the Workspace. */
async function requireIssue(context: ContextFor<"member">, key: string) {
  const parsed = parseIssueKey(key);
  if (!parsed) throw new ORPCError("NOT_FOUND", { message: "Not an Issue key" });
  const project = await context.db.query.project.findFirst({
    where: { workspaceId: context.workspace.id, key: parsed.projectKey },
  });
  if (!project) throw new ORPCError("NOT_FOUND", { message: "No such Project" });
  const found = await context.db.query.issue.findFirst({
    where: { projectId: project.id, number: parsed.number },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: `No such Issue: ${key}` });
  return { issue: found, project };
}

async function loadIssue(context: ContextFor<"member">, id: string) {
  const found = await context.db.query.issue.findFirst({
    where: { id },
    with: {
      ...issueWith,
      project: true,
      parent: { with: issueWith },
      children: { with: issueWith, orderBy: { number: "asc" } },
      gateDecisions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Issue" });
  const key = found.project.key;
  return {
    ...withKey(found, key),
    parent: found.parent ? withKey(found.parent, key) : null,
    children: found.children.map((child) => withKey(child, key)),
  };
}

/** The Member an Issue may be assigned to, or BAD_REQUEST. */
async function requireAssignee(context: ContextFor<"member">, memberId: string) {
  const found = await context.db.query.member.findFirst({
    where: { id: memberId, workspaceId: context.workspace.id },
  });
  if (!found) {
    throw new ORPCError("BAD_REQUEST", {
      message: "An Issue can only be assigned to a Member of this Workspace",
    });
  }
  return found;
}

/**
 * Creates the Document the State an Issue just entered asks for, and records
 * it. Called wherever an Issue enters a State: on create, move, approve and
 * reject (docs/plans/m1.md).
 */
async function openStateDocument(
  context: ContextFor<"member">,
  issueId: string,
  projectId: string,
  state: { documentName: string | null; documentTemplate: string | null },
) {
  const created = await ensureStateDocument(context.db, issueId, state, context.member.id);
  if (!created) return;
  await appendEvent(context, {
    kind: "document.created",
    subjectType: "issue",
    subjectId: issueId,
    projectId,
    payload: { name: created.name, documentId: created.id },
  });
}

/** The Issue, its Project, and that Project's States in order: what a move needs. */
async function requireIssueForMove(context: ContextFor<"member">, key: string) {
  const { issue, project } = await requireIssue(context, key);
  const states = await context.db.query.workflowState.findMany({
    where: { projectId: project.id },
    orderBy: { position: "asc" },
  });
  const from = states.find((state) => state.id === issue.stateId);
  if (!from) throw new ORPCError("BAD_REQUEST", { message: "This Issue is in no known State" });
  return { issue, project, states, from };
}

export const workflow = {
  get: defineOperation({
    name: "workflow.get",
    summary: "A Project's Workflow: its States in order, and which are Gates",
    method: "GET",
    path: "/projects/{projectKey}/workflow",
    auth: "member",
    input: z.object({ projectKey: ProjectKeyLookup }),
    output: z.object({ states: z.array(WorkflowStateSchema) }),
    handler: async ({ input, context }) => {
      const project = await requireProject(context, input.projectKey);
      const states = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });
      return { states };
    },
  }),

  update: defineOperation({
    name: "workflow.update",
    summary: "Rewrite a Project's Workflow: add, rename, reorder or delete States",
    method: "PUT",
    path: "/projects/{projectKey}/workflow",
    auth: "member",
    input: z.object({
      projectKey: ProjectKeyLookup,
      /** The Workflow as it should end up. Order in this array is the new order. */
      states: z.array(
        z.object({
          /** Omitted for a State being added. */
          id: z.string().optional(),
          name: z.string().trim().min(1).max(60),
          isGate: z.boolean().default(false),
          category: z.enum(workflowStateCategories),
          /** The Document this State asks for on entry, and its starting text. */
          documentName: z.string().trim().max(60).nullish(),
          documentTemplate: z.string().max(100_000).nullish(),
        }),
      ),
      deleteStates: z.array(z.string()).default([]),
      /** Where the Issues in a deleted State go. Required when any of them holds Issues. */
      moveIssuesTo: z.string().nullish(),
    }),
    output: z.object({ states: z.array(WorkflowStateSchema) }),
    handler: async ({ input, context }) => {
      const project = await requireProjectOrAdmin(context, input.projectKey);
      if (input.states.length === 0) {
        throw new ORPCError("BAD_REQUEST", { message: "A Workflow needs at least one State" });
      }
      const existing = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
      });
      const known = new Set(existing.map((state) => state.id));
      for (const state of input.states) {
        if (state.id && !known.has(state.id)) {
          throw new ORPCError("BAD_REQUEST", {
            message: "That State belongs to another Project's Workflow",
          });
        }
      }

      const doomed = input.deleteStates.filter((id) => known.has(id));
      if (doomed.length > 0) {
        const stranded = await context.db.query.issue.findMany({
          where: { projectId: project.id, stateId: { in: doomed } },
          columns: { id: true },
        });
        if (stranded.length > 0) {
          const destination = input.moveIssuesTo;
          const surviving = new Set(input.states.map((state) => state.id).filter(Boolean));
          if (!destination || !surviving.has(destination)) {
            throw new ORPCError("BAD_REQUEST", {
              message:
                "Deleting a State that holds Issues needs moveIssuesTo, a State that survives",
            });
          }
          // One statement rather than a write per Issue, since D1 charges per
          // round trip (docs/plans/m1.md).
          await context.db
            .update(issueTable)
            .set({ stateId: destination, stateEnteredAt: new Date() })
            .where(and(eq(issueTable.projectId, project.id), inArray(issueTable.stateId, doomed)));
        }
      }

      // Positions come from the order of `states`, so a reorder is just a
      // different array. Kept as sequential writes: D1 has no transactions.
      const kept: string[] = [];
      for (const [position, state] of input.states.entries()) {
        if (state.id) {
          await context.db
            .update(workflowStateTable)
            .set({
              name: state.name,
              position,
              isGate: state.isGate,
              category: state.category,
              documentName: state.documentName ?? null,
              documentTemplate: state.documentTemplate ?? null,
            })
            .where(eq(workflowStateTable.id, state.id));
          kept.push(state.id);
        } else {
          const id = crypto.randomUUID();
          await context.db.insert(workflowStateTable).values({
            id,
            projectId: project.id,
            name: state.name,
            position,
            isGate: state.isGate,
            category: state.category,
            documentName: state.documentName ?? null,
            documentTemplate: state.documentTemplate ?? null,
          });
          kept.push(id);
        }
      }
      const remove = doomed.filter((id) => !kept.includes(id));
      if (remove.length > 0) {
        await context.db
          .delete(workflowStateTable)
          .where(
            and(
              eq(workflowStateTable.projectId, project.id),
              inArray(workflowStateTable.id, remove),
            ),
          );
      }

      await appendEvent(context, {
        kind: "workflow.updated",
        subjectType: "project",
        subjectId: project.id,
        projectId: project.id,
        payload: { states: input.states.map((state) => state.name), removed: remove.length },
      });
      const states = await context.db.query.workflowState.findMany({
        where: { projectId: project.id },
        orderBy: { position: "asc" },
      });
      return { states };
    },
  }),
};

export const gates = {
  approve: defineOperation({
    name: "gates.approve",
    summary: "Let an Issue out of the Gate it is in, into the next State",
    method: "POST",
    path: "/issues/{key}/gate/approve",
    auth: "member",
    input: z.object({ key: z.string(), note: z.string().max(4000).nullish() }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      assertHuman(context.member);
      const { issue, project, states, from } = await requireIssueForMove(context, input.key);
      if (!from.isGate) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${input.key} is not in a Gate; move it instead`,
        });
      }
      const to = nextState(states, from);
      if (!to) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${from.name} is the last State; there is nowhere to approve it to`,
        });
      }

      await recordGateDecision(context.db, {
        issueId: issue.id,
        stateId: from.id,
        decision: "approved",
        note: input.note,
        memberId: context.member.id,
      });
      await enterState(context.db, issue, to);
      await appendEvent(context, {
        kind: "gate.approved",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: { state: from.name, to: to.name, note: input.note ?? null },
      });
      await openStateDocument(context, issue.id, project.id, to);
      return loadIssue(context, issue.id);
    },
  }),

  reject: defineOperation({
    name: "gates.reject",
    summary: "Send an Issue back from the Gate it is in, to the State before it",
    method: "POST",
    path: "/issues/{key}/gate/reject",
    auth: "member",
    input: z.object({ key: z.string(), note: z.string().max(4000).nullish() }),
    output: IssueDetailSchema,
    handler: async ({ input, context }) => {
      assertHuman(context.member);
      const { issue, project, states, from } = await requireIssueForMove(context, input.key);
      if (!from.isGate) {
        throw new ORPCError("BAD_REQUEST", {
          message: `${input.key} is not in a Gate; move it instead`,
        });
      }
      // A rejection in the first State keeps the Issue where it is: there is
      // nowhere further back, and the decision is still worth recording.
      const to = previousState(states, from);

      await recordGateDecision(context.db, {
        issueId: issue.id,
        stateId: from.id,
        decision: "rejected",
        note: input.note,
        memberId: context.member.id,
      });
      if (to.id !== from.id) await enterState(context.db, issue, to);
      await appendEvent(context, {
        kind: "gate.rejected",
        subjectType: "issue",
        subjectId: issue.id,
        projectId: project.id,
        payload: { state: from.name, to: to.name, note: input.note ?? null },
      });
      await openStateDocument(context, issue.id, project.id, to);
      return loadIssue(context, issue.id);
    },
  }),
};

export const issues = {
  create: defineOperation({
    name: "issues.create",
    summary: "Add an Issue to a Project, in the first State of its Workflow",
    method: "POST",
    path: "/issues",
    auth: "member",
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
    path: "/projects/{projectKey}/issues",
    auth: "member",
    input: z.object({
      projectKey: ProjectKeyLookup,
      /** Return Issues numbered above this. Pass back the previous page's nextCursor. */
      after: z.coerce.number().int().nonnegative().optional(),
      stateId: z.string().optional(),
      assigneeMemberId: z.string().optional(),
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
      const project = await requireProject(context, input.projectKey);
      const rows = await context.db.query.issue.findMany({
        where: {
          projectId: project.id,
          ...(input.after === undefined ? {} : { number: { gt: input.after } }),
          ...(input.stateId === undefined ? {} : { stateId: input.stateId }),
          ...(input.assigneeMemberId === undefined
            ? {}
            : { assigneeMemberId: input.assigneeMemberId }),
          ...(input.open ? { closedAt: { isNull: true } } : {}),
        },
        with: issueWith,
        orderBy: { number: "asc" },
        limit: input.limit,
      });
      return {
        issues: rows.map((row) => withKey(row, project.key)),
        nextCursor: rows.at(-1)?.number ?? null,
      };
    },
  }),

  get: defineOperation({
    name: "issues.get",
    summary: "One Issue by its key, with its State, Assignee, parent and children",
    method: "GET",
    path: "/issues/{key}",
    auth: "member",
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

  update: defineOperation({
    name: "issues.update",
    summary: "Change an Issue's title, description, Assignee, or parent",
    method: "PATCH",
    path: "/issues/{key}",
    auth: "member",
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
        await appendEvent(context, { kind: "issue.updated", ...subject, payload: edits });
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

/** The Document an operation names on an Issue, or NOT_FOUND. */
async function requireDocument(context: ContextFor<"member">, issueId: string, name: string) {
  const found = await context.db.query.document.findFirst({
    where: { issueId, name },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: `This Issue has no ${name} Document` });
  return found;
}

export const documents = {
  list: defineOperation({
    name: "documents.list",
    summary: "The Documents on an Issue",
    method: "GET",
    path: "/issues/{issueKey}/documents",
    auth: "member",
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
      return { ...found, version: row.version, body: row.body, authorMemberId: row.authorMemberId };
    },
  }),

  write: defineOperation({
    name: "documents.write",
    summary: "Write a new version of a Document; older ones stay readable",
    method: "POST",
    path: "/issues/{issueKey}/documents/{name}",
    auth: "member",
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
      };
    },
  }),
};

export const router = {
  health,
  me,
  workspace,
  events,
  members,
  allowlist,
  projects,
  teams,
  issues,
  gates,
  workflow,
  documents,
};
export type AppRouter = typeof router;
