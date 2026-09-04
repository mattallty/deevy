/**
 * The `JobQueue` port of `packages/core/src/jobs.ts` on a Cloudflare Queue
 * (ADR-0006, docs/plans/m3.md slice 9).
 *
 * Queues are a paid feature and M3's definition of done is a free account, so
 * the binding is optional everywhere: present, a delivery goes out when it is
 * written; absent, the next Cron pass finds the same row a beat later. That is
 * only safe because a job is a pointer and never a payload — the durable row
 * holds everything the consumer needs — so a message that is lost, duplicated
 * or delivered late costs nothing.
 *
 * Nothing here imports `@deevy/core`, for the reason `createDb` takes
 * drizzle's `AnyD1Database` rather than a Workers type: an adapter names the
 * shape it needs. The entry that hands the result to `createApp` is where the
 * compiler checks that this really is a `JobQueue` (apps/web/src/worker.ts).
 */

/** A job as the port describes one: a pointer to a durable row, never a payload. */
export interface QueuedJob {
  kind: "webhook.delivery";
  /** The durable row this job is about. */
  id: string;
  /** Earliest the consumer should pick it up. Backoff lives in the row, not here. */
  delaySeconds?: number;
}

/**
 * What a Queue producer binding offers, narrowed to what deevy sends. Written
 * out rather than imported from `@cloudflare/workers-types` because this
 * package compiles with `types: ["node"]`, and pulling the Workers globals in
 * here would put them on every consumer of the adapter.
 */
export interface QueueProducer {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

/** One message a consumer was handed, narrowed the same way. */
export interface QueueMessage {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

/** What Cloudflare hands the `queue` handler: a batch of them. */
export interface QueueBatch {
  messages: QueueMessage[];
}

/**
 * Hands jobs to the binding, and swallows anything that goes wrong.
 *
 * `enqueue` neither throws nor rejects because the port says so: it is called
 * in the tail of a request that has already written the durable row, and a
 * queue that is down must not turn a successful write into a failed response.
 */
export function createQueueJobQueue(binding: QueueProducer): {
  enqueue(job: QueuedJob): Promise<void>;
} {
  return {
    async enqueue(job) {
      try {
        await binding.send(
          { kind: job.kind, id: job.id },
          job.delaySeconds === undefined ? undefined : { delaySeconds: job.delaySeconds },
        );
      } catch {
        // The row is the record and this was only a hint about when to look at
        // it, so the next sweep still finds exactly what the write left.
      }
    },
  };
}

/**
 * The job a message carries, or null when it carries something this version of
 * deevy does not know. It lives beside the writer above so the two cannot
 * drift, and a null is a permanent failure the consumer acks rather than a
 * message retried until the queue gives up on it.
 */
export function jobIn(body: unknown): QueuedJob | null {
  if (typeof body !== "object" || body === null) return null;
  const { kind, id } = body as { kind?: unknown; id?: unknown };
  if (kind !== "webhook.delivery" || typeof id !== "string" || id.length === 0) return null;
  return { kind, id };
}
