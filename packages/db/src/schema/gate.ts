import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { issue } from "./issue.ts";
import { workflowState } from "./project.ts";
import { member } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const gateDecisions = ["approved", "rejected"] as const;

/**
 * A Human's ruling on a Gate: the State an Issue could not leave without it
 * (CONTEXT.md). Kept as its own row rather than only as an Event, so the Issue
 * page can show the decision history and its notes without replaying the log.
 */
export const gateDecision = sqliteTable(
  "gate_decision",
  {
    id: text("id").primaryKey(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issue.id, { onDelete: "cascade" }),
    stateId: text("state_id")
      .notNull()
      .references(() => workflowState.id, { onDelete: "cascade" }),
    decision: text("decision", { enum: gateDecisions }).notNull(),
    note: text("note"),
    memberId: text("member_id").references(() => member.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [index("gate_decision_issueId_idx").on(table.issueId, table.createdAt)],
);
