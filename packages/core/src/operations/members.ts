import { eq } from "drizzle-orm";
import { z } from "zod";
import { member as memberTable } from "@deevy/db";
import { cascadeReinstateAgents, cascadeSuspendAgents } from "../agents.ts";
import { MemberSchema, MemberWithUserSchema } from "../schemas.ts";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";
import { assertNotTheLastAdmin, findMember } from "./shared.ts";

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
      // A suspended Sponsor suspends the Agents it answers for (docs/PLAN.md).
      if (found.kind === "human") await cascadeSuspendAgents(context, found.id);
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
      if (found.kind === "human") await cascadeReinstateAgents(context, found.id);
      return row as typeof found;
    },
  }),
};
