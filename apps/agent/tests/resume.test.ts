import { afterEach, describe, expect, it } from "vite-plus/test";
import { promptFor, runOnce } from "../src/work.ts";
import type { Run } from "../src/deevy.ts";
import { finished, instance, scripted } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const options = { runTimeoutMs: 5_000 };

/**
 * An Issue in the Plan Gate with a Run stopped at it: the model wrote the plan
 * and asked, and deevy is waiting for a Human.
 */
async function stoppedAtTheGate() {
  const it = await instance();
  closers.push(it.close);
  await it.asAda.issues.create({ projectKey: "DEV", title: "Ship it" });
  await it.asAda.gates.approve({ key: "DEV-1" });
  await it.asAda.gates.approve({ key: "DEV-1" });
  await it.asAda.issues.update({ key: "DEV-1", assigneeMemberId: it.planner.id });

  const pass = await runOnce({
    ...options,
    deevy: it.deevy,
    proxy: it.proxy,
    session: scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.postActivity(run.id, "action", "Wrote the plan");
        await it.asAgent(`/runs/${run.id}/request-approval`);
      },
      finished,
    ]),
  });

  expect(pass.worked[0]).toMatchObject({ status: "awaiting_input" });
  return { it, runId: pass.worked[0].runId };
}

describe("a Human rules on the Gate", () => {
  it("hands the Run back, and the loop carries on and finishes it", async () => {
    const { it, runId } = await stoppedAtTheGate();

    await it.asAda.gates.approve({ key: "DEV-1", note: "Looks right, build it" });

    const prompts: string[] = [];
    const pass = await runOnce({
      ...options,
      deevy: it.deevy,
      proxy: it.proxy,
      session: (input) => {
        prompts.push(input.prompt);
        return scripted([
          async () => {
            await it.deevy.finishRun(runId, "completed", "Built it");
          },
          finished,
        ])(input);
      },
    });

    expect(pass.resumed).toEqual([{ runId, issueKey: "DEV-1", status: "completed" }]);
    expect(prompts[0]).toContain("approved the Plan Gate");
    expect(prompts[0]).toContain("Looks right, build it");
    // The Agent throughout, the Human exactly one hop away.
    const events = (await it.asAda.events.list({ limit: 100 })).events.map((e) => e.kind);
    expect(events.slice(events.indexOf("run.awaiting_input"))).toEqual([
      "run.awaiting_input",
      "gate.approved",
      "run.answered",
      // The ruling joining the Run's own feed as a `prompt`, which is the same
      // shape a Human's answer to any other elicitation arrives in
      // (docs/agent-loop.md).
      "run.activity",
      "run.completed",
    ]);
  });

  it("tells a rejected Run to read the note and revise, not to ask again", async () => {
    const { it, runId } = await stoppedAtTheGate();

    await it.asAda.gates.reject({ key: "DEV-1", note: "The order of work is wrong" });

    const prompts: string[] = [];
    let askedAgain = false;
    await runOnce({
      ...options,
      deevy: it.deevy,
      proxy: it.proxy,
      session: (input) => {
        prompts.push(input.prompt);
        return scripted([
          async () => {
            await it.deevy.finishRun(runId, "completed", "Revised the plan");
          },
          finished,
        ])(input);
      },
    });
    const after = await runOnce({
      ...options,
      deevy: it.deevy,
      proxy: it.proxy,
      session: scripted([
        () => {
          askedAgain = true;
          return Promise.resolve();
        },
        finished,
      ]),
    });

    expect(prompts[0]).toContain("rejected the Plan Gate");
    expect(prompts[0]).toContain("The order of work is wrong");
    expect(prompts[0]).toContain("revise");
    // One ruling, one resume: the runtime is told once rather than polling, so
    // a rejected plan cannot ask the same question in a loop.
    expect(after.resumed).toEqual([]);
    expect(askedAgain).toBe(false);
  });

  it("is picked up on the first pass after the service comes back", async () => {
    const { it, runId } = await stoppedAtTheGate();

    // The ruling lands while nothing is running.
    await it.asAda.gates.approve({ key: "DEV-1" });

    const pass = await runOnce({
      ...options,
      deevy: it.deevy,
      proxy: it.proxy,
      session: scripted([
        async () => {
          await it.deevy.finishRun(runId, "completed", "Built it");
        },
        finished,
      ]),
    });

    expect(pass.resumed[0]).toMatchObject({ runId, status: "completed" });
  });
});

describe("a Run nobody has ruled on", () => {
  it("is left where it is, and reported rather than failed", async () => {
    const { it, runId } = await stoppedAtTheGate();

    const pass = await runOnce({
      ...options,
      deevy: it.deevy,
      proxy: it.proxy,
      session: scripted([finished]),
    });

    expect(pass.resumed).toEqual([]);
    expect(pass.worked).toEqual([]);
    expect(pass.waiting.map((run) => run.id)).toEqual([runId]);
    // A Run waiting on a Human does not time out, however long it waits: the
    // sweep only touches Runs deevy is waiting on (docs/agent-loop.md).
    expect((await it.asAda.runs.get({ runId })).status).toBe("awaiting_input");
  });
});

describe("the prompt a resumed Run gets", () => {
  const run = {
    id: "run-1",
    issueKey: "DEV-1",
    trigger: "assignment",
    status: "active",
  } as Run;

  it("says what happened while it was stopped, and nothing about how to work", () => {
    const approved = promptFor(run, {
      status: "approved",
      stateName: "Plan",
      note: "go on",
      decidedByMemberId: "m1",
    });

    expect(approved).toContain("approved the Plan Gate");
    expect(approved).toContain('They said: "go on"');
    // Everything else is in the instructions, which every session carries.
    expect(approved).not.toContain("runs_post_activity");
  });

  it("says nothing about a note nobody wrote", () => {
    const bare = promptFor(run, {
      status: "approved",
      stateName: "Plan",
      note: null,
      decidedByMemberId: "m1",
    });

    expect(bare).not.toContain("They said");
  });
});
