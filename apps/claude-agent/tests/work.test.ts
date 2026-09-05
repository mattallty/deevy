import { afterEach, describe, expect, it } from "vite-plus/test";
import { runOnce, workRun } from "../src/work.ts";
import type { Session, SessionEvent } from "../src/session.ts";
import { finished, instance, scripted } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function deevyWithAnAssignedIssue(title = "Ship it") {
  const it = await instance();
  closers.push(it.close);
  await it.asAda.issues.create({ projectKey: "DEV", title });
  await it.asAda.issues.update({ key: "DEV-1", assigneeMemberId: it.planner.id });
  return it;
}

/** The Events the Workspace has recorded, in order, for a test to read as a story. */
async function story(it: Awaited<ReturnType<typeof instance>>): Promise<string[]> {
  const events = await it.asAda.events.list({ limit: 100 });
  return events.events.map((event) => event.kind);
}

const options = { runTimeoutMs: 5_000 };

describe("a pass", () => {
  it("works the Run the trigger already opened, and leaves the record the Human reads", async () => {
    const it = await deevyWithAnAssignedIssue();

    const session = scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.postActivity(run.id, "thought", "Reading the intent");
        await it.deevy.postActivity(run.id, "action", "Wrote the plan");
        await it.deevy.finishRun(run.id, "completed", "Planned it");
      },
      finished,
    ]);

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(pass.worked).toEqual([
      { runId: expect.any(String), issueKey: "DEV-1", status: "completed" },
    ]);
    expect(await story(it)).toEqual([
      "project.created",
      "issue.created",
      // The intent Document its State supplies a template for.
      "document.created",
      "issue.assigned",
      "run.started",
      "run.activity",
      "run.activity",
      "run.completed",
    ]);
  });

  it("finds nothing to do the second time round", async () => {
    const it = await deevyWithAnAssignedIssue();
    const session = scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.finishRun(run.id, "completed", "Planned it");
      },
      finished,
    ]);

    await runOnce({ ...options, deevy: it.deevy, session });
    const again = await runOnce({ ...options, deevy: it.deevy, session });

    expect(again.worked).toEqual([]);
    expect(again.takenUp).toEqual([]);
  });

  it("reports what is waiting on a Human without touching it", async () => {
    const it = await deevyWithAnAssignedIssue();
    await it.asAda.gates.approve({ key: "DEV-1" });
    await it.asAda.gates.approve({ key: "DEV-1" });
    const session = scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.postActivity(run.id, "action", "Wrote the plan");
        await it.asAgent(`/runs/${run.id}/request-approval`);
      },
      finished,
    ]);

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(pass.worked[0]).toMatchObject({ status: "awaiting_input" });
    expect(pass.waiting.map((run) => run.issueKey)).toEqual(["DEV-1"]);
    // A Run waiting on a Human is not the supervisor's to close, however long
    // it waits (docs/agent-loop.md).
    expect(pass.worked[0].failedBy).toBeUndefined();
  });
});

describe("taking work up from the inbox", () => {
  it("opens a Run for an assignment and clears the Notification it acted on", async () => {
    const it = await instance();
    closers.push(it.close);
    await it.asAda.issues.create({ projectKey: "DEV", title: "Ship it" });
    await it.asAda.issues.update({ key: "DEV-1", assigneeMemberId: it.planner.id });
    // The Run the trigger opened is finished, so only the inbox is left to
    // find the work by — which is the path ADR-0003 promises an Agent with no
    // webhook URL, and the one M4 slice 1 made survivable.
    const [opened] = await it.deevy.runs("pending");
    await it.deevy.finishRun(opened.id, "failed", "An earlier attempt gave up");

    const pass = await runOnce({
      ...options,
      deevy: it.deevy,
      session: scripted([
        async () => {
          const [run] = await it.deevy.runs("pending");
          await it.deevy.finishRun(run.id, "completed", "Second time lucky");
        },
        finished,
      ]),
    });

    expect(pass.takenUp).toEqual(["DEV-1"]);
    expect(pass.worked[0]).toMatchObject({ issueKey: "DEV-1", status: "completed" });
    expect(await it.deevy.unread()).toEqual([]);
  });

  it("treats an Issue somebody already has as somebody else's", async () => {
    const it = await deevyWithAnAssignedIssue();

    // The trigger's Run is still open, so `runs.start` is a CONFLICT: the rule
    // is one open Run per Issue and Agent, and that is what makes two hosts
    // sharing one key safe rather than lucky.
    const pass = await runOnce({
      ...options,
      deevy: it.deevy,
      session: scripted([
        async () => {
          const [run] = await it.deevy.runs("pending");
          await it.deevy.finishRun(run.id, "completed", "Planned it");
        },
        finished,
      ]),
    });

    expect(pass.takenUp).toEqual([]);
    expect((await it.asAda.runs.list({ issueKey: "DEV-1" })).runs).toHaveLength(1);
    expect(await it.deevy.unread()).toEqual([]);
  });
});

describe("the envelope", () => {
  it("fails the Run when the session throws, rather than leaving it silent", async () => {
    const it = await deevyWithAnAssignedIssue();
    const session = scripted([() => Promise.reject(new Error("the model fell over")), finished]);

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(pass.worked[0]).toMatchObject({ status: "failed" });
    expect(pass.worked[0].failedBy).toContain("the model fell over");
    const feed = await it.asAda.runs.get({ runId: pass.worked[0].runId });
    expect(feed.activities.at(-1)).toMatchObject({ kind: "error" });
    expect(feed.summary).toContain("the model fell over");
  });

  it("fails the Run when the session simply stops without finishing", async () => {
    const it = await deevyWithAnAssignedIssue();
    const session = scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.postActivity(run.id, "thought", "Thinking about it");
      },
      finished,
    ]);

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(pass.worked[0]).toMatchObject({
      status: "failed",
      failedBy: "The session ended without finishing this Run",
    });
  });

  it("leaves a Run the session finished alone, whatever the session then reported", async () => {
    const it = await deevyWithAnAssignedIssue();
    const session = scripted([
      async () => {
        const [run] = await it.deevy.runs("pending");
        await it.deevy.finishRun(run.id, "completed", "Planned it");
      },
      // deevy writes before it answers, so a call that errored may already have
      // done what it said (docs/agent-loop.md): a Run failed over work that
      // succeeded is the worst record the runtime could leave.
      { type: "done", ok: false, detail: "the tool call timed out" } satisfies SessionEvent,
    ]);

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(pass.worked[0]).toMatchObject({ status: "completed" });
    expect(pass.worked[0].failedBy).toBeUndefined();
    expect((await it.asAda.runs.get({ runId: pass.worked[0].runId })).summary).toBe("Planned it");
  });

  it("stops before spending anything when the session cannot reach deevy", async () => {
    const it = await deevyWithAnAssignedIssue();
    let called = false;
    const session = scripted(
      [
        () => {
          called = true;
          return Promise.resolve();
        },
        finished,
      ],
      { type: "ready", tools: [], servers: [{ name: "deevy", status: "failed" }] },
    );

    const pass = await runOnce({ ...options, deevy: it.deevy, session });

    expect(called).toBe(false);
    expect(pass.worked[0].failedBy).toContain("could not reach deevy");
    expect(pass.worked[0].status).toBe("failed");
  });

  it("stops a session that runs past the Run's timeout and says so", async () => {
    const it = await deevyWithAnAssignedIssue();
    const session: Session = async function* () {
      yield { type: "ready", tools: [], servers: [{ name: "deevy", status: "connected" }] };
      await new Promise((resolve) => setTimeout(resolve, 50));
      throw new Error("should have been aborted");
    };

    const pass = await runOnce({ deevy: it.deevy, session, runTimeoutMs: 1 });

    expect(pass.worked[0]).toMatchObject({
      status: "failed",
      failedBy: "The session ran past its timeout",
    });
  });
});

describe("a Run that is not ours to drive", () => {
  it("is left where it is", async () => {
    const it = await deevyWithAnAssignedIssue();
    const [run] = await it.deevy.runs("pending");
    await it.deevy.postActivity(run.id, "thought", "Somebody else got here first");

    const result = await workRun(
      { ...options, deevy: it.deevy, session: scripted([finished]) },
      { ...run, status: "active" },
    );

    expect(result).toEqual({ runId: run.id, issueKey: "DEV-1", status: "active" });
  });
});
