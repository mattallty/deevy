/**
 * The Node implementation of the `Cron` port in `packages/core/src/jobs.ts`.
 *
 * The interface is restated here rather than imported: `@deevy/core` already
 * dev-depends on `@deevy/adapters` for its test database, so an adapters-to-core
 * edge would close a cycle (docs/plans/m2.md). The two shapes are structurally
 * identical, and `apps/server` — which depends on both — is where the compiler
 * checks that they still are.
 */

/** Stops a registered schedule. Calling it more than once is safe. */
export type TimerCronStop = () => void;

export interface TimerCron {
  every(seconds: number, run: (signal: AbortSignal) => Promise<void>): TimerCronStop;
}

export interface TimerCronOptions {
  /** Where a tick's failure goes. Defaults to the console: a dead schedule is worse than a noisy log. */
  onError?: (error: unknown) => void;
}

/**
 * A schedule driven by `setInterval`. On Cloudflare this whole file is replaced
 * by a Cron Trigger (ADR-0006), which is why no core module may reach a timer.
 */
export function createTimerCron(options: TimerCronOptions = {}): TimerCron {
  const onError =
    options.onError ?? ((error: unknown) => console.error("[cron] a tick failed", error));

  return {
    every(seconds, run) {
      const controller = new AbortController();
      let inFlight = false;

      const timer = setInterval(
        () => {
          // A tick that outlasts its interval is a slow tick, not a reason to
          // start a second one on the same rows.
          if (inFlight || controller.signal.aborted) return;
          inFlight = true;
          void run(controller.signal)
            // A failed sweep is a failed sweep; the schedule survives it,
            // because the next pass finds the same durable rows.
            .catch(onError)
            .finally(() => {
              inFlight = false;
            });
        },
        Math.max(1, Math.round(seconds * 1000)),
      );
      // An interval that keeps the event loop alive is a process that will not
      // shut down. Nothing here is worth staying up for.
      timer.unref();

      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        // Whatever is still running is working for a process that is leaving.
        controller.abort();
      };
    },
  };
}
