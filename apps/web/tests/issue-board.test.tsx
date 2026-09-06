import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import {
  IssueBoardView,
  groupIntoColumns,
  planDrop,
  type BoardColumn,
  type BoardIssue,
} from "../src/components/issue-board.tsx";
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

describe("foldStates", () => {
  it("folds same-named States across Projects and remembers each Project's id", () => {
    const folded = foldStates(projects);
    expect(folded.map((state) => state.name)).toEqual(["Intent", "Todo", "Build", "Done"]);
    const build = folded.find((state) => state.name === "Build")!;
    expect(build.byProject.get("p-dev")).toBe("d-build");
    expect(build.byProject.get("p-ops")).toBe("o-build");
    expect(folded.find((state) => state.name === "Intent")!.byProject.has("p-ops")).toBe(false);
  });

  it("keeps one Project's States alone when asked", () => {
    expect(foldStates(projects, "OPS").map((state) => state.name)).toEqual([
      "Todo",
      "Build",
      "Done",
    ]);
  });
});

describe("planDrop", () => {
  const columns: BoardColumn[] = foldStates(projects).map((state) => ({
    id: state.name,
    name: state.name,
    isGate: state.isGate,
    category: state.category,
    resolveTarget: (card) => state.byProject.get(card.projectId) ?? null,
  }));
  const column = (name: string) => columns.find((candidate) => candidate.name === name)!;
  const opsTodo = issue("OPS-4", "p-ops", {
    id: "o-todo",
    name: "Todo",
    isGate: false,
    category: "backlog",
  });
  const devIntent = issue("DEV-1", "p-dev", {
    id: "d-intent",
    name: "Intent",
    isGate: true,
    category: "backlog",
  });

  it("moves into the same-named State of the Issue's own Project", () => {
    expect(planDrop(opsTodo, "Todo", column("Build"))).toEqual({
      kind: "move",
      stateId: "o-build",
    });
  });

  it("refuses a column the Issue's Project has no State for, and says so", () => {
    expect(planDrop(opsTodo, "Todo", column("Intent"))).toEqual({
      kind: "refused",
      message: 'OPS has no "Intent" State',
    });
  });

  it("opens the ruling instead of moving a card out of a Gate", () => {
    expect(planDrop(devIntent, "Intent", column("Build"))).toEqual({ kind: "gate" });
  });

  it("does nothing for a drop back into the same column", () => {
    expect(planDrop(opsTodo, "Todo", column("Todo"))).toEqual({ kind: "none" });
  });
});

describe("groupIntoColumns", () => {
  it("puts every card under its column, newest change first, and keeps empty columns", () => {
    const columns = foldStates(projects).map((state) => ({
      id: state.name,
      name: state.name,
      isGate: state.isGate,
      category: state.category,
      resolveTarget: () => null,
    }));
    const older = {
      ...issue("DEV-2", "p-dev", {
        id: "d-build",
        name: "Build",
        isGate: false,
        category: "active",
      }),
      updatedAt: new Date(1),
    };
    const newer = {
      ...issue("OPS-3", "p-ops", {
        id: "o-build",
        name: "Build",
        isGate: false,
        category: "active",
      }),
      updatedAt: new Date(2),
    };
    const grouped = groupIntoColumns(columns, [older, newer], (card) => card.state.name);
    expect(grouped.Build!.map((card) => card.key)).toEqual(["OPS-3", "DEV-2"]);
    expect(grouped.Intent).toEqual([]);
  });
});

describe("IssueBoardView", () => {
  it("draws every column at full strength: nothing is disabled just because columns stay put", () => {
    const columns: BoardColumn[] = foldStates(projects).map((state) => ({
      id: state.name,
      name: state.name,
      isGate: state.isGate,
      category: state.category,
      resolveTarget: (card) => state.byProject.get(card.projectId) ?? null,
    }));
    const value = groupIntoColumns(
      columns,
      [
        issue("DEV-1", "p-dev", {
          id: "d-build",
          name: "Build",
          isGate: false,
          category: "active",
        }),
      ],
      (card) => card.state.name,
    );
    render(
      <IssueBoardView
        columns={columns}
        value={value}
        onOpen={() => {}}
        onDecide={() => {}}
        onDrop={() => {}}
      />,
    );
    for (const name of ["Intent", "Build"]) {
      const column = screen.getByRole("region", { name });
      expect(column.classList.contains("opacity-50")).toBe(false);
      expect(column.hasAttribute("data-disabled")).toBe(false);
    }
    expect(screen.getAllByText("DEV-1").length).toBeGreaterThan(0);
  });
});
