import { runOnce, type Pass, type WorkOptions } from "./work.ts";

export interface LoopOptions extends WorkOptions {
  /** Seconds between passes. `DEEVY_AGENT_POLL_SECONDS`. */
  pollSeconds: number;
  /** The ceiling the wait climbs to while there is nothing to do. */
  maxPollSeconds?: number;
  /** Called after every pass, so a host can log or count. */
  onPass?: (pass: Pass) => void;
  /** How the loop waits. A test hands it something that does not take a second. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface Loop {
  /** Ends the loop and waits for the pass in flight. */
  stop(): Promise<void>;
  /** Resolves when the loop has stopped. */
  done: Promise<void>;
}

/** Waits, unless the wait is cut short by the loop stopping. */
function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

/**
 * The runtime, staying up.
 *
 * A sequential loop rather than a timer, so passes cannot overlap by
 * construction: there is one pass, then a wait, then the next. `startRunner` in
 * `apps/server` needs an overlap guard because a timer can fire into a pass
 * that has not finished; nothing here can.
 *
 * The wait doubles while there is nothing to do and drops back to the floor the
 * moment a pass finds something, so an idle Workspace is cheap and a busy one
 * is not kept waiting. Slice 8's webhook cuts the wait short instead of
 * shortening it.
 */
export function startLoop(options: LoopOptions): Loop {
  const {
    pollSeconds,
    maxPollSeconds = pollSeconds * 8,
    sleep = waitFor,
    onPass,
    ...work
  } = options;
  const stopping = new AbortController();
  const signal = work.signal ? AbortSignal.any([stopping.signal, work.signal]) : stopping.signal;

  const done = (async () => {
    let waitMs = pollSeconds * 1000;
    while (!signal.aborted) {
      const pass = await runOnce({ ...work, signal });
      onPass?.(pass);
      const busy = pass.worked.length > 0 || pass.takenUp.length > 0;
      waitMs = busy ? pollSeconds * 1000 : Math.min(waitMs * 2, maxPollSeconds * 1000);
      await sleep(waitMs, signal);
    }
  })();

  return {
    done,
    async stop() {
      stopping.abort();
      // A pass that failed has already been reported by whoever is watching
      // `done`; stopping is not the moment to fail on it again.
      await done.catch(() => undefined);
    },
  };
}
