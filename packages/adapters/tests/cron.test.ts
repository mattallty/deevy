import { describe, expect, it } from "vite-plus/test";
import { createTimerCron } from "../src/node/index.ts";

/** Waits for a condition, with a deadline, so a broken cron fails fast. */
async function until(condition: () => boolean, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the cron to tick");
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

function timeouts() {
  return process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
}

describe("the timer cron", () => {
  it("ticks, and stops ticking when told to", async () => {
    const cron = createTimerCron();
    let ticks = 0;
    const stop = cron.every(0.005, async () => {
      ticks += 1;
    });

    await until(() => ticks >= 2);
    stop();
    const settled = ticks;
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(ticks).toBe(settled);
  });

  it("holds nothing that would keep the process from exiting", async () => {
    const before = timeouts();
    const cron = createTimerCron();
    let ticks = 0;
    const stop = cron.every(0.005, async () => {
      ticks += 1;
    });

    await until(() => ticks >= 1);
    // An interval that keeps the event loop alive is a process that will not
    // shut down, which is the failure this test exists to catch.
    expect(timeouts()).toBe(before);
    stop();
  });

  it("aborts the tick in flight when it stops, and never overlaps two", async () => {
    const cron = createTimerCron();
    let entered = 0;
    let inFlight = 0;
    let overlapped = false;
    let aborted = false;
    const stop = cron.every(0.005, async (signal) => {
      entered += 1;
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (signal.aborted) aborted = true;
      inFlight -= 1;
    });

    await until(() => entered >= 2);
    stop();
    await until(() => aborted);

    expect(overlapped).toBe(false);
  });

  it("keeps ticking after a tick throws, and hands the failure to onError", async () => {
    const failures: unknown[] = [];
    const cron = createTimerCron({ onError: (error) => failures.push(error) });
    let ticks = 0;
    const stop = cron.every(0.005, async () => {
      ticks += 1;
      throw new Error(`tick ${ticks} failed`);
    });

    await until(() => failures.length >= 2);
    stop();

    expect((failures[0] as Error).message).toBe("tick 1 failed");
  });
});
