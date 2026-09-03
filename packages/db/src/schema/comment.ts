import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { member } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Discussion on an Issue. Deleting is soft: the row stays so the thread keeps
 * its shape and the Event log stays honest about what was said and withdrawn.
 */
export const comment = sqliteTable(
  "comment",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    authorMemberId: text("author_member_id").references(() => member.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("comment_issueId_idx").on(table.issueId, table.createdAt)],
);
