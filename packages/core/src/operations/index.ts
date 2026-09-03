import { and, asc, count, eq, gt, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import {
  allowlistRule as allowlistRuleTable,
  event as eventTable,
  member as memberTable,
} from "@deevy/db";
import { allowlistRuleKinds } from "@deevy/db";
import {
  AllowlistRuleSchema,
  EventSchema,
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

export const router = { health, me, workspace, events, members, allowlist };
export type AppRouter = typeof router;
