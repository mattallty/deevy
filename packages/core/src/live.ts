import type { Db, Event } from "@deevy/db";

/** How often the stream looks for new Events, and how often it says it is still there. */
export const POLL_MS = 1000;
export const HEARTBEAT_MS = 15_000;

/** What a subscriber receives: an Event, or a heartbeat carrying the cursor. */
export type LiveMessage =
  | { type: "event"; event: Event }
  | { type: "heartbeat"; cursor: number | null };

export interface SubscribeOptions {
  db: Db;
  workspaceId: string;
  projectId?: string | null;
  after?: number;
  signal?: AbortSignal;
  /** Overridden by tests; production uses POLL_MS. */
  pollMs?: number;
  heartbeatMs?: number;
}

/**
 * The Event log as a stream. Everything is request-scoped: the loop ends when
 * the request's abort signal fires, and no timer outlives it, so the same code
 * runs on Workers (ADR-0006). Polling rather than an in-process bus for the
 * same reason: two isolates share the database, not memory.
 *
 * With `after`, the stream resumes from that seq. Without it, it starts from
 * whatever happens next, and the cursor is fixed on the first tick rather than
 * when the request arrives. The opening heartbeat reports that cursor, so a
 * subscriber that also loaded a page of Events can tell whether it missed any
 * and re-read them; a client that cares should pass the `nextCursor` that
 * `events.list` gave it rather than rely on the gap being empty.
 */
export async function* subscribeToEvents(
  options: SubscribeOptions,
): AsyncGenerator<LiveMessage, void, unknown> {
  const pollMs = options.pollMs ?? POLL_MS;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  let cursor = options.after ?? (await latestSeq(options));
  let lastBeat = Date.now();

  // The stream opens with its cursor, so a subscriber knows where it is
  // reading from before anything happens, and can resume there after a drop.
  yield { type: "heartbeat", cursor };

  while (!options.signal?.aborted) {
    const rows = await readAfter(options, cursor);
    for (const event of rows) {
      cursor = event.seq;
      yield { type: "event", event };
      lastBeat = Date.now();
    }
    if (options.signal?.aborted) return;
    if (Date.now() - lastBeat >= heartbeatMs) {
      yield { type: "heartbeat", cursor };
      lastBeat = Date.now();
    }
    await sleep(pollMs, options.signal);
  }
}

async function latestSeq(options: SubscribeOptions): Promise<number> {
  const rows = await options.db.query.event.findMany({
    where: {
      workspaceId: options.workspaceId,
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    orderBy: { seq: "desc" },
    limit: 1,
    columns: { seq: true },
  });
  return rows[0]?.seq ?? 0;
}

function readAfter(options: SubscribeOptions, cursor: number) {
  return options.db.query.event.findMany({
    where: {
      workspaceId: options.workspaceId,
      seq: { gt: cursor },
      ...(options.projectId ? { projectId: options.projectId } : {}),
    },
    orderBy: { seq: "asc" },
    limit: 200,
  });
}

/** Resolves early when the request is aborted, so nothing keeps the loop alive. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}
