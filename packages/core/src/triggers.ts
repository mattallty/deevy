import { issue as issueTable, run as runTable, type Db, type Event, type Run } from "@deevy/db";
import { eq } from "drizzle-orm";
import type { EventInput } from "./events.ts";
import { openRunFor } from "./runs.ts";
import { newId } from "./ids.ts";

/**
 * The four triggers (docs/PLAN.md) read the Event log rather than being spread
 * through the handlers that write it: this runs in `appendEvent`'s tail beside
 * `deriveNotifications`, in the same request and right after the Event, and
 * reads only that Event. Nothing here decides what happened.
 *
 * It returns the Events its own writes deserve rather than appending them, so
 * `appendEvent` stays the only writer of the log and this module never imports
 * it back. Those Events go through the tail again, which is safe because every
 * path is guarded by the "at most one open Run per (issue, agent)" rule, and
 * `run.*` triggers nothing at all.
 */
export async function triggersFor(db: Db, event: Event): Promise<EventInput[]> {
  // A Run is not a reason to start a Run. This is the first line of the
  // recursion guard; the open-Run rule below is the second.
  if (event.kind.startsWith("run.")) return [];
  if (event.subjectType !== "issue") return [];

  if (event.kind === "issue.assigned") {
    const payload = (event.payload ?? {}) as { to?: unknown };
    const assignee = typeof payload.to === "string" ? payload.to : null;
    return startRuns(db, event, assignee ? [assignee] : [], "assignment");
  }

  if (event.kind === "comment.created") {
    const payload = (event.payload ?? {}) as { mentionedMemberIds?: unknown };
    const mentioned = Array.isArray(payload.mentionedMemberIds)
      ? payload.mentionedMemberIds.filter((id): id is string => typeof id === "string")
      : [];
    return startRuns(db, event, mentioned, "mention");
  }

  // Where the Issue ended up, not how it got there: a State's rule fires on
  // every arrival, including arriving by a Human's decision on a Gate. This is
  // the same set of kinds `gate_awaiting` watches in notifications.ts, for the
  // same reason.
  if (
    event.kind === "issue.created" ||
    event.kind === "issue.moved" ||
    event.kind === "gate.approved" ||
    event.kind === "gate.rejected"
  ) {
    return stateRule(db, event);
  }

  return [];
}

/**
 * Entering a State that names an Agent makes that Agent the Assignee and starts
 * a Run (PLAN.md's third trigger). The assignment is announced after the Run
 * exists, never before: the `issue.assigned` Event goes through this same tail,
 * and finding the Run already open is what stops it starting a second one.
 */
async function stateRule(db: Db, event: Event): Promise<EventInput[]> {
  const found = await db.query.issue.findFirst({
    where: { id: event.subjectId },
    columns: { id: true, assigneeMemberId: true },
    with: { state: { columns: { triggerAgentMemberId: true } } },
  });
  const named = found?.state.triggerAgentMemberId;
  if (!found || !named) return [];
  const [agentMemberId] = await workingAgents(db, [named], event.workspaceId);
  if (!agentMemberId) return [];

  const events = await startRuns(db, event, [agentMemberId], "state_rule");
  if (found.assigneeMemberId === agentMemberId) return events;

  await db
    .update(issueTable)
    .set({ assigneeMemberId: agentMemberId, updatedAt: new Date() })
    .where(eq(issueTable.id, found.id));
  const agent = await db.query.member.findFirst({
    where: { id: agentMemberId },
    with: { user: true },
  });
  events.push({
    kind: "issue.assigned",
    subjectType: "issue",
    subjectId: found.id,
    projectId: event.projectId,
    payload: {
      from: found.assigneeMemberId,
      to: agentMemberId,
      toName: agent?.user.name ?? null,
      byStateRule: true,
    },
  });
  return events;
}

/**
 * Starts one Run per Agent among the candidates and hands back the Events they
 * deserve. Candidates are whoever the rule named; which of them is an Agent
 * that can still work is this function's business, in one query rather than
 * one per name.
 */
async function startRuns(
  db: Db,
  event: Event,
  candidates: string[],
  trigger: Run["trigger"],
): Promise<EventInput[]> {
  const events: EventInput[] = [];
  for (const agentMemberId of await workingAgents(db, candidates, event.workspaceId)) {
    const started = await startRun(db, {
      issueId: event.subjectId,
      agentMemberId,
      triggeredByMemberId: event.actorMemberId,
      trigger,
    });
    if (started) events.push(runStartedEvent(started, event.projectId));
  }
  return events;
}

/**
 * Of the Members named, those a Run is work for: a Human is not triggered, and
 * a suspended Member does nothing (docs/PLAN.md's Sponsor cascade). One query,
 * because a mention can name a whole Team.
 */
async function workingAgents(db: Db, memberIds: string[], workspaceId: string): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const rows = await db.query.member.findMany({
    where: {
      id: { in: memberIds },
      workspaceId,
      kind: "agent",
      suspendedAt: { isNull: true },
    },
    columns: { id: true },
  });
  return rows.map((row) => row.id);
}

interface StartRunInput {
  issueId: string;
  agentMemberId: string;
  /** The Member whose action triggered it; null when deevy's own clock did. */
  triggeredByMemberId: string | null;
  trigger: Run["trigger"];
}

/**
 * Creates the Run unless the Agent already has an open one on the Issue. That
 * rule is slice 2's, enforced in one place (runs.ts): two attempts claiming one
 * outcome is the thing no trigger may cause.
 */
async function startRun(db: Db, input: StartRunInput): Promise<Run | null> {
  if (await openRunFor(db, input.issueId, input.agentMemberId)) return null;
  const id = newId("run");
  await db.insert(runTable).values({
    id,
    issueId: input.issueId,
    agentMemberId: input.agentMemberId,
    triggeredByMemberId: input.triggeredByMemberId,
    trigger: input.trigger,
  });
  return (await db.query.run.findFirst({ where: { id } })) as Run;
}

/** The Event a triggered Run announces itself with, in `runs.start`'s shape. */
function runStartedEvent(run: Run, projectId: string | null): EventInput {
  return {
    kind: "run.started",
    subjectType: "run",
    subjectId: run.id,
    projectId,
    payload: {
      issueId: run.issueId,
      trigger: run.trigger,
      agentMemberId: run.agentMemberId,
    },
  };
}
