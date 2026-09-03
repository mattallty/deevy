import { defineRelations, defineRelationsPart } from "drizzle-orm";
import { account, authRelations, session, user, verification } from "./schema/auth.ts";
import { allowlistRule } from "./schema/allowlist.ts";
import { event } from "./schema/event.ts";
import { document, documentVersion } from "./schema/document.ts";
import { gateDecision } from "./schema/gate.ts";
import { issue } from "./schema/issue.ts";
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
  issue,
  gateDecision,
  document,
  documentVersion,
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
    issues: r.many.issue({ from: r.project.id, to: r.issue.projectId }),
  },
  issue: {
    project: r.one.project({ from: r.issue.projectId, to: r.project.id, optional: false }),
    state: r.one.workflowState({
      from: r.issue.stateId,
      to: r.workflowState.id,
      optional: false,
    }),
    assignee: r.one.member({ from: r.issue.assigneeMemberId, to: r.member.id }),
    creator: r.one.member({ from: r.issue.createdBy, to: r.member.id }),
    parent: r.one.issue({ from: r.issue.parentId, to: r.issue.id }),
    children: r.many.issue({ from: r.issue.id, to: r.issue.parentId }),
    gateDecisions: r.many.gateDecision({ from: r.issue.id, to: r.gateDecision.issueId }),
    documents: r.many.document({ from: r.issue.id, to: r.document.issueId }),
  },
  document: {
    issue: r.one.issue({ from: r.document.issueId, to: r.issue.id, optional: false }),
    versions: r.many.documentVersion({ from: r.document.id, to: r.documentVersion.documentId }),
  },
  documentVersion: {
    document: r.one.document({
      from: r.documentVersion.documentId,
      to: r.document.id,
      optional: false,
    }),
    author: r.one.member({ from: r.documentVersion.authorMemberId, to: r.member.id }),
  },
  gateDecision: {
    issue: r.one.issue({ from: r.gateDecision.issueId, to: r.issue.id, optional: false }),
    state: r.one.workflowState({
      from: r.gateDecision.stateId,
      to: r.workflowState.id,
      optional: false,
    }),
    decidedBy: r.one.member({ from: r.gateDecision.memberId, to: r.member.id }),
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
