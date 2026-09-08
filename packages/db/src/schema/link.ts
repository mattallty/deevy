import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { run } from "./run.ts";
import { member } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const issueLinkKinds = ["pull_request", "commit", "branch", "url"] as const;

/** A typed pointer from an Issue at the code, or at anything else with a URL. */
export const issueLink = sqliteTable(
  "issue_link",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: issueLinkKinds }).notNull(),
    url: text("url").notNull(),
    title: text("title"),
    /** The pull request number, the commit SHA, or the branch name. */
    ref: text("ref"),
    /** The Run that attached it, so evidence an Agent found is attributed to its attempt. */
    runId: text("run_id").references(() => run.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("issue_link_issueId_idx").on(table.issueId, table.createdAt)],
);
