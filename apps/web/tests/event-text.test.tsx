import { describe, expect, it } from "vite-plus/test";
import { describeEvent } from "../src/lib/event-text.ts";

const ctx = {
  memberName: (id: string) => ({ "m-ada": "Ada", "m-bob": "Bob" })[id],
  labelName: (id: string) => ({ l1: "backend", l2: "epic: Checkout" })[id],
};

describe("describeEvent", () => {
  it("names the Gate and quotes the note on a ruling", () => {
    expect(
      describeEvent({
        kind: "gate.approved",
        payload: { state: "Intent", to: "Spec", note: "Go." },
      }),
    ).toMatchObject({
      text: "approved the Intent Gate → Spec",
      detail: "Go.",
      tone: "gate",
    });
    expect(
      describeEvent({
        kind: "gate.rejected",
        payload: { state: "Spec", to: "Intent", note: null },
      }),
    ).toMatchObject({
      text: "rejected the Spec Gate",
      detail: null,
      tone: "destructive",
    });
  });

  it("names the Labels, from the payload when it has them and from the map when it does not", () => {
    expect(
      describeEvent({
        kind: "issue.labels_changed",
        payload: {
          added: ["l1", "l2"],
          removed: [],
          addedNames: ["backend", "epic: Checkout"],
          removedNames: [],
        },
      })?.text,
    ).toBe("added Labels backend, epic: Checkout");
    expect(
      describeEvent({ kind: "issue.labels_changed", payload: { added: [], removed: ["l1"] } }, ctx)
        ?.text,
    ).toBe("removed the Label backend");
  });

  it("names the Assignee and the parent", () => {
    expect(
      describeEvent({ kind: "issue.assigned", payload: { from: "m-ada", to: "m-bob" } }, ctx)?.text,
    ).toBe("assigned it to Bob (was Ada)");
    expect(
      describeEvent({
        kind: "issue.assigned",
        payload: { from: null, to: "m-bob", toName: "Builder", byStateRule: true },
      })?.text,
    ).toBe("assigned it to Builder on entering the State");
    expect(
      describeEvent({ kind: "issue.assigned", payload: { from: "m-ada", to: null } }, ctx)?.text,
    ).toBe("unassigned it (was Ada)");
    expect(
      describeEvent({ kind: "issue.reparented", payload: { from: null, to: "x", toKey: "DEV-3" } })
        ?.text,
    ).toBe("set the parent to DEV-3");
  });

  it("gives Runs their words and folds their routine steps", () => {
    expect(
      describeEvent({
        kind: "run.started",
        payload: { trigger: "assignment" },
        actorKind: "agent",
      }),
    ).toMatchObject({
      text: "started a Run, by assignment",
      tone: "agent",
      routine: true,
    });
    expect(
      describeEvent({ kind: "run.failed", payload: { summary: "Tests timed out." } }),
    ).toMatchObject({
      text: "failed the Run",
      detail: "Tests timed out.",
      tone: "destructive",
      routine: false,
    });
    expect(describeEvent({ kind: "run.went_stale", payload: null })?.text).toBe("went quiet");
    expect(describeEvent({ kind: "run.activity", payload: {} })).toBeNull();
    expect(
      describeEvent({
        kind: "document.updated",
        payload: { name: "spec", version: 3 },
        actorKind: "agent",
      }),
    ).toMatchObject({
      text: "wrote spec v3",
      routine: true,
    });
  });

  it("reads the Workspace's own Events for the log", () => {
    expect(
      describeEvent({
        kind: "workflow.updated",
        payload: { states: ["Intent", "Build", "Done"], removed: 0 },
      })?.text,
    ).toBe("set the Workflow to Intent → Build → Done");
    expect(
      describeEvent({ kind: "agent.project_granted", payload: { projectKey: "DEV" } })?.text,
    ).toBe("granted DEV");
    expect(describeEvent({ kind: "member.joined", payload: { role: "admin" } })?.text).toBe(
      "joined as admin",
    );
    expect(describeEvent({ kind: "some.unknown", payload: {} })?.text).toBe("some.unknown");
  });
});
