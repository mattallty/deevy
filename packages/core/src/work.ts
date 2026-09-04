import {
  agent as agentTable,
  channel as channelTable,
  delivery as deliveryTable,
  event as eventTable,
  issue as issueTable,
  member as memberTable,
  project as projectTable,
  run as runTable,
  type Db,
  type Event,
} from "@deevy/db";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { EventKind } from "./events.ts";
import { issueOf, notificationKindOf } from "./notifications.ts";
import { openStatuses } from "./runs.ts";
import { postSlackMessage, slackMessage, type FetchLike, type SlackPayload } from "./slack.ts";

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

/** The same arithmetic for a Run row, which also binds five columns. */
const runRowsPerInsert = 20;

/**
 * And for a `run.started` Event, which carries a payload as well and so binds
 * six columns rather than five.
 */
const runStartedRowsPerInsert = 16;

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

export interface DueAgentsQueryOptions {
  workspaceId: string;
  /** The clock this pass reads. */
  now: Date;
  limit: number;
}

/**
 * The Agents whose schedule has come round: never run, or last run longer ago
 * than their own interval. A suspended Agent is not due, which is the Sponsor
 * cascade doing its job (docs/plans/m2.md).
 *
 * Exported so a test can EXPLAIN it. There is one `agent` row per Agent and a
 * Workspace has a handful, so this is bounded by the Workspace's Agents and by
 * the LIMIT, never by its Issues.
 */
export function dueAgentsQuery(db: Db, { workspaceId, now, limit }: DueAgentsQueryOptions) {
  return db
    .select({ memberId: agentTable.memberId })
    .from(agentTable)
    .innerJoin(memberTable, eq(memberTable.id, agentTable.memberId))
    .where(
      and(
        isNotNull(agentTable.scheduleMinutes),
        eq(memberTable.workspaceId, workspaceId),
        isNull(memberTable.suspendedAt),
        or(
          isNull(agentTable.scheduleRanAt),
          // Minutes, in the millisecond column the row already holds, so the
          // comparison is arithmetic SQLite does rather than a row per Agent
          // read back into JavaScript.
          sql`${agentTable.scheduleRanAt} <= ${now.getTime()} - ${agentTable.scheduleMinutes} * 60000`,
        ),
      ),
    )
    .limit(limit);
}

export interface ScheduledIssuesQueryOptions {
  agentMemberIds: string[];
  limit: number;
}

/**
 * The Issues a due Agent owes a Run: assigned to it, still open, and with no
 * open Run of its own. The "at most one open Run per (issue, agent)" rule is
 * the anti-join rather than a lookup per Issue, which is what keeps this one
 * statement (runs.ts holds the same rule for every other path).
 *
 * A closed Issue is left alone. A schedule is for work still to do, and an
 * Issue that reached a `done` State has none; the plan does not say, and this
 * is the reading that does not wake an Agent hourly for the rest of time.
 *
 * Exported so a test can EXPLAIN it: `issue_assignee_idx` answers the scan and
 * `run_agent_status_idx` answers the anti-join.
 */
export function scheduledIssuesQuery(
  db: Db,
  { agentMemberIds, limit }: ScheduledIssuesQueryOptions,
) {
  return db
    .select({
      id: issueTable.id,
      projectId: issueTable.projectId,
      agentMemberId: issueTable.assigneeMemberId,
    })
    .from(issueTable)
    .leftJoin(
      runTable,
      and(
        eq(runTable.issueId, issueTable.id),
        eq(runTable.agentMemberId, issueTable.assigneeMemberId),
        inArray(runTable.status, [...openStatuses]),
      ),
    )
    .where(
      and(
        inArray(issueTable.assigneeMemberId, agentMemberIds),
        isNull(issueTable.closedAt),
        isNull(runTable.id),
      ),
    )
    .limit(limit);
}

export interface SweepSchedulesOptions {
  db: Db;
  workspaceId: string;
  /** The clock, so a test does not have to wait an hour. */
  now?: Date;
  /** Most Agents to consider, and most Runs to start, in one pass. */
  limit?: number;
}

export interface ScheduleSweepResult {
  /** Agents whose schedule came round this pass. */
  due: number;
  /** Runs it started. */
  started: number;
  /** The limit was reached, so call again rather than raising the limit. */
  more: boolean;
}

/**
 * The schedule trigger (PLAN.md): each Agent whose interval has elapsed gets
 * one Run per Issue assigned to it that has no open Run.
 *
 * Bounded exactly like `sweepStaleRuns`, and for the same reason: two indexed
 * SELECTs with a LIMIT, then batched INSERTs and one UPDATE. Nothing here is a
 * query per row, so a pass costs the limit rather than the Workspace and fits
 * inside a Cloudflare Cron Trigger's CPU budget (M3).
 */
export async function sweepSchedules({
  db,
  workspaceId,
  now = new Date(),
  limit = defaultSweepLimit,
}: SweepSchedulesOptions): Promise<ScheduleSweepResult> {
  const due = await dueAgentsQuery(db, { workspaceId, now, limit });
  const result = { due: due.length, started: 0, more: due.length >= limit };
  if (due.length === 0) return result;

  const owed = await scheduledIssuesQuery(db, {
    agentMemberIds: due.map((row) => row.memberId),
    limit,
  });
  // Hitting the Issue limit means this pass did not finish the backlog, so the
  // Agents stay due and the next pass carries on: the Runs just started are
  // open, so the anti-join above excludes them and every pass makes progress.
  const drained = owed.length < limit;
  result.more = result.more || !drained;

  const runs = owed.map((row) => ({
    id: crypto.randomUUID(),
    issueId: row.id,
    agentMemberId: row.agentMemberId as string,
    // Nobody asked for it. The clock is not a Member, and a Run with no
    // trigger of its own belongs to the Agent's Sponsor (notifications.ts).
    triggeredByMemberId: null,
    trigger: "schedule" as const,
    projectId: row.projectId,
  }));
  for (let at = 0; at < runs.length; at += runRowsPerInsert) {
    await db
      .insert(runTable)
      .values(
        runs.slice(at, at + runRowsPerInsert).map(({ projectId: _projectId, ...values }) => values),
      );
  }
  result.started = runs.length;

  // Written straight to the log rather than through `appendEvent`, for the
  // reasons the stale sweep gives: this is not a request, `run.started` derives
  // no Notification and triggers nothing, and one append per row would make the
  // pass cost the Workspace instead of the limit.
  const rows = runs.map((run) => ({
    workspaceId,
    kind: "run.started" satisfies EventKind,
    subjectType: "run",
    subjectId: run.id,
    projectId: run.projectId,
    payload: { issueId: run.issueId, trigger: run.trigger, agentMemberId: run.agentMemberId },
  }));
  for (let at = 0; at < rows.length; at += runStartedRowsPerInsert) {
    await db.insert(eventTable).values(rows.slice(at, at + runStartedRowsPerInsert));
  }

  // Last, and only once the backlog is drained: an interval that stamped itself
  // before the work was done would skip whatever the limit cut off.
  if (drained) {
    await db
      .update(agentTable)
      .set({ scheduleRanAt: now })
      .where(
        inArray(
          agentTable.memberId,
          due.map((row) => row.memberId),
        ),
      );
  }
  return result;
}

/** Deliveries one pass may send. Slack answers in tens of milliseconds; twenty fits a tick. */
export const defaultDeliveryLimit = 20;

/**
 * Attempts before a delivery is given up on. Six with the backoff below spans
 * about an hour and a half, which outlasts a Slack incident but not a webhook
 * URL that has been revoked.
 */
export const maxDeliveryAttempts = 6;

/** The first retry, doubling per attempt: 30s, 1m, 2m, 4m, 8m. */
const deliveryBackoffMs = 30_000;

/** However many attempts have failed, the next one is never further off than this. */
const maxDeliveryBackoffMs = 60 * 60_000;

/**
 * How long a claim holds a delivery. Long enough for a POST that is timing out
 * to finish, short enough that a process dying mid-send costs one minute.
 */
const deliveryLockMs = 60_000;

export interface DueDeliveriesQueryOptions {
  workspaceId: string;
  /** The clock this pass reads. */
  now: Date;
  limit: number;
  maxAttempts?: number;
}

/**
 * What is owed and due, and the sweep's one scan: `delivery_due_idx` is
 * `(deliveredAt, nextAttemptAt)`, so the two leading terms are the two this
 * where clause opens with. There is deliberately no ORDER BY, for the reason
 * `dueRunsQuery` gives: sorting makes SQLite visit every due row before the
 * LIMIT applies, so one pass would cost the backlog.
 *
 * Exported so a test can EXPLAIN it: the query plan is the guarantee.
 */
export function dueDeliveriesQuery(
  db: Db,
  { workspaceId, now, limit, maxAttempts = maxDeliveryAttempts }: DueDeliveriesQueryOptions,
) {
  return db
    .select({ id: deliveryTable.id })
    .from(deliveryTable)
    .where(
      and(
        isNull(deliveryTable.deliveredAt),
        lte(deliveryTable.nextAttemptAt, now),
        eq(deliveryTable.workspaceId, workspaceId),
        eq(deliveryTable.target, "slack"),
        // Out of attempts is given up on, not retried forever.
        lt(deliveryTable.attempts, maxAttempts),
        // Somebody else may be sending it right now.
        or(isNull(deliveryTable.lockedUntil), lt(deliveryTable.lockedUntil, now)),
      ),
    )
    .limit(limit);
}

export interface DeliverDueChannelMessagesOptions {
  db: Db;
  workspaceId: string;
  /** The public origin of this instance, so every message links back to the Issue. */
  baseUrl: string;
  /** The clock, so a test does not have to wait out the backoff. */
  now?: Date;
  /** Most deliveries to send in one pass. */
  limit?: number;
  /** Attempts before a delivery is given up on. */
  maxAttempts?: number;
  /** The way out to Slack. A test passes its own and never reaches the network. */
  fetch?: FetchLike;
}

export interface DeliveryResult {
  /** Deliveries this pass claimed. Fewer than were due when another sweep held them. */
  scanned: number;
  /** Messages Slack accepted. */
  delivered: number;
  /** Messages it refused, which will be tried again. */
  failed: number;
  /** Deliveries that ran out of attempts, or whose Channel is gone. */
  gaveUp: number;
  /** The limit was reached, so call again rather than raising the limit. */
  more: boolean;
}

/** One claimed delivery, and what came back from posting it. */
interface Attempted {
  id: string;
  delivered: boolean;
  status: number;
  error: string | null;
}

/**
 * Sends what the Event log says is owed to a Slack Channel.
 *
 * Bounded exactly like the sweeps above: one indexed SELECT with a LIMIT, one
 * UPDATE that claims what it found, three batched lookups for the rows the
 * messages are rendered from, and one UPDATE per distinct outcome — which is
 * one when a Channel is up and one when it is down. Never a query per row, so
 * a pass costs the limit rather than the Workspace (M3's Cron Trigger).
 *
 * The claim is what makes two sweeps safe without a transaction, which D1 does
 * not have (ADR-0006): the UPDATE re-checks the lock it read and only the ids
 * it hands back are sent, so two passes claim disjoint sets and no Channel
 * hears the same Event twice.
 */
export async function deliverDueChannelMessages({
  db,
  workspaceId,
  baseUrl,
  now = new Date(),
  limit = defaultDeliveryLimit,
  maxAttempts = maxDeliveryAttempts,
  fetch: fetchImpl = fetch,
}: DeliverDueChannelMessagesOptions): Promise<DeliveryResult> {
  const due = await dueDeliveriesQuery(db, { workspaceId, now, limit, maxAttempts });
  const result: DeliveryResult = {
    scanned: 0,
    delivered: 0,
    failed: 0,
    gaveUp: 0,
    more: due.length >= limit,
  };
  if (due.length === 0) return result;

  const claimed = await db
    .update(deliveryTable)
    .set({ lockedUntil: new Date(now.getTime() + deliveryLockMs) })
    .where(
      and(
        inArray(
          deliveryTable.id,
          due.map((row) => row.id),
        ),
        or(isNull(deliveryTable.lockedUntil), lt(deliveryTable.lockedUntil, now)),
      ),
    )
    .returning({
      id: deliveryTable.id,
      targetId: deliveryTable.targetId,
      eventSeq: deliveryTable.eventSeq,
      attempts: deliveryTable.attempts,
    });

  result.scanned = claimed.length;
  if (claimed.length === 0) return result;

  // The three lookups the messages are rendered from, batched: the Events
  // themselves, the Channels they are headed for, and the Issues they name.
  // The payload was never stored, so this is where it is built (ADR-0003).
  const events = await db
    .select({
      seq: eventTable.seq,
      kind: eventTable.kind,
      subjectType: eventTable.subjectType,
      subjectId: eventTable.subjectId,
      payload: eventTable.payload,
    })
    .from(eventTable)
    .where(
      inArray(
        eventTable.seq,
        claimed.map((row) => row.eventSeq),
      ),
    );
  const channels = await db
    .select({ id: channelTable.id, config: channelTable.config })
    .from(channelTable)
    .where(
      inArray(
        channelTable.id,
        claimed.map((row) => row.targetId),
      ),
    );

  const eventBySeq = new Map(events.map((row) => [row.seq, row as unknown as Event]));
  const webhookOf = new Map(channels.map((row) => [row.id, row.config?.webhookUrl] as const));
  const issueIds = [
    ...new Set([...eventBySeq.values()].map((event) => issueOf(event)).filter((id) => id !== null)),
  ];
  const issues = issueIds.length
    ? await db
        .select({
          id: issueTable.id,
          number: issueTable.number,
          title: issueTable.title,
          projectKey: projectTable.key,
        })
        .from(issueTable)
        .innerJoin(projectTable, eq(projectTable.id, issueTable.projectId))
        .where(inArray(issueTable.id, issueIds))
    : [];
  const issueById = new Map(
    issues.map((row) => [row.id, { key: `${row.projectKey}-${row.number}`, title: row.title }]),
  );

  // A delivery whose Channel or Event is gone can never be sent, so it is
  // retired rather than retried: the Channel was deleted after the Event.
  const undeliverable: string[] = [];
  const sending: Array<{ id: string; webhookUrl: string; payload: SlackPayload }> = [];
  for (const row of claimed) {
    const event = eventBySeq.get(row.eventSeq);
    const webhookUrl = webhookOf.get(row.targetId);
    const kind = event ? notificationKindOf(event) : null;
    if (!event || !kind || typeof webhookUrl !== "string" || webhookUrl.length === 0) {
      undeliverable.push(row.id);
      continue;
    }
    const issueId = issueOf(event);
    sending.push({
      id: row.id,
      webhookUrl,
      payload: slackMessage({
        kind,
        issue: (issueId && issueById.get(issueId)) || null,
        baseUrl,
      }),
    });
  }

  const attempted: Attempted[] = await Promise.all(
    sending.map(async ({ id, webhookUrl, payload }) => {
      const posted = await postSlackMessage(webhookUrl, payload, fetchImpl);
      return {
        id,
        delivered: posted.delivered,
        status: posted.status,
        error: posted.error ?? null,
      };
    }),
  );

  // One statement per distinct outcome. A Channel that is up answers every
  // message the same way and a Channel that is down refuses them all the same
  // way, so this is one UPDATE in practice and bounded by the limit at worst.
  const outcomes = new Map<string, Attempted[]>();
  for (const one of attempted) {
    const key = `${one.delivered}:${one.status}:${one.error ?? ""}`;
    const group = outcomes.get(key);
    if (group) group.push(one);
    else outcomes.set(key, [one]);
  }

  for (const group of outcomes.values()) {
    const [first] = group as [Attempted, ...Attempted[]];
    const ids = group.map((one) => one.id);
    if (first.delivered) {
      await db
        .update(deliveryTable)
        .set({
          deliveredAt: now,
          attempts: sql`${deliveryTable.attempts} + 1`,
          lockedUntil: null,
          lastStatus: first.status,
          lastError: null,
        })
        .where(inArray(deliveryTable.id, ids));
      result.delivered += group.length;
      continue;
    }
    await db
      .update(deliveryTable)
      .set({
        attempts: sql`${deliveryTable.attempts} + 1`,
        lockedUntil: null,
        lastStatus: first.status,
        lastError: first.error,
        // The backoff is arithmetic SQLite does on the row's own attempt
        // count, so a retry needs no second read of what was just written.
        nextAttemptAt: sql`${now.getTime()} + min(${deliveryBackoffMs} * (1 << ${deliveryTable.attempts}), ${maxDeliveryBackoffMs})`,
      })
      .where(inArray(deliveryTable.id, ids));
    result.failed += group.length;
  }

  // Out of attempts is not a failure to retry: nothing will look at these rows
  // again, because the claim above passes over anything at the ceiling.
  const claimedAttempts = new Map(claimed.map((row) => [row.id, row.attempts]));
  result.gaveUp = attempted.filter(
    (one) => !one.delivered && (claimedAttempts.get(one.id) ?? 0) + 1 >= maxAttempts,
  ).length;

  if (undeliverable.length > 0) {
    await db
      .update(deliveryTable)
      .set({
        attempts: maxAttempts,
        lockedUntil: null,
        lastError: "the Channel this was owed to is gone",
      })
      .where(inArray(deliveryTable.id, undeliverable));
    result.gaveUp += undeliverable.length;
  }

  return result;
}
