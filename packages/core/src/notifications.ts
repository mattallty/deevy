import {
  issue as issueTable,
  notification as notificationTable,
  member as memberTable,
  workflowState,
  type Db,
  type Event,
  type Notification,
} from "@deevy/db";
import { and, eq, isNull, ne } from "drizzle-orm";

/**
 * Notifications derive from the Event log rather than being written a second
 * time (docs/PLAN.md): this runs in the same request, right after the Event is
 * appended, and reads only that Event. Nothing here decides what happened.
 *
 * One row per recipient per Event. The actor is never told about their own
 * action, and a suspended Member is told nothing at all.
 */
export async function deriveNotifications(db: Db, event: Event): Promise<void> {
  const recipients = await recipientsFor(db, event);
  if (recipients.length === 0) return;

  await db.insert(notificationTable).values(
    recipients.map(({ memberId, kind }) => ({
      id: crypto.randomUUID(),
      recipientMemberId: memberId,
      kind,
      eventId: event.seq,
      issueId: issueOf(event),
    })),
  );
}

type Recipient = { memberId: string; kind: Notification["kind"] };

/**
 * The Issue a Notification points at. A Run is not an Issue, but it happens on
 * one, and its Events carry that Issue so the inbox needs no second query.
 */
function issueOf(event: Event): string | null {
  if (event.subjectType === "issue") return event.subjectId;
  if (!event.kind.startsWith("run.")) return null;
  const carried = (event.payload as { issueId?: unknown } | null)?.issueId;
  return typeof carried === "string" ? carried : null;
}

/** What a Run Event tells a Human, or nothing when the Event is not one. */
const runNotificationKinds: Partial<Record<Event["kind"], Notification["kind"]>> = {
  "run.awaiting_input": "run_awaiting_input",
  "run.completed": "run_finished",
  "run.failed": "run_finished",
};

async function recipientsFor(db: Db, event: Event): Promise<Recipient[]> {
  const payload = (event.payload ?? {}) as {
    to?: unknown;
    mentionedMemberIds?: unknown;
  };

  if (event.kind === "issue.assigned") {
    const assignee = typeof payload.to === "string" ? payload.to : null;
    if (!assignee || assignee === event.actorMemberId) return [];
    return (await active(db, [assignee], event)).map((memberId) => ({
      memberId,
      kind: "assignment" as const,
    }));
  }

  if (event.kind === "comment.created" || event.kind === "issue.updated") {
    const mentioned = Array.isArray(payload.mentionedMemberIds)
      ? payload.mentionedMemberIds.filter((id): id is string => typeof id === "string")
      : [];
    const others = mentioned.filter((id) => id !== event.actorMemberId);
    return (await active(db, others, event)).map((memberId) => ({
      memberId,
      kind: "mention" as const,
    }));
  }

  // A Gate is a State an Issue cannot leave without a Human, so arriving in one
  // is everyone's business until somebody decides. That includes arriving by
  // approval: approving Intent lands the Issue in the Spec Gate, which needs a
  // Human just as much as the one before it.
  if (
    event.kind === "issue.created" ||
    event.kind === "issue.moved" ||
    event.kind === "gate.approved" ||
    event.kind === "gate.rejected"
  ) {
    if (event.subjectType !== "issue") return [];
    if (!(await isInGate(db, event.subjectId))) return [];
    const humans = await db
      .select({ id: memberTable.id })
      .from(memberTable)
      .where(
        and(
          eq(memberTable.workspaceId, event.workspaceId),
          eq(memberTable.kind, "human"),
          isNull(memberTable.suspendedAt),
          event.actorMemberId ? ne(memberTable.id, event.actorMemberId) : undefined,
        ),
      );
    return humans.map((human) => ({ memberId: human.id, kind: "gate_awaiting" as const }));
  }

  // A Run belongs to the Human behind it: the Member that triggered it, or the
  // Sponsor accountable for the Agent when an Agent triggered its own work
  // (docs/plans/m2.md). One Human, so a finished Run is told once.
  const runKind = runNotificationKinds[event.kind];
  if (runKind) {
    if (event.subjectType !== "run") return [];
    const found = await db.query.run.findFirst({
      where: { id: event.subjectId },
      columns: { agentMemberId: true, triggeredByMemberId: true },
    });
    if (!found) return [];
    const human = await humanBehind(db, found.triggeredByMemberId ?? found.agentMemberId);
    if (!human || human === event.actorMemberId) return [];
    return (await active(db, [human], event)).map((memberId) => ({ memberId, kind: runKind }));
  }

  return [];
}

/**
 * The Human accountable for a Member: itself when it is a Human, its Sponsor
 * when it is an Agent (CONTEXT.md). An Agent with no Sponsor tells nobody.
 */
async function humanBehind(db: Db, memberId: string | null): Promise<string | null> {
  if (!memberId) return null;
  const found = await db.query.member.findFirst({
    where: { id: memberId },
    columns: { kind: true, sponsorId: true },
  });
  if (!found) return null;
  return found.kind === "human" ? memberId : found.sponsorId;
}

async function isInGate(db: Db, issueId: string): Promise<boolean> {
  const [row] = await db
    .select({ isGate: workflowState.isGate })
    .from(issueTable)
    .innerJoin(workflowState, eq(issueTable.stateId, workflowState.id))
    .where(eq(issueTable.id, issueId))
    .limit(1);
  return row?.isGate === true;
}

/** Of the given Members, those still able to act. Suspension silences an inbox. */
async function active(db: Db, memberIds: string[], event: Event): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const rows = await db.query.member.findMany({
    where: {
      id: { in: memberIds },
      workspaceId: event.workspaceId,
      suspendedAt: { isNull: true },
    },
    columns: { id: true },
  });
  return rows.map((row) => row.id);
}
