import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { workspace } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A classification on an Issue, plain (`backend`) or scoped
 * (`epic:Checkout rewrite`). An Issue carries at most one Label per scope, a
 * rule the operation enforces rather than the schema (CONTEXT.md).
 */
export const label = sqliteTable(
  "label",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** Null for a plain Label. */
    scope: text("scope"),
    name: text("name").notNull(),
    color: text("color").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    uniqueIndex("label_uidx").on(table.workspaceId, table.scope, table.name),
    index("label_workspaceId_idx").on(table.workspaceId),
  ],
);

export const issueLabel = sqliteTable(
  "issue_label",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => label.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.labelId] }),
    index("issue_label_labelId_idx").on(table.labelId),
  ],
);
