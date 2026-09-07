import type { ReactNode } from "react";
import { LabelBadge } from "@/components/label-badge";
import { MemberChip, type ChipMember } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import type { DropPlan } from "@/components/issue-board";
import { labelText } from "@/lib/labels";
import { categoryOrder, foldStates, type FoldedState, type StateCategory } from "@/lib/states";

/**
 * The least an Issue has to carry to be grouped. Both the list's rows (the
 * oRPC type) and the board's cards satisfy it, so one grouping serves both.
 */
export interface GroupableIssue {
  key: string;
  projectId: string;
  state: { id: string; name: string; isGate: boolean; category: string };
  assignee: { id: string; kind: "human" | "agent"; user: { name: string } } | null;
  labels: Array<{ id: string; name: string; scope: string | null; color: string }>;
}

/**
 * One bucket of a grouping: a group of rows in the list, a column on the board.
 * The two views draw the same buckets, which is the whole point — a grouping is
 * added by writing one object, not by editing either view.
 */
export interface GroupBucket<T extends GroupableIssue = GroupableIssue> {
  id: string;
  /** What a test reads and a board column is named by. */
  name: string;
  /** What the header draws: a StateBadge, a MemberChip, a LabelBadge, a key. */
  header: ReactNode;
  rows: T[];
  /** A board keeps an empty column; a list drops an empty group. */
  keepWhenEmpty?: boolean;
  /** Done is the past, so its group arrives folded. */
  collapsedByDefault?: boolean;
  /** The Gate tint, which only the State grouping has any business asking for. */
  isGate?: boolean;
  /**
   * What a drop into this bucket means, decided before anything is written.
   * Absent, the board takes no cards here and says `refusal` — grouping by
   * Project is the case: an Issue belongs to the Project its key names.
   */
  plan?: (issue: GroupableIssue) => DropPlan;
  /** Why this bucket takes no cards, in a sentence. Only read without a `plan`. */
  refusal?: string;
}

/** One way to divide a list of Issues. `id` is what rides in `?group=`. */
export interface Grouping {
  id: string;
  /** What the Group by control says: "State", "Assignee", "epic". */
  label: string;
  buckets<T extends GroupableIssue>(rows: T[]): GroupBucket<T>[];
}

/** The bucket for an Issue nobody holds. Not "", which is a legitimate id. */
export const UNASSIGNED = "__unassigned";

/** The bucket for an Issue carrying no Label of the scope being grouped by. */
const NO_LABEL = "__no-label:";

/** Rows in the order they arrived, bucketed by a key each one answers to. */
function bucketBy<T extends GroupableIssue>(rows: T[], keyOf: (row: T) => string) {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }
  return buckets;
}

/**
 * By State — the grouping the views were built around, and the only one whose
 * buckets fold across Projects: on a Workspace-wide screen every Project's
 * "Build" is one bucket, and a drop lands in the Build of the card's own
 * Project (`lib/states.ts`). A State a row is in that no Workflow names still
 * gets a bucket, so no Issue goes unshown by a stale cache or a race.
 */
export function stateGrouping(folded: FoldedState[]): Grouping {
  const order = new Map(folded.map((state, index) => [state.name, index]));

  return {
    id: "state",
    label: "State",
    buckets<T extends GroupableIssue>(rows: T[]) {
      const held = bucketBy(rows, (row) => row.state.name);
      const known = new Map(folded.map((state) => [state.name, state]));
      const names = [...new Set([...folded.map((state) => state.name), ...held.keys()])];

      return names
        .sort(
          (a, b) =>
            (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) ||
            a.localeCompare(b),
        )
        .map((name) => {
          const rowsHere = held.get(name) ?? [];
          const state = known.get(name);
          const first = rowsHere[0]?.state;
          const isGate = state?.isGate ?? first?.isGate ?? false;
          const category: StateCategory =
            state?.category ??
            ((first && first.category in categoryOrder
              ? first.category
              : "active") as StateCategory);
          return {
            id: name,
            name,
            header: <StateBadge state={{ name, isGate, category }} />,
            rows: rowsHere,
            keepWhenEmpty: true,
            collapsedByDefault: category === "done",
            isGate,
            // A Gate is left by a ruling, never by a drop — which is a rule
            // about moving between States and about nothing else, so it lives
            // here rather than in the board.
            plan: (issue) => {
              if (issue.state.isGate) return { kind: "gate" };
              const stateId = state?.byProject.get(issue.projectId) ?? null;
              if (!stateId) {
                const projectKey = issue.key.split("-")[0] ?? issue.key;
                return { kind: "refused", message: `${projectKey} has no "${name}" State` };
              }
              return { kind: "move", stateId };
            },
          };
        });
    },
  };
}

/**
 * By State on a screen that is one Project's, where there is nothing to fold:
 * a bucket is a State, and a drop lands in exactly it. The Project's own
 * Workflow says which States exist, including the ones holding nothing.
 */
export function projectStateGrouping(
  states: Array<{ id: string; name: string; isGate: boolean; category: string }>,
): Grouping {
  const order = new Map(states.map((state, index) => [state.id, index]));

  return {
    id: "state",
    label: "State",
    buckets<T extends GroupableIssue>(rows: T[]) {
      const held = bucketBy(rows, (row) => row.state.id);
      const known = new Map(states.map((state) => [state.id, state]));
      const ids = [...new Set([...states.map((state) => state.id), ...held.keys()])];

      return ids
        .sort(
          (a, b) =>
            (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((id) => {
          const rowsHere = held.get(id) ?? [];
          const state = known.get(id) ?? rowsHere[0]!.state;
          const category = (
            state.category in categoryOrder ? state.category : "active"
          ) as StateCategory;
          return {
            id,
            name: state.name,
            header: <StateBadge state={{ name: state.name, isGate: state.isGate, category }} />,
            rows: rowsHere,
            keepWhenEmpty: true,
            collapsedByDefault: category === "done",
            isGate: state.isGate,
            plan: (issue: GroupableIssue): DropPlan =>
              issue.state.isGate ? { kind: "gate" } : { kind: "move", stateId: id },
          };
        });
    },
  };
}

/**
 * By Assignee: the Humans first, then the Agents, then whatever nobody holds.
 * Every Member gets a bucket even holding nothing, so a board has a column to
 * drop onto — the list throws the empty ones away.
 */
export function assigneeGrouping(members: ChipMember[]): Grouping {
  const rank = (member: ChipMember) => (member.kind === "agent" ? 1 : 0);
  const ordered = [...members].sort(
    (a, b) => rank(a) - rank(b) || a.user.name.localeCompare(b.user.name),
  );

  return {
    id: "assignee",
    label: "Assignee",
    buckets<T extends GroupableIssue>(rows: T[]) {
      const held = bucketBy(rows, (row) => row.assignee?.id ?? UNASSIGNED);
      // A Member nobody lists but who holds an Issue still gets a bucket: a
      // suspended one keeps their work until somebody takes it off them.
      const listed = new Set(ordered.map((member) => member.id));
      const strays = rows
        .map((row) => row.assignee)
        .filter((assignee): assignee is NonNullable<typeof assignee> =>
          Boolean(assignee && !listed.has(assignee.id)),
        );
      const byId = new Map<string, ChipMember>();
      for (const member of [...ordered, ...(strays as ChipMember[])]) {
        if (!byId.has(member.id)) byId.set(member.id, member);
      }

      const buckets: GroupBucket<T>[] = [...byId.values()].map((member) => ({
        id: member.id,
        name: member.user.name,
        header: <MemberChip member={member} size="xs" />,
        rows: held.get(member.id) ?? [],
        keepWhenEmpty: true,
        plan: (): DropPlan => ({ kind: "assign", memberId: member.id }),
      }));

      buckets.push({
        id: UNASSIGNED,
        name: "Unassigned",
        header: <span className="text-sm text-muted-foreground">Unassigned</span>,
        rows: held.get(UNASSIGNED) ?? [],
        keepWhenEmpty: true,
        plan: (): DropPlan => ({ kind: "assign", memberId: null }),
      });
      return buckets;
    },
  };
}

/**
 * By Project. Read-only on a board: there is no operation that moves an Issue
 * between Projects, and its key names the one it belongs to, so a column takes
 * no cards and says so rather than pretending to be disabled.
 */
export function projectGrouping(
  projects: Array<{ id: string; key: string; name: string }>,
): Grouping {
  const ordered = [...projects].sort((a, b) => a.key.localeCompare(b.key));

  return {
    id: "project",
    label: "Project",
    buckets<T extends GroupableIssue>(rows: T[]) {
      const held = bucketBy(rows, (row) => row.projectId);
      const known = new Map(ordered.map((project) => [project.id, project]));
      const ids = [...new Set([...ordered.map((project) => project.id), ...held.keys()])];

      return ids.map((id) => {
        const project = known.get(id);
        const name = project?.name ?? id;
        return {
          id,
          name,
          refusal: "An Issue belongs to the Project its key names",
          header: (
            <span className="flex items-center gap-2 text-sm">
              {project ? (
                <span className="font-mono text-xs text-muted-foreground">{project.key}</span>
              ) : null}
              <span className="font-medium">{name}</span>
            </span>
          ),
          rows: held.get(id) ?? [],
          keepWhenEmpty: true,
        };
      });
    },
  };
}

interface ScopedLabel {
  id: string;
  name: string;
  scope: string | null;
  color: string;
}

/**
 * By one scope of Label — `epic`, `area` — and never by Labels at large. An
 * Issue carries at most one Label per scope, so a scope divides the Issues
 * exactly once each: every Issue lands in one bucket, `No epic` included, a
 * count is a count, and a board can take a drop. Grouping by individual Labels
 * would put one Issue in several columns at once (Matt, 2026-09-07).
 */
export function labelScopeGrouping(scope: string, labels: ScopedLabel[]): Grouping {
  const inScope = labels.filter((label) => label.scope === scope);
  const none = `${NO_LABEL}${scope}`;

  return {
    id: `label:${scope}`,
    label: scope,
    buckets<T extends GroupableIssue>(rows: T[]) {
      const held = bucketBy(
        rows,
        (row) => row.labels.find((label) => label.scope === scope)?.id ?? none,
      );
      /** The Labels this Issue keeps: all of them but this scope's. */
      const others = (issue: GroupableIssue) =>
        issue.labels.filter((label) => label.scope !== scope).map((label) => label.id);

      const buckets: GroupBucket<T>[] = inScope.map((label) => ({
        id: label.id,
        name: labelText(label),
        header: <LabelBadge label={label} />,
        rows: held.get(label.id) ?? [],
        keepWhenEmpty: true,
        plan: (issue: GroupableIssue): DropPlan => ({
          kind: "labels",
          labelIds: [...others(issue), label.id],
        }),
      }));

      buckets.push({
        id: none,
        name: `No ${scope}`,
        header: <span className="text-sm text-muted-foreground">No {scope}</span>,
        rows: held.get(none) ?? [],
        keepWhenEmpty: true,
        plan: (issue: GroupableIssue): DropPlan => ({ kind: "labels", labelIds: others(issue) }),
      });
      return buckets;
    },
  };
}

export interface GroupingContext {
  /**
   * One Project's Workflow. Given, the State grouping is that Workflow's, with
   * nothing folded — a Project's Board knows exactly which States it has, and
   * asking the Workspace's Projects for them would be a second query to learn
   * something it already loaded.
   */
  workflowStates?: Array<{ id: string; name: string; isGate: boolean; category: string }>;
  /** Every Project the screen may show, for a State grouping folded by name. */
  projects?: Array<{ id: string; key: string; name: string; states?: unknown }>;
  /** Named, only that Project's States are folded in. */
  projectKey?: string;
  /** For grouping by Assignee: every Member the screen may show. */
  members?: ChipMember[];
  /** For grouping by a Label scope: every Label this Workspace defines. */
  labels?: ScopedLabel[];
}

/**
 * Every grouping a screen may offer, in the order the control lists them. The
 * first is what a screen falls back to when the URL names one it does not have.
 */
export function groupingsFor(context: GroupingContext): Grouping[] {
  const state = context.workflowStates
    ? projectStateGrouping(context.workflowStates)
    : stateGrouping(
        foldStates(
          (context.projects ?? []) as Parameters<typeof foldStates>[0],
          context.projectKey,
        ),
      );
  const groupings: Grouping[] = [state, assigneeGrouping(context.members ?? [])];
  // Not on a screen that is one Project's: every Issue on it is that Project's.
  const oneProject = Boolean(context.workflowStates || context.projectKey);
  if (!oneProject && (context.projects?.length ?? 0) > 1) {
    groupings.push(projectGrouping(context.projects ?? []));
  }
  // One grouping per scope in use, in the order the Labels come back.
  const scopes: string[] = [];
  for (const label of context.labels ?? []) {
    if (label.scope && !scopes.includes(label.scope)) scopes.push(label.scope);
  }
  for (const scope of scopes) {
    groupings.push(labelScopeGrouping(scope, context.labels ?? []));
  }
  return groupings;
}

/** The grouping `?group=` names, or the first one, which is always State. */
export function groupingFrom(groupings: Grouping[], id: string | undefined): Grouping {
  return groupings.find((grouping) => grouping.id === id) ?? groupings[0]!;
}
