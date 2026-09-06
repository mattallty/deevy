import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { team as teamTable, teamMember as teamMemberTable } from "@deevy/db";
import { allocateHandle, slugify } from "../handles.ts";
import { TeamWithMembersSchema } from "../schemas.ts";
import { ORPCError } from "@orpc/server";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation } from "./registry.ts";
import { loadTeam, requireTeam, requireTeamOrAdmin } from "./shared.ts";
import { newId } from "../ids.ts";

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
      const id = newId("team");
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
