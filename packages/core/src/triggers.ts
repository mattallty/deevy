import { run as runTable, type Db, type Event, type Run } from "@deevy/db";
import type { EventInput } from "./events.ts";
import { openRunFor } from "./runs.ts";

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

  if (event.kind === "issue.assigned" && event.subjectType === "issue") {
    const payload = (event.payload ?? {}) as { to?: unknown };
    const assignee = typeof payload.to === "string" ? payload.to : null;
    if (!assignee || !(await isWorkingAgent(db, assignee, event.workspaceId))) return [];
    const started = await startRun(db, {
      issueId: event.subjectId,
      agentMemberId: assignee,
      triggeredByMemberId: event.actorMemberId,
      trigger: "assignment",
    });
    return started ? [runStartedEvent(started, event.projectId)] : [];
  }

  return [];
}

/**
 * A Run is work for an Agent that can still do it: a Human is not triggered,
 * and a suspended Member does nothing (docs/PLAN.md's Sponsor cascade).
 */
async function isWorkingAgent(db: Db, memberId: string, workspaceId: string): Promise<boolean> {
  const found = await db.query.member.findFirst({
    where: { id: memberId, workspaceId, kind: "agent", suspendedAt: { isNull: true } },
    columns: { id: true },
  });
  return Boolean(found);
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
  const id = crypto.randomUUID();
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
