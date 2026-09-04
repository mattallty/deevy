import { event, type Db, type Event, type Member, type Workspace } from "@deevy/db";
import { deriveNotifications } from "./notifications.ts";
import { triggersFor } from "./triggers.ts";
import { deriveWebhookDeliveries } from "./webhooks.ts";

/**
 * The Event log is the audit trail (docs/PLAN.md): every write appends one
 * immutable Event in the same handler, and Notifications, the live stream, and
 * the Issue timeline read it back rather than keeping a second source.
 */

/**
 * Dotted `<subject>.<verb>`. The union grows one slice at a time; the payload
 * shape each kind carries is documented by the operation that appends it.
 */
export type EventKind =
  | "workspace.created"
  | "member.joined"
  | "member.role_changed"
  | "member.suspended"
  | "member.reinstated"
  | "allowlist.rule_added"
  | "allowlist.rule_removed"
  | "project.created"
  | "project.updated"
  | "project.archived"
  | "team.created"
  | "team.updated"
  | "team.deleted"
  | "team.member_added"
  | "team.member_removed"
  | "issue.created"
  | "issue.updated"
  | "issue.assigned"
  | "issue.reparented"
  | "issue.moved"
  | "gate.approved"
  | "gate.rejected"
  | "workflow.updated"
  | "document.created"
  | "document.updated"
  | "label.created"
  | "label.updated"
  | "label.deleted"
  | "issue.labels_changed"
  | "comment.created"
  | "comment.edited"
  | "comment.deleted"
  | "repository.created"
  | "repository.deleted"
  | "issue.link_added"
  | "issue.link_removed"
  | "workspace.updated"
  | "agent.created"
  | "agent.updated"
  | "agent.key_issued"
  | "agent.key_revoked"
  | "agent.sponsor_changed"
  | "agent.project_granted"
  | "agent.project_revoked"
  /** A Run and what the Agent does inside it (docs/plans/m2.md). */
  | "run.started"
  | "run.activity"
  | "run.awaiting_input"
  | "run.answered"
  | "run.completed"
  | "run.failed"
  /** Silence, not a decision: the sweep said so, and an Activity undoes it. */
  | "run.went_stale"
  /**
   * A URL that asked to be told, and the one thing that can go wrong with it:
   * `webhook.exhausted` is deevy admitting it could not deliver (ADR-0003).
   */
  | "webhook.subscribed"
  | "webhook.removed"
  | "webhook.exhausted"
  /** Where Notifications go: the Channels themselves, and the rules that aim them. */
  | "channel.created"
  | "channel.updated"
  | "channel.deleted"
  | "routing.updated";

export type EventPayload = Record<string, unknown>;

export interface EventInput {
  kind: EventKind;
  subjectType: string;
  subjectId: string;
  /** Set when the Event belongs to a Project, so a Project stream is one index scan. */
  projectId?: string | null;
  payload?: EventPayload;
}

/**
 * Who is appending. An operation's member context satisfies this as it stands;
 * writes deevy makes on its own pass `member: null` and the Workspace directly.
 */
export interface EventSource {
  db: Db;
  workspace: Pick<Workspace, "id">;
  member?: Pick<Member, "id"> | null;
}

/** Appends one Event and returns the stored row, including its `seq` cursor. */
export async function appendEvent(source: EventSource, input: EventInput): Promise<Event> {
  const [row] = await source.db
    .insert(event)
    .values({
      workspaceId: source.workspace.id,
      actorMemberId: source.member?.id ?? null,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      projectId: input.projectId ?? null,
      payload: input.payload ?? null,
    })
    .returning();
  if (!row) throw new Error("appendEvent: the insert returned no row");
  // Notifications derive from the Event, in the same request and right after
  // it, so nothing else has to remember to tell anyone (docs/plans/m1.md).
  await deriveNotifications(source.db, row);
  // And so do the deliveries owed to a subscribed URL, in the same tail and
  // for the same reason: the durable row is what makes a trigger reliable
  // whether or not anything is running to send it (ADR-0003).
  await deriveWebhookDeliveries(source.db, row);
  // Triggers derive from the same Event, right after it (docs/plans/m2.md).
  // They write their own rows and hand back the Events those deserve, so this
  // stays the only writer of the log. The recursion that follows is bounded:
  // a `run.*` Event triggers nothing, and an Event a trigger already acted on
  // finds the Run it created open and fires nothing a second time.
  for (const followed of await triggersFor(source.db, row)) {
    await appendEvent(source, followed);
  }
  return row;
}
