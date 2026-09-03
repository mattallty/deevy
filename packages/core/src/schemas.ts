import {
  allowlistRule,
  event,
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
