import {
  allowlistRule,
  comment,
  document,
  documentVersion,
  event,
  gateDecision,
  invitation,
  issue,
  issueLink,
  label,
  notification,
  repository,
  member,
  project,
  team,
  user,
  workflowState,
  workspace,
} from "@deevy/db";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";

export const WorkspaceSchema = createSelectSchema(workspace);
export const MemberSchema = createSelectSchema(member);
export const UserSchema = createSelectSchema(user).pick({
  id: true,
  name: true,
  email: true,
  image: true,
  kind: true,
});
export const EventSchema = createSelectSchema(event);

/** A Member as the SPA shows one: the row plus the Human or Agent behind it. */
export const MemberWithUserSchema = MemberSchema.extend({ user: UserSchema });

export const AllowlistRuleSchema = createSelectSchema(allowlistRule);

/**
 * An invitation as any surface may show one: everything but the token hash.
 * The token exists in one HTTP response, `invitations.create`'s, and nothing
 * reads it back (docs/plans/sign-in.md).
 */
export const InvitationSchema = createSelectSchema(invitation).omit({ tokenHash: true });

export const TeamSchema = createSelectSchema(team);
export const ProjectSchema = createSelectSchema(project);
export const WorkflowStateSchema = createSelectSchema(workflowState);

/** A Project as every surface shows one: the row plus its Workflow, in order. */
export const ProjectWithStatesSchema = ProjectSchema.extend({
  states: z.array(WorkflowStateSchema),
  team: TeamSchema.nullable(),
});

export const TeamWithMembersSchema = TeamSchema.extend({
  members: z.array(MemberWithUserSchema),
});

export const IssueSchema = createSelectSchema(issue);

export const LabelSchema = createSelectSchema(label);

/** An Issue as a list shows one: the row plus its derived key, State and Labels. */
export const IssueSummarySchema = IssueSchema.extend({
  key: z.string(),
  state: WorkflowStateSchema,
  assignee: MemberWithUserSchema.nullable(),
  labels: z.array(LabelSchema),
});

export const GateDecisionSchema = createSelectSchema(gateDecision);

/** An Issue as its own page shows one: the summary plus its family and its Gate history. */
export const IssueDetailSchema = IssueSummarySchema.extend({
  project: ProjectSchema,
  parent: IssueSummarySchema.nullable(),
  children: z.array(IssueSummarySchema),
  gateDecisions: z.array(GateDecisionSchema),
});

export const DocumentSchema = createSelectSchema(document);
export const DocumentVersionSchema = createSelectSchema(documentVersion);

/** A Document read at one version: the row plus that version's body. */
export const DocumentAtVersionSchema = DocumentSchema.extend({
  version: z.number().int(),
  body: z.string(),
  authorMemberId: z.string().nullable(),
});

export const CommentSchema = createSelectSchema(comment);

/** A comment as the thread shows one: the row plus who wrote it. */
export const CommentWithAuthorSchema = CommentSchema.extend({
  author: MemberWithUserSchema.nullable(),
});

export const RepositorySchema = createSelectSchema(repository);
export const IssueLinkSchema = createSelectSchema(issueLink);

/** A Link as the Issue page shows one: the row plus the Repository it belongs to. */
export const IssueLinkWithRepositorySchema = IssueLinkSchema.extend({
  repository: RepositorySchema.nullable(),
});

export const NotificationSchema = createSelectSchema(notification);

/** A Notification as the inbox shows one: the row plus the Issue it is about. */
export const NotificationWithIssueSchema = NotificationSchema.extend({
  issue: IssueSummarySchema.nullable(),
  event: EventSchema,
});
