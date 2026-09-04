import {
  event as eventTable,
  issue as issueTable,
  project as projectTable,
  run as runTable,
  type Db,
} from "@deevy/db";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { EventKind } from "./events.ts";

/**
 * Background work, expressed the only way ADR-0006 allows: a bounded function
 * of its arguments that any scheduler can call. No timer lives here — the
 * `Cron` port in jobs.ts brings one — and no scan is unbounded, because M3
 * drives these from a Cloudflare Cron Trigger with a 10 ms CPU budget.
 *
 * The shape every sweep keeps: one indexed SELECT with a LIMIT, one batched
 * UPDATE, and one Event insert per chunk. Never a query per row.
 */

/** Thirty minutes of silence, the window PLAN.md and Linear both settled on. */
export const defaultSilenceMs = 30 * 60_000;

/** How many Runs one pass may move. `more` tells the caller to go again. */
export const defaultSweepLimit = 50;

/**
 * D1 accepts 100 bound parameters per statement and each Event row binds five,
 * so the Events go in chunks of twenty rather than one statement of `limit`
 * rows. The number of statements stays a function of the limit, never of the
 * Workspace. Adding a column to these rows means lowering this number.
 */
const eventRowsPerInsert = 20;

/**
 * Where deevy is waiting on the Agent and silence means something is wrong.
 * `awaiting_input` is missing on purpose: that Run is waiting on a Human, and
 * `statusAfterAnswer` in runs.ts only un-blocks a Run that is still
 * `awaiting_input`, so sweeping one would strand the answer.
 */
const sweepableStatuses = ["pending", "active"] as const;

export interface DueRunsQueryOptions {
  workspaceId: string;
  /** Runs quiet since before this are due. */
  cutoff: Date;
  limit: number;
}

/**
 * The sweep's one scan, and the reason it fits a Cron Trigger's CPU budget:
 * `run_status_lastActivityAt_idx` answers it, and the two joins are
 * primary-key lookups that scope it to this Workspace and carry the Project
 * each Event belongs to, so nothing has to be looked up per row afterwards.
 *
 * There is deliberately no ORDER BY. Sorting makes SQLite visit every due Run
 * before applying the LIMIT (`USE TEMP B-TREE FOR ORDER BY`), which would make
 * one pass cost the whole backlog — the one thing the limit exists to prevent.
 * The index still hands back the longest silences first within each status,
 * and `more` brings the caller back for the rest.
 *
 * Exported so a test can EXPLAIN it: the query plan is the guarantee.
 */
export function dueRunsQuery(db: Db, { workspaceId, cutoff, limit }: DueRunsQueryOptions) {
  return db
    .select({ id: runTable.id, projectId: issueTable.projectId })
    .from(runTable)
    .innerJoin(issueTable, eq(issueTable.id, runTable.issueId))
    .innerJoin(projectTable, eq(projectTable.id, issueTable.projectId))
    .where(
      and(
        inArray(runTable.status, [...sweepableStatuses]),
        lt(runTable.lastActivityAt, cutoff),
        eq(projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(limit);
}

export interface SweepStaleRunsOptions {
  db: Db;
  workspaceId: string;
  /** The clock, so a test does not have to wait thirty minutes. */
  now?: Date;
  /** Silence after which a Run is presumed stale. */
  silenceMs?: number;
  /** Most Runs to move in one pass. */
  limit?: number;
}

export interface SweepResult {
  /** Due Runs this pass found. */
  scanned: number;
  /** Runs it actually moved; fewer when something else moved one first. */
  changed: number;
  /** The limit was reached, so call again rather than raising the limit. */
  more: boolean;
}

/**
 * Moves Runs that have gone quiet to `stale` and records why. `stale` is
 * recoverable, never terminal (docs/plans/m2.md): the next Activity puts the
 * Run back to `active`, which is why nothing here is finished or cleaned up.
 */
export async function sweepStaleRuns({
  db,
  workspaceId,
  now = new Date(),
  silenceMs = defaultSilenceMs,
  limit = defaultSweepLimit,
}: SweepStaleRunsOptions): Promise<SweepResult> {
  const cutoff = new Date(now.getTime() - silenceMs);
  const due = await dueRunsQuery(db, { workspaceId, cutoff, limit });

  const result = { scanned: due.length, changed: 0, more: due.length >= limit };
  if (due.length === 0) return result;

  // One statement, and it re-checks the status it read: D1 has no interactive
  // transactions (ADR-0006), so a Run the Agent revived between the SELECT and
  // here must not be dragged back. RETURNING says which ones really moved, and
  // only those get an Event.
  const moved = await db
    .update(runTable)
    .set({ status: "stale" })
    .where(
      and(
        inArray(
          runTable.id,
          due.map((row) => row.id),
        ),
        inArray(runTable.status, [...sweepableStatuses]),
      ),
    )
    .returning({ id: runTable.id });

  result.changed = moved.length;
  if (moved.length === 0) return result;

  // lastActivityAt is left alone: it is the record of when the Agent last
  // spoke, and the sweep is not the Agent speaking.
  //
  // These Events are written directly rather than through `appendEvent`. The
  // sweep is the one writer that is not a request; `run.went_stale` derives no
  // Notification, because a Human hears about silence from the Run's own
  // status; and one `appendEvent` per row would make the sweep's cost grow
  // with the Workspace, which is the one thing it must not do.
  const projectOf = new Map(due.map((row) => [row.id, row.projectId]));
  const rows = moved.map(({ id }) => ({
    workspaceId,
    kind: "run.went_stale" satisfies EventKind,
    subjectType: "run",
    subjectId: id,
    projectId: projectOf.get(id) ?? null,
  }));
  for (let at = 0; at < rows.length; at += eventRowsPerInsert) {
    await db.insert(eventTable).values(rows.slice(at, at + eventRowsPerInsert));
  }

  return result;
}
