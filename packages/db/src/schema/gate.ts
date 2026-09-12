import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { document } from "./document.ts";
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

/**
 * What the Documents said when a Gate was ruled on. A ruling is about text, and
 * the text keeps moving: an Agent may write the spec again the minute after it
 * was approved. Pinning the version every Document stood at makes "this was
 * approved" a statement about something that cannot change afterwards, and lets
 * a screen say when what is on it is no longer what somebody agreed to.
 */
export const gateDecisionDocument = sqliteTable(
  "gate_decision_document",
  {
    decisionId: text("decision_id")
      .notNull()
      .references(() => gateDecision.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    /** Kept beside the id so a decision still reads after a Document is gone. */
    name: text("name").notNull(),
    version: integer("version").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.decisionId, table.documentId] }),
    index("gate_decision_document_documentId_idx").on(table.documentId, table.version),
  ],
);

/**
 * The Humans a Gate names. Empty means any Human may decide it, which is what
 * M1 shipped; naming approvers narrows both who may approve and who is asked
 * (docs/plans/m1.md deferred this to M2, "where Runs make them matter").
 */
export const gateApprover = sqliteTable(
  "gate_approver",
  {
    stateId: text("state_id")
      .notNull()
      .references(() => workflowState.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.stateId, table.memberId] }),
    index("gate_approver_memberId_idx").on(table.memberId),
  ],
);
