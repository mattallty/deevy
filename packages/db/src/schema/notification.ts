import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { event } from "./event.ts";
import { issue } from "./issue.ts";
import { member } from "./workspace.ts";

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const notificationKinds = [
  "mention",
  "assignment",
  "gate_awaiting",
  /** An Agent asked its Run's Human a question, and the Run waits (docs/plans/m2.md). */
  "run_awaiting_input",
  /** A Run ended, completed or failed. */
  "run_finished",
] as const;

/**
 * A message to a Human derived from Events (CONTEXT.md): a mention, an
 * assignment, a Gate awaiting them. Derived rather than stored twice, so the
 * Event log stays the only source of what happened; this table is the index
 * that makes "what needs me" one query.
 */
export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey(),
    recipientMemberId: text("recipient_member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: notificationKinds }).notNull(),
    /** The Event's seq, so a Notification can always be traced back to it. */
    eventId: integer("event_id")
      .notNull()
      .references(() => event.seq, { onDelete: "cascade" }),
    issueId: text("issue_id").references(() => issue.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).default(now).notNull(),
  },
  (table) => [
    index("notification_recipient_idx").on(table.recipientMemberId, table.readAt),
    index("notification_eventId_idx").on(table.eventId),
    /**
     * One inbox row per Member per kind per Event, enforced here rather than
     * respected by the one caller (docs/plans/m3.md). The kind is part of the
     * key because one Event can owe the same Human two different things.
     */
    uniqueIndex("notification_event_uidx").on(table.recipientMemberId, table.kind, table.eventId),
  ],
);
