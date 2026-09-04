import type { Activity, Db, Run } from "@deevy/db";
import { run as runTable } from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

export type RunStatus = Run["status"];
export type ActivityKind = Activity["kind"];

/**
 * A Run is open while the Agent may still act on it. `stale` counts: a silent
 * Agent that speaks again carries on where it left off, which is what
 * "recoverable, never terminal" means (docs/plans/m2.md).
 */
export const openStatuses = ["pending", "active", "awaiting_input", "stale"] as const;

export function isOpen(status: RunStatus): boolean {
  return (openStatuses as readonly string[]).includes(status);
}

/**
 * Where an Activity of each kind leaves the Run. An elicitation is the Agent
 * asking a Human something, so the Run waits; everything else is work, so it
 * runs. Posting to a finished Run is refused rather than silently reopening it.
 */
export function statusAfterActivity(current: RunStatus, kind: ActivityKind): RunStatus {
  if (!isOpen(current)) {
    throw new ORPCError("BAD_REQUEST", {
      message: `This Run is ${current}; start another to carry on`,
    });
  }
  return kind === "elicitation" ? "awaiting_input" : "active";
}

/** A Human's answer un-blocks a waiting Run, and nothing else. */
export function statusAfterAnswer(current: RunStatus): RunStatus {
  if (current !== "awaiting_input") {
    throw new ORPCError("BAD_REQUEST", { message: "This Run is not waiting for an answer" });
  }
  return "active";
}

/** Only an open Run can finish, and it finishes exactly once. */
export function assertFinishable(current: RunStatus): void {
  if (!isOpen(current)) {
    throw new ORPCError("BAD_REQUEST", { message: `This Run already ${current}` });
  }
}

export const RunSchema = z.object({
  id: z.string(),
  issueKey: z.string(),
  agentMemberId: z.string(),
  triggeredByMemberId: z.string().nullable(),
  trigger: z.enum(["assignment", "mention", "state_rule", "schedule", "manual"]),
  status: z.enum(["pending", "active", "awaiting_input", "completed", "failed", "stale"]),
  summary: z.string().nullable(),
  startedAt: z.date().nullable(),
  lastActivityAt: z.date(),
  finishedAt: z.date().nullable(),
  createdAt: z.date(),
});

export const ActivitySchema = z.object({
  id: z.string(),
  runId: z.string(),
  kind: z.enum(["thought", "action", "elicitation", "response", "error"]),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
});

export const RunDetailSchema = RunSchema.extend({ activities: z.array(ActivitySchema) });

/** Moves a Run and stamps the clocks that go with the move. */
export async function setRunStatus(
  db: Db,
  current: Run,
  status: RunStatus,
  extra: { summary?: string | null; touchActivity?: boolean } = {},
): Promise<void> {
  const now = new Date();
  await db
    .update(runTable)
    .set({
      status,
      // The first Activity is what starts a Run working, so that is when the
      // clock starts, not when the trigger created it.
      startedAt: current.startedAt ?? (status === "active" ? now : null),
      ...(extra.touchActivity ? { lastActivityAt: now } : {}),
      ...(extra.summary === undefined ? {} : { summary: extra.summary }),
      finishedAt: status === "completed" || status === "failed" ? now : null,
    })
    .where(eq(runTable.id, current.id));
}
