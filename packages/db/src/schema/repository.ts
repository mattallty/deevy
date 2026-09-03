import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { member, workspace } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const repositoryProviders = ["github", "gitlab", "other"] as const;

/** An external code location that Issues refer to (CONTEXT.md). */
export const repository = sqliteTable(
  "repository",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: repositoryProviders }).notNull(),
    /** `owner/repo`. */
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    uniqueIndex("repository_url_uidx").on(table.workspaceId, table.url),
    index("repository_workspaceId_idx").on(table.workspaceId),
  ],
);

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
    repositoryId: text("repository_id").references(() => repository.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("issue_link_issueId_idx").on(table.issueId, table.createdAt)],
);
