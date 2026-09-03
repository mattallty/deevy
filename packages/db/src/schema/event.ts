import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { member, workspace } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * The Event log is the audit trail: every change in the Workspace is one
 * immutable row with its actor and timestamp, and Notifications, the live
 * stream, and the Issue timeline all derive from it (docs/PLAN.md).
 *
 * `seq` is the cursor the live stream and the inbox page by, so it is the
 * primary key and rises monotonically. `actorMemberId` is null for writes
 * deevy makes on its own, such as the first-admin bootstrap.
 */
export const event = sqliteTable(
  "event",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    actorMemberId: text("actor_member_id").references(() => member.id, { onDelete: "set null" }),
    /** Dotted `<subject>.<verb>`, for example `workspace.created`. */
    kind: text("kind").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    /** Set when the Event belongs to a Project, so a Project stream is one index scan. */
    projectId: text("project_id"),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    index("event_workspaceId_seq_idx").on(table.workspaceId, table.seq),
    index("event_subject_idx").on(table.subjectType, table.subjectId),
    index("event_projectId_seq_idx").on(table.projectId, table.seq),
  ],
);
