import { describe, expect, it } from "vite-plus/test";
import type { BoardIssue } from "../src/components/issue-board.tsx";
import { stateGrouping } from "../src/lib/groupings.tsx";
import { foldStates } from "../src/lib/states.ts";

const projects = [
  {
    id: "p-dev",
    key: "DEV",
    states: [
      { id: "d-intent", name: "Intent", isGate: true, category: "backlog" },
      { id: "d-build", name: "Build", isGate: false, category: "active" },
      { id: "d-done", name: "Done", isGate: false, category: "done" },
    ],
  },
  {
    id: "p-ops",
    key: "OPS",
    states: [
      { id: "o-todo", name: "Todo", isGate: false, category: "backlog" },
      { id: "o-build", name: "Build", isGate: false, category: "active" },
      { id: "o-done", name: "Done", isGate: false, category: "done" },
    ],
  },
];

function issue(key: string, projectId: string, state: BoardIssue["state"]): BoardIssue {
  return {
    id: key,
    key,
    title: key,
    projectId,
    state,
    assignee: null,
    labels: [],
    updatedAt: new Date(),
  };
}

const build = { id: "d-build", name: "Build", isGate: false, category: "active" };
const grouping = () => stateGrouping(foldStates(projects));

describe("the State grouping", () => {
  it("orders its buckets by the Workflow, not by the alphabet", () => {
    const buckets = grouping().buckets([]);

    expect(buckets.map((bucket) => bucket.name)).toEqual(["Intent", "Todo", "Build", "Done"]);
  });

  it("keeps a bucket with no Issues in it, which is a column the board still draws", () => {
    const buckets = grouping().buckets([issue("DEV-1", "p-dev", build)]);

    expect(buckets.find((bucket) => bucket.name === "Todo")?.rows).toEqual([]);
    expect(buckets.every((bucket) => bucket.keepWhenEmpty)).toBe(true);
  });

  it("gives a State no Workflow names a bucket of its own, last", () => {
    const stale = issue("DEV-9", "p-dev", {
      id: "d-gone",
      name: "Triage",
      isGate: false,
      category: "active",
    });

    const buckets = grouping().buckets([stale]);

    // Last, so an Issue nobody's Workflow explains is still shown.
    expect(buckets.at(-1)?.name).toBe("Triage");
    expect(buckets.at(-1)?.rows.map((row) => row.key)).toEqual(["DEV-9"]);
  });

  it("folds Done shut to begin with, because Done is the past", () => {
    const byName = new Map(
      grouping()
        .buckets([])
        .map((bucket) => [bucket.name, bucket]),
    );

    expect(byName.get("Done")?.collapsedByDefault).toBe(true);
    expect(byName.get("Build")?.collapsedByDefault).toBe(false);
  });

  it("plans a drop into the same-named State of the card's own Project", () => {
    const buckets = grouping().buckets([]);
    const toBuild = buckets.find((bucket) => bucket.name === "Build")!;
    const opsTodo = issue("OPS-4", "p-ops", {
      id: "o-todo",
      name: "Todo",
      isGate: false,
      category: "backlog",
    });

    expect(toBuild.plan!(opsTodo)).toEqual({ kind: "move", stateId: "o-build" });
  });

  it("refuses a State the card's Project does not have, and names it", () => {
    const toIntent = grouping()
      .buckets([])
      .find((bucket) => bucket.name === "Intent")!;
    const opsTodo = issue("OPS-4", "p-ops", {
      id: "o-todo",
      name: "Todo",
      isGate: false,
      category: "backlog",
    });

    expect(toIntent.plan!(opsTodo)).toEqual({
      kind: "refused",
      message: 'OPS has no "Intent" State',
    });
  });

  it("sends a card leaving a Gate to the ruling instead of moving it", () => {
    const toBuild = grouping()
      .buckets([])
      .find((bucket) => bucket.name === "Build")!;
    const atAGate = issue("DEV-1", "p-dev", {
      id: "d-intent",
      name: "Intent",
      isGate: true,
      category: "backlog",
    });

    expect(toBuild.plan!(atAGate)).toEqual({ kind: "gate" });
  });
});
