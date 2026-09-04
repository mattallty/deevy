import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { member, workspace } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A named group of Members that owns Projects and can be mentioned (CONTEXT.md).
 * Not a permission boundary: every Human sees every Project in v1.
 */
export const team = sqliteTable(
  "team",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Shares one namespace with `member.handle`, so a mention resolves to one thing. */
    handle: text("handle").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("team_workspaceId_idx").on(table.workspaceId)],
);

export const teamMember = sqliteTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.memberId] }),
    index("team_member_memberId_idx").on(table.memberId),
  ],
);

/** A stream of work with its own Issues and Workflow (CONTEXT.md). */
export const project = sqliteTable(
  "project",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Two to six uppercase letters; the prefix of every Issue key, as in `DEV-42`. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    teamId: text("team_id").references(() => team.id, { onDelete: "set null" }),
    /**
     * Handed out by `UPDATE ... RETURNING` in slice 4, so Issue numbers stay
     * gapless under concurrency without a transaction (ADR-0006).
     */
    nextIssueNumber: integer("next_issue_number").default(1).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("project_key_uidx").on(table.workspaceId, table.key),
    index("project_workspaceId_idx").on(table.workspaceId),
    index("project_teamId_idx").on(table.teamId),
  ],
);

/**
 * What "open" means to a board or a list. `backlog` is not started, `active` is
 * in flight, `done` closes the Issue (slice 4 sets `closedAt` from it).
 */
export const workflowStateCategories = ["backlog", "active", "done"] as const;

/** A step in a Project's Workflow. A Gate is one an Issue cannot leave without a Human's approval. */
export const workflowState = sqliteTable(
  "workflow_state",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    isGate: integer("is_gate", { mode: "boolean" }).default(false).notNull(),
    category: text("category", { enum: workflowStateCategories }).notNull(),
    /** The Document this State asks for, created from its template on entry. */
    documentName: text("document_name"),
    documentTemplate: text("document_template"),
    /**
     * The workflow rule: entering this State assigns the Issue to this Agent
     * and starts a Run (PLAN.md's third trigger). Null is no rule.
     */
    triggerAgentMemberId: text("trigger_agent_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("workflow_state_projectId_position_idx").on(table.projectId, table.position)],
);
