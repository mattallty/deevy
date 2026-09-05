/**
 * Fixture data for the round-2 mockups (/dev/mockups/*, docs/plans/ui-redesign-2.md):
 * a Workspace small enough to read at a glance and varied enough to show every
 * kind of row. Nothing here reaches the API; the mockup routes are deleted once
 * Matt has picked, and this file with them.
 */
import type { ChipMember } from "@/components/member-chip";

export const ada: ChipMember = {
  id: "m-ada",
  kind: "human",
  handle: "ada",
  user: { name: "Ada Lovelace" },
};
export const grace: ChipMember = {
  id: "m-grace",
  kind: "human",
  handle: "grace",
  user: { name: "Grace Hopper" },
};
export const planner: ChipMember = {
  id: "m-planner",
  kind: "agent",
  handle: "planner",
  user: { name: "Planner" },
};
export const builder: ChipMember = {
  id: "m-builder",
  kind: "agent",
  handle: "builder",
  user: { name: "Builder" },
};
export const members = [ada, grace, planner, builder];

export type FixtureCategory = "backlog" | "active" | "done";
export interface FixtureState {
  id: string;
  name: string;
  isGate: boolean;
  category: FixtureCategory;
  /** Which Projects have a State of this name (for a folded, cross-Project column). */
  projects: string[];
}
export const states: FixtureState[] = [
  { id: "s-intent", name: "Intent", isGate: true, category: "backlog", projects: ["DEV"] },
  { id: "s-todo", name: "Todo", isGate: false, category: "backlog", projects: ["OPS"] },
  { id: "s-spec", name: "Spec", isGate: true, category: "active", projects: ["DEV"] },
  { id: "s-build", name: "Build", isGate: false, category: "active", projects: ["DEV", "OPS"] },
  { id: "s-review", name: "Review", isGate: true, category: "active", projects: ["DEV"] },
  { id: "s-done", name: "Done", isGate: false, category: "done", projects: ["DEV", "OPS"] },
];

export interface FixtureIssue {
  key: string;
  title: string;
  project: { key: string; name: string };
  state: FixtureState;
  assignee: ChipMember | null;
  labels: Array<{ id: string; name: string; scope: string | null }>;
  updated: string;
}
const dev = { key: "DEV", name: "deevy" };
const ops = { key: "OPS", name: "Operations" };
const S = Object.fromEntries(states.map((state) => [state.name, state])) as Record<
  string,
  FixtureState
>;
export const issues: FixtureIssue[] = [
  {
    key: "DEV-12",
    title: "Ship the Event log view",
    project: dev,
    state: S.Intent!,
    assignee: planner,
    labels: [
      { id: "l1", name: "Checkout rewrite", scope: "epic" },
      { id: "l2", name: "backend", scope: null },
    ],
    updated: "2h",
  },
  {
    key: "DEV-14",
    title: "Slack approve buttons on Gate messages",
    project: dev,
    state: S.Intent!,
    assignee: planner,
    labels: [{ id: "l3", name: "slack", scope: null }],
    updated: "3h",
  },
  {
    key: "DEV-9",
    title: "Retry webhook deliveries with backoff",
    project: dev,
    state: S.Build!,
    assignee: builder,
    labels: [{ id: "l2", name: "backend", scope: null }],
    updated: "20m",
  },
  {
    key: "DEV-6",
    title: "Four-eyes Gates: a Gate may require two rulings",
    project: dev,
    state: S.Spec!,
    assignee: ada,
    labels: [{ id: "l4", name: "Agent loop", scope: "epic" }],
    updated: "1d",
  },
  {
    key: "DEV-4",
    title: "Checkout: write down what a refund actually does",
    project: dev,
    state: S.Review!,
    assignee: grace,
    labels: [
      { id: "l1", name: "Checkout rewrite", scope: "epic" },
      { id: "l5", name: "docs", scope: null },
    ],
    updated: "4h",
  },
  {
    key: "OPS-4",
    title: "Move the Worker deploy off a laptop",
    project: ops,
    state: S.Todo!,
    assignee: null,
    labels: [],
    updated: "2d",
  },
  {
    key: "OPS-3",
    title: "Extend release.yml's tag pattern past v0.4.*",
    project: ops,
    state: S.Build!,
    assignee: builder,
    labels: [{ id: "l2", name: "backend", scope: null }],
    updated: "5h",
  },
  {
    key: "OPS-1",
    title: "Rotate the deploy token",
    project: ops,
    state: S.Done!,
    assignee: grace,
    labels: [],
    updated: "3d",
  },
];

/** What a precise Notification says: actor, verb, object, and what was written, if anything. */
export interface FixtureNotification {
  id: string;
  kind:
    | "mention"
    | "assignment"
    | "gate_awaiting"
    | "run_awaiting_input"
    | "run_finished"
    | "run_answered";
  actor: ChipMember | null;
  issue: FixtureIssue;
  /** The sentence without the actor, e.g. "rejected the Spec Gate". */
  verb: string;
  /** A quote from the comment, note, question or summary. */
  excerpt: string | null;
  tone: "human" | "agent" | "gate" | "muted" | "destructive";
  ago: string;
  read: boolean;
}
export const notifications: FixtureNotification[] = [
  {
    id: "n1",
    kind: "gate_awaiting",
    actor: grace,
    issue: issues[3]!,
    verb: "rejected the Spec Gate",
    excerpt:
      "Refund path is missing the ledger write. Please add it to the spec before this goes on.",
    tone: "gate",
    ago: "12m",
    read: false,
  },
  {
    id: "n2",
    kind: "run_awaiting_input",
    actor: builder,
    issue: issues[2]!,
    verb: "asks a question",
    excerpt:
      "Which retry policy do you want: exponential with jitter, or fixed 30s? The webhook doc does not say.",
    tone: "agent",
    ago: "35m",
    read: false,
  },
  {
    id: "n3",
    kind: "mention",
    actor: ada,
    issue: issues[4]!,
    verb: "mentioned you",
    excerpt:
      "@matthias can you rule on this before Friday? Grace already reviewed the ledger part.",
    tone: "human",
    ago: "1h",
    read: false,
  },
  {
    id: "n4",
    kind: "gate_awaiting",
    actor: planner,
    issue: issues[0]!,
    verb: "moved it into the Intent Gate",
    excerpt: null,
    tone: "gate",
    ago: "2h",
    read: false,
  },
  {
    id: "n5",
    kind: "run_finished",
    actor: builder,
    issue: issues[6]!,
    verb: "finished a Run",
    excerpt: "Wrote plan v2. Two open questions in the plan Document.",
    tone: "agent",
    ago: "5h",
    read: true,
  },
  {
    id: "n6",
    kind: "assignment",
    actor: ada,
    issue: issues[3]!,
    verb: "assigned it to you",
    excerpt: null,
    tone: "human",
    ago: "1d",
    read: true,
  },
  {
    id: "n7",
    kind: "run_finished",
    actor: builder,
    issue: issues[2]!,
    verb: "failed a Run",
    excerpt: "The runtime stopped: tests timed out after 10 minutes.",
    tone: "destructive",
    ago: "1d",
    read: true,
  },
];

/** One Issue's Activity, as the precise sentences slice D will produce. */
export interface FixtureActivity {
  id: string;
  at: string;
  day: string;
  actor: ChipMember | null;
  kind: "comment" | "event" | "gate" | "run";
  tone: "human" | "agent" | "gate" | "muted" | "destructive";
  text: string;
  detail?: string;
  body?: string;
}
export const activity: FixtureActivity[] = [
  {
    id: "a1",
    at: "10:02",
    day: "Tuesday",
    actor: ada,
    kind: "event",
    tone: "muted",
    text: "created this Issue",
  },
  {
    id: "a2",
    at: "10:03",
    day: "Tuesday",
    actor: ada,
    kind: "event",
    tone: "muted",
    text: "added Labels epic: Checkout rewrite, backend",
  },
  {
    id: "a3",
    at: "10:04",
    day: "Tuesday",
    actor: ada,
    kind: "event",
    tone: "muted",
    text: "assigned it to Planner (was unassigned)",
  },
  {
    id: "a4",
    at: "10:04",
    day: "Tuesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "started a Run, by assignment",
  },
  {
    id: "a5",
    at: "10:06",
    day: "Tuesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "wrote intent v1",
  },
  {
    id: "a6",
    at: "10:07",
    day: "Tuesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "wrote intent v2",
  },
  {
    id: "a7",
    at: "10:07",
    day: "Tuesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "finished the Run",
    detail: "Intent drafted; one assumption about refunds flagged.",
  },
  {
    id: "a8",
    at: "14:30",
    day: "Tuesday",
    actor: grace,
    kind: "comment",
    tone: "human",
    text: "commented",
    body: "The refund path is the risky part. @ada do we return the fee too? The intent should say.",
  },
  {
    id: "a9",
    at: "15:12",
    day: "Tuesday",
    actor: ada,
    kind: "comment",
    tone: "human",
    text: "commented",
    body: "We return the fee. Adding it to the intent now.",
  },
  {
    id: "a10",
    at: "15:20",
    day: "Tuesday",
    actor: ada,
    kind: "event",
    tone: "muted",
    text: "wrote intent v3",
  },
  {
    id: "a11",
    at: "09:15",
    day: "Wednesday",
    actor: grace,
    kind: "gate",
    tone: "gate",
    text: "approved the Intent Gate → Spec",
    detail: "Fee refund covered. Go.",
  },
  {
    id: "a12",
    at: "09:15",
    day: "Wednesday",
    actor: null,
    kind: "event",
    tone: "muted",
    text: "opened the spec Document",
  },
  {
    id: "a13",
    at: "09:16",
    day: "Wednesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "started a Run, by entering Spec",
  },
  {
    id: "a14",
    at: "09:40",
    day: "Wednesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "is waiting on a Human",
    detail: "Should the ledger write be synchronous, or may it lag by up to a minute?",
  },
  {
    id: "a15",
    at: "11:02",
    day: "Wednesday",
    actor: ada,
    kind: "event",
    tone: "human",
    text: "answered the Run",
    detail: "Synchronous. A refund that is not in the ledger did not happen.",
  },
  {
    id: "a16",
    at: "11:45",
    day: "Wednesday",
    actor: planner,
    kind: "run",
    tone: "agent",
    text: "finished the Run",
    detail: "Spec v1 written; ledger write is synchronous.",
  },
  {
    id: "a17",
    at: "16:00",
    day: "Wednesday",
    actor: grace,
    kind: "gate",
    tone: "destructive",
    text: "rejected the Spec Gate",
    detail: "Refund path is missing the ledger write. Please add it before this goes on.",
  },
];
