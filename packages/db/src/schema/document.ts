import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { member } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A named, versioned markdown text on an Issue, such as its intent, spec or
 * plan (CONTEXT.md). The template comes from the State that asks for it.
 */
export const document = sqliteTable(
  "document",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    /** `intent`, `spec`, `plan`: the name the Workflow State asked for. */
    name: text("name").notNull(),
    currentVersion: integer("current_version").default(1).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [uniqueIndex("document_name_uidx").on(table.issueId, table.name)],
);

/** Writes are append-only: a new version, never an overwrite. */
export const documentVersion = sqliteTable(
  "document_version",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    authorMemberId: text("author_member_id").references(() => member.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    uniqueIndex("document_version_uidx").on(table.documentId, table.version),
    index("document_version_documentId_idx").on(table.documentId),
  ],
);
