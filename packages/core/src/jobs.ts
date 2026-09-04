/**
 * The two seams background work reaches the outside world through (ADR-0006).
 *
 * Both are web-standard: no timer, no `setInterval`, and nothing Node-only
 * lives here. A Node process satisfies them with a timer
 * (`packages/adapters/src/node/cron.ts`); a Cloudflare Worker satisfies them
 * with Queues and Cron Triggers, and nothing in the core has to notice.
 */

/**
 * What a queued job is about. The union grows one slice at a time, like
 * `EventKind`: slice 5's webhook delivery is its first producer.
 */
export type JobKind = "webhook.delivery";

/**
 * A job is a pointer, never a payload. `id` names a durable row that already
 * holds everything the worker needs — the delivery's URL, its attempt count,
 * its next attempt — so a lost or duplicated message costs nothing: the row is
 * the record and the queue is only a hint about when to look at it.
 */
export interface Job {
  kind: JobKind;
  /** The durable row this job is about. */
  id: string;
  /** Earliest the worker should pick it up. Backoff lives in the row, not here. */
  delaySeconds?: number;
}

export interface JobQueue {
  /**
   * Hands the job over. It MUST NOT throw and MUST NOT reject: it is called in
   * the tail of a request that has already written the durable row, and a
   * queue that is down must not turn a successful write into a failed
   * response. An implementation that cannot deliver swallows the failure and
   * lets the next sweep find the row.
   */
  enqueue(job: Job): Promise<void>;
}

/**
 * A queue for a deployment that has none: every sweep still finds the durable
 * rows, only later. It is the honest default rather than a stub, because the
 * queue is a latency optimisation and never a correctness requirement.
 */
export function discardingJobQueue(): JobQueue {
  return { enqueue: async () => {} };
}

/** Stops a registered schedule. Calling it more than once is safe. */
export type CronStop = () => void;

export interface Cron {
  /**
   * Runs `run` about every `seconds`, and returns the function that stops it.
   * The signal is aborted when that stop function is called, so a tick in
   * flight can give up rather than finish work nobody is waiting for. Ticks
   * never overlap: a tick still running when the next one is due is not
   * interrupted, and the due tick is skipped.
   */
  every(seconds: number, run: (signal: AbortSignal) => Promise<void>): CronStop;
}
