import { describe, expect, it } from "vite-plus/test";
import type { BoardIssue } from "../src/components/issue-board.tsx";
import {
  assigneeGrouping,
  labelScopeGrouping,
  projectGrouping,
  stateGrouping,
} from "../src/lib/groupings.tsx";
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

function issue(
  key: string,
  projectId: string,
  state: BoardIssue["state"],
  assignee: BoardIssue["assignee"] = null,
): BoardIssue {
  return {
    id: key,
    key,
    title: key,
    projectId,
    state,
    assignee,
    labels: [],
    updatedAt: new Date(),
  };
}

const ada = { id: "m-ada", kind: "human" as const, user: { name: "Ada Lovelace" } };
const grace = { id: "m-grace", kind: "human" as const, user: { name: "Grace Hopper" } };
const planner = { id: "m-planner", kind: "agent" as const, user: { name: "Planner" } };

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

describe("the Assignee grouping", () => {
  const members = [planner, grace, ada];

  it("puts the Humans first, then the Agents, then what nobody holds", () => {
    const buckets = assigneeGrouping(members).buckets([]);

    expect(buckets.map((bucket) => bucket.name)).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
      "Planner",
      "Unassigned",
    ]);
  });

  it("keeps a Member holding nothing, so a board has a column to drop onto", () => {
    const buckets = assigneeGrouping(members).buckets([issue("DEV-1", "p-dev", build, ada)]);

    expect(buckets.find((bucket) => bucket.name === "Grace Hopper")?.rows).toEqual([]);
    expect(buckets.every((bucket) => bucket.keepWhenEmpty)).toBe(true);
  });

  it("gives a Member nobody lists a bucket while they still hold an Issue", () => {
    const gone = { id: "m-gone", kind: "human" as const, user: { name: "Suspended Soul" } };

    const buckets = assigneeGrouping(members).buckets([issue("DEV-2", "p-dev", build, gone)]);

    expect(buckets.find((bucket) => bucket.name === "Suspended Soul")?.rows.length).toBe(1);
  });

  it("plans a drop as a reassignment, and Unassigned as taking it off them", () => {
    const buckets = assigneeGrouping(members).buckets([]);
    const held = issue("DEV-1", "p-dev", build, ada);

    expect(buckets.find((bucket) => bucket.name === "Planner")!.plan!(held)).toEqual({
      kind: "assign",
      memberId: "m-planner",
    });
    expect(buckets.find((bucket) => bucket.name === "Unassigned")!.plan!(held)).toEqual({
      kind: "assign",
      memberId: null,
    });
  });

  it("does not send a card out of a Gate to the ruling: reassigning is not moving", () => {
    const atAGate = issue(
      "DEV-3",
      "p-dev",
      { id: "d-intent", name: "Intent", isGate: true, category: "backlog" },
      ada,
    );

    const toPlanner = assigneeGrouping(members)
      .buckets([])
      .find((bucket) => bucket.name === "Planner")!;

    expect(toPlanner.plan!(atAGate)).toEqual({ kind: "assign", memberId: "m-planner" });
  });
});

describe("the Project grouping", () => {
  const projectRows = [
    { id: "p-dev", key: "DEV", name: "deevy" },
    { id: "p-ops", key: "OPS", name: "Operations" },
  ];

  it("orders its buckets by Project key", () => {
    const buckets = projectGrouping([...projectRows].reverse()).buckets([]);

    expect(buckets.map((bucket) => bucket.name)).toEqual(["deevy", "Operations"]);
  });

  it("takes no cards, and says why rather than naming the Project at you", () => {
    const buckets = projectGrouping(projectRows).buckets([issue("DEV-1", "p-dev", build)]);

    expect(buckets.every((bucket) => bucket.plan === undefined)).toBe(true);
    expect(
      buckets.every((bucket) => bucket.refusal === "An Issue belongs to the Project its key names"),
    ).toBe(true);
  });
});

describe("a Label scope as a grouping", () => {
  const labels = [
    { id: "l-loop", name: "Agent loop", scope: "epic", color: "#38bdf8" },
    { id: "l-checkout", name: "Checkout rewrite", scope: "epic", color: "#fb7185" },
    { id: "l-high", name: "high", scope: "priority", color: "#f59e0b" },
    { id: "l-backend", name: "backend", scope: null, color: "#a78bfa" },
  ];
  const epic = () => labelScopeGrouping("epic", labels);
  let next = 0;
  const carrying = (...held: string[]) => ({
    ...issue(`DEV-${String(++next)}`, "p-dev", build),
    labels: labels.filter((label) => held.includes(label.id)),
  });

  it("is one bucket per Label in the scope, and one for the Issues without", () => {
    const buckets = epic().buckets([]);

    expect(buckets.map((bucket) => bucket.name)).toEqual([
      "epic: Agent loop",
      "epic: Checkout rewrite",
      "No epic",
    ]);
  });

  it("puts every Issue in exactly one bucket, whatever else it carries", () => {
    const rows = [carrying("l-loop", "l-high"), carrying("l-backend"), carrying("l-checkout")];

    const buckets = epic().buckets(rows);

    expect(buckets.map((bucket) => bucket.rows.length)).toEqual([1, 1, 1]);
    expect(buckets.reduce((total, bucket) => total + bucket.rows.length, 0)).toBe(rows.length);
  });

  it("ignores Labels of another scope, and unscoped ones, when bucketing", () => {
    const buckets = epic().buckets([carrying("l-high", "l-backend")]);

    expect(buckets.find((bucket) => bucket.name === "No epic")?.rows.length).toBe(1);
  });

  it("swaps the scope's Label on a drop and keeps every other one", () => {
    const held = carrying("l-loop", "l-high", "l-backend");

    const toCheckout = epic()
      .buckets([])
      .find((bucket) => bucket.name === "epic: Checkout rewrite")!;

    expect(toCheckout.plan!(held)).toEqual({
      kind: "labels",
      labelIds: ["l-high", "l-backend", "l-checkout"],
    });
  });

  it("takes the scope's Label off entirely for the bucket that has none", () => {
    const held = carrying("l-loop", "l-high");

    const toNone = epic()
      .buckets([])
      .find((bucket) => bucket.name === "No epic")!;

    expect(toNone.plan!(held)).toEqual({ kind: "labels", labelIds: ["l-high"] });
  });
});
