import { sweepStaleRuns, type Cron } from "@deevy/core";
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
}: RunnerOptions): Runner {
  const silenceMs = staleMinutes * 60_000;

  async function sweep(signal: AbortSignal): Promise<void> {
    // A self-hosted instance serves one Workspace (CONTEXT.md), and it does not
    // exist until the first admin signs in, so a fresh container sweeps nothing.
    const workspace = await db.query.workspace.findFirst();
    if (!workspace) return;

    for (let pass = 0; pass < maxPassesPerTick; pass += 1) {
      if (signal.aborted) return;
      const { more } = await sweepStaleRuns({
        db,
        workspaceId: workspace.id,
        silenceMs,
        ...(sweepLimit === undefined ? {} : { limit: sweepLimit }),
      });
      // `more` means the limit was reached: go again rather than raise it, and
      // stop after so many passes so one tick stays bounded.
      if (!more) return;
    }
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
