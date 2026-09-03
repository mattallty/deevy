import { defineRelations, defineRelationsPart } from "drizzle-orm";
import { account, authRelations, session, user, verification } from "./schema/auth.ts";
import { allowlistRule } from "./schema/allowlist.ts";
import { event } from "./schema/event.ts";
import { project, team, teamMember, workflowState } from "./schema/project.ts";
import { member, workspace } from "./schema/workspace.ts";

export const tables = {
  user,
  session,
  account,
  verification,
  workspace,
  member,
  event,
  allowlistRule,
  team,
  teamMember,
  project,
  workflowState,
};

const appRelations = defineRelationsPart(tables, (r) => ({
  workspace: {
    members: r.many.member({ from: r.workspace.id, to: r.member.workspaceId }),
    events: r.many.event({ from: r.workspace.id, to: r.event.workspaceId }),
    allowlistRules: r.many.allowlistRule({
      from: r.workspace.id,
      to: r.allowlistRule.workspaceId,
    }),
    teams: r.many.team({ from: r.workspace.id, to: r.team.workspaceId }),
    projects: r.many.project({ from: r.workspace.id, to: r.project.workspaceId }),
  },
  member: {
    workspace: r.one.workspace({ from: r.member.workspaceId, to: r.workspace.id, optional: false }),
    user: r.one.user({ from: r.member.userId, to: r.user.id, optional: false }),
    sponsor: r.one.member({ from: r.member.sponsorId, to: r.member.id }),
    teams: r.many.team({
      from: r.member.id.through(r.teamMember.memberId),
      to: r.team.id.through(r.teamMember.teamId),
    }),
  },
  team: {
    workspace: r.one.workspace({ from: r.team.workspaceId, to: r.workspace.id, optional: false }),
    members: r.many.member({
      from: r.team.id.through(r.teamMember.teamId),
      to: r.member.id.through(r.teamMember.memberId),
    }),
    projects: r.many.project({ from: r.team.id, to: r.project.teamId }),
  },
  teamMember: {
    team: r.one.team({ from: r.teamMember.teamId, to: r.team.id, optional: false }),
    member: r.one.member({ from: r.teamMember.memberId, to: r.member.id, optional: false }),
  },
  project: {
    workspace: r.one.workspace({
      from: r.project.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    team: r.one.team({ from: r.project.teamId, to: r.team.id }),
    states: r.many.workflowState({ from: r.project.id, to: r.workflowState.projectId }),
  },
  workflowState: {
    project: r.one.project({ from: r.workflowState.projectId, to: r.project.id, optional: false }),
  },
  allowlistRule: {
    workspace: r.one.workspace({
      from: r.allowlistRule.workspaceId,
      to: r.workspace.id,
      optional: false,
    }),
    creator: r.one.member({ from: r.allowlistRule.createdBy, to: r.member.id }),
  },
  event: {
    workspace: r.one.workspace({ from: r.event.workspaceId, to: r.workspace.id, optional: false }),
    actor: r.one.member({ from: r.event.actorMemberId, to: r.member.id }),
  },
}));

// Parts are merged per table key, the way the Better Auth Drizzle docs describe:
// every table gets an entry, Better Auth's generated part supplies user/session/
// account, ours supplies workspace/member.
export const relations = {
  ...defineRelations(tables),
  ...authRelations,
  ...appRelations,
};
