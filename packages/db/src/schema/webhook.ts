import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { project } from "./project.ts";
import { member, workspace } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * A URL that wants to be told. An Agent registers one so deevy can deliver its
 * triggers; anything else is a generic subscriber. An Agent without one polls
 * its inbox over MCP instead, which is the fallback ADR-0003 requires.
 */
export const webhookSubscription = sqliteTable(
  "webhook_subscription",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    /** The Agent this belongs to, when it is an Agent's. Null is a generic subscriber. */
    memberId: text("member_id").references(() => member.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Signs the body, so a receiver can tell deevy's POST from anyone else's. */
    secret: text("secret").notNull(),
    /** Event kinds this wants, as JSON. Null is all of them. */
    kinds: text("kinds", { mode: "json" }).$type<string[]>(),
    projectId: text("project_id").references(() => project.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => member.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
    disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    /** Read on every appendEvent to derive deliveries, so it is one index scan. */
    index("webhook_subscription_workspace_idx").on(table.workspaceId, table.disabledAt),
    index("webhook_subscription_memberId_idx").on(table.memberId),
  ],
);
