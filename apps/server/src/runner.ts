import {
  deliverDueChannelMessages,
  deliverDueWebhooks,
  sweepSchedules,
  sweepStaleRuns,
  type Cron,
} from "@deevy/core";
import type { Db } from "@deevy/db";

/**
 * deevy's background work, on the Node deployment.
 *
 * It lives here rather than in `createApp` on purpose: `apps/web/src/worker.ts`
 * calls `createApp` once per request, so a schedule started inside it would
 * leak a timer per request. On Cloudflare the same sweep is driven by a Cron
 * Trigger instead, and nothing in `packages/core` changes (ADR-0006).
 */

export interface RunnerOptions {
  db: Db;
  /** The schedule. Node passes `createTimerCron()`; M3 passes a Cron Trigger. */
  cron: Cron;
  /** Silence after which a Run is presumed stale. `DEEVY_RUN_STALE_MINUTES`. */
  staleMinutes?: number;
  /** How often the sweep runs. `DEEVY_SWEEP_INTERVAL_SECONDS`. */
  sweepIntervalSeconds?: number;
  /** Runs one sweep pass may move. */
  sweepLimit?: number;
  /** Passes one tick may take before it leaves the rest for the next tick. */
  maxPassesPerTick?: number;
  /**
   * The public origin of this instance, so a Slack message links back to the
   * Issue it is about. `BETTER_AUTH_URL`.
   */
  baseUrl?: string;
  /** Messages to a Channel one delivery pass may send. */
  deliveryLimit?: number;
}

export interface Runner {
  /** Ends the schedule and waits for the pass in flight. */
  stop(): Promise<void>;
}

export function startRunner({
  db,
  cron,
  staleMinutes = 30,
  sweepIntervalSeconds = 60,
  sweepLimit,
  maxPassesPerTick = 5,
  baseUrl,
  deliveryLimit,
}: RunnerOptions): Runner {
  const silenceMs = staleMinutes * 60_000;

  const limit = sweepLimit === undefined ? {} : { limit: sweepLimit };
  const deliveries = deliveryLimit === undefined ? {} : { limit: deliveryLimit };

  /**
   * One unit of background work, run until it says it is done or the tick has
   * had enough passes. `more` means the limit was reached: go again rather than
   * raise it, so one tick stays bounded whatever the backlog is.
   */
  async function drain(signal: AbortSignal, pass: () => Promise<{ more: boolean }>): Promise<void> {
    for (let attempt = 0; attempt < maxPassesPerTick; attempt += 1) {
      if (signal.aborted) return;
      const { more } = await pass();
      if (!more) return;
    }
  }

  async function sweep(signal: AbortSignal): Promise<void> {
    // A self-hosted instance serves one Workspace (CONTEXT.md), and it does not
    // exist until the first admin signs in, so a fresh container sweeps nothing.
    const workspace = await db.query.workspace.findFirst();
    if (!workspace) return;
    const workspaceId = workspace.id;

    await drain(signal, () => sweepStaleRuns({ db, workspaceId, silenceMs, ...limit }));
    // The schedule trigger rides the same Cron: one timer on Node, one Cron
    // Trigger on Cloudflare, and nothing else to configure or forget.
    await drain(signal, () => sweepSchedules({ db, workspaceId, ...limit }));
    // And so does what is owed to a Channel. Without an origin a Slack message
    // could not link back to the Issue, so the deliveries wait rather than go
    // out useless: they are durable rows, and the next tick with one sends them.
    if (baseUrl) {
      await drain(signal, () =>
        deliverDueChannelMessages({ db, workspaceId, baseUrl, ...deliveries }),
      );
    }
    // And what is owed to a subscribed URL, which needs no origin: the body is
    // the Event itself and carries no link (ADR-0003).
    await drain(signal, () => deliverDueWebhooks({ db, workspaceId, ...deliveries }));
  }

  let inFlight: Promise<void> = Promise.resolve();
  const stopSchedule = cron.every(sweepIntervalSeconds, (signal) => {
    inFlight = sweep(signal);
    return inFlight;
  });

  return {
    async stop() {
      stopSchedule();
      // The cron already reported whatever went wrong; shutting down is not
      // the moment to fail on it.
      await inFlight.catch(() => {});
    },
  };
}
