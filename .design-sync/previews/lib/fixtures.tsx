// Sample data the authored previews share: a Workspace worth looking at, on
// example.com identities. Not a component (no PascalCase file name).
export const ada = {
  id: "mem_ada000000001",
  kind: "human" as const,
  handle: "ada",
  user: { name: "Ada Lovelace", image: null },
};
export const grace = {
  id: "mem_grace0000001",
  kind: "human" as const,
  handle: "grace",
  user: { name: "Grace Hopper", image: null },
};
export const planner = {
  id: "mem_planner00001",
  kind: "agent" as const,
  handle: "planner",
  user: { name: "Planner", image: null },
};
export const builder = {
  id: "mem_builder00001",
  kind: "agent" as const,
  handle: "builder",
  user: { name: "Builder", image: null },
};
export const suspendedAgent = {
  id: "mem_reviewer0001",
  kind: "agent" as const,
  handle: "reviewer",
  suspendedAt: "2026-08-30T10:00:00Z",
  user: { name: "Reviewer", image: null },
};
export const members = [ada, grace, planner, builder];

export const labels = {
  epic: { id: "lab_1", scope: "epic", name: "Agent loop", color: "#6265ed" },
  backend: { id: "lab_2", scope: null, name: "backend", color: "#008fba" },
  bug: { id: "lab_3", scope: "kind", name: "bug", color: "#d73246" },
  docs: { id: "lab_4", scope: null, name: "docs", color: "#239d6a" },
};

export const states = {
  backlog: { name: "Backlog", isGate: false, category: "backlog" as const },
  todo: { name: "Todo", isGate: false, category: "backlog" as const },
  inProgress: { name: "In progress", isGate: false, category: "active" as const },
  review: { name: "Review", isGate: true, category: "active" as const },
  done: { name: "Done", isGate: false, category: "done" as const },
};

export interface IssueRow {
  key: string;
  title: string;
  state: (typeof states)[keyof typeof states];
  assignee: (typeof members)[number] | null;
  labels: (typeof labels)[keyof typeof labels][];
  updated: string;
}

export const issues: IssueRow[] = [
  {
    key: "DEV-42",
    title: "Add ruling authority to Gate",
    state: states.review,
    assignee: ada,
    labels: [labels.epic],
    updated: "2h",
  },
  {
    key: "DEV-41",
    title: "Stream Events to the inbox without polling",
    state: states.inProgress,
    assignee: builder,
    labels: [labels.backend],
    updated: "4h",
  },
  {
    key: "DEV-40",
    title: "Sponsor can suspend an Agent from its page",
    state: states.inProgress,
    assignee: planner,
    labels: [labels.epic, labels.backend],
    updated: "1d",
  },
  {
    key: "DEV-39",
    title: "Issue key is not monospace in the side peek",
    state: states.todo,
    assignee: grace,
    labels: [labels.bug],
    updated: "2d",
  },
  {
    key: "DEV-38",
    title: "Write the agent loop walkthrough",
    state: states.backlog,
    assignee: null,
    labels: [labels.docs],
    updated: "3d",
  },
  {
    key: "DEV-37",
    title: "Board columns fold below 1280px",
    state: states.done,
    assignee: ada,
    labels: [labels.bug],
    updated: "5d",
  },
];
