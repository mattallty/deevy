import { DataTable, LabelBadge, MemberChip, StateBadge } from "@deevy/design-system";
import { ClipboardList } from "lucide-react";
import { issues, states, type IssueRow } from "./lib/fixtures";

const columns = [
  {
    id: "key",
    header: "Key",
    cell: (row: IssueRow) => (
      <span className="font-mono text-xs text-muted-foreground">{row.key}</span>
    ),
    sortValue: (row: IssueRow) => row.key,
    className: "w-24",
  },
  {
    id: "title",
    header: "Title",
    cell: (row: IssueRow) => (
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="min-w-0 truncate font-medium">{row.title}</span>
        {row.labels.slice(0, 2).map((label) => (
          <LabelBadge key={label.id} label={label} className="shrink-0" />
        ))}
      </span>
    ),
    sortValue: (row: IssueRow) => row.title,
    className: "max-w-0 w-full",
  },
  {
    id: "state",
    header: "State",
    cell: (row: IssueRow) => <StateBadge state={row.state} />,
    sortValue: (row: IssueRow) => row.state.name,
    className: "w-36",
  },
  {
    id: "assignee",
    header: "Assignee",
    cell: (row: IssueRow) =>
      row.assignee ? (
        <MemberChip member={row.assignee} size="xs" />
      ) : (
        <span className="text-xs text-muted-foreground">Unassigned</span>
      ),
    sortValue: (row: IssueRow) => row.assignee?.user.name ?? "",
    className: "w-44",
  },
  {
    id: "updated",
    header: "Updated",
    cell: (row: IssueRow) => (
      <span className="font-mono text-xs text-muted-foreground">{row.updated}</span>
    ),
    className: "w-20 text-right",
    headerClassName: "text-right",
  },
];

/** The Issues list: key, title with Labels, State, Assignee, updated. */
export const Issues = () => (
  <DataTable
    aria-label="Issues"
    columns={columns}
    rows={issues}
    getRowId={(row) => row.key}
    selectedId="DEV-41"
  />
);

/** Grouped by State, one header row per group; a folded group shows only its header. */
export const GroupedByState = () => (
  <DataTable
    aria-label="Issues by State"
    columns={columns.filter((column) => column.id !== "state")}
    groups={[
      {
        id: "review",
        header: <StateBadge state={states.review} />,
        rows: issues.filter((i) => i.state === states.review),
      },
      {
        id: "active",
        header: <StateBadge state={states.inProgress} />,
        rows: issues.filter((i) => i.state === states.inProgress),
      },
      {
        id: "todo",
        header: <StateBadge state={states.todo} />,
        rows: issues.filter((i) => i.state === states.todo),
      },
      {
        id: "done",
        header: <StateBadge state={states.done} />,
        rows: issues.filter((i) => i.state === states.done),
        collapsed: true,
      },
    ]}
    getRowId={(row) => row.key}
  />
);

export const Comfortable = () => (
  <DataTable
    aria-label="Issues"
    columns={columns}
    rows={issues.slice(0, 3)}
    getRowId={(row) => row.key}
    density="comfortable"
  />
);

export const Loading = () => (
  <DataTable aria-label="Issues" columns={columns} rows={[]} getRowId={(row) => row.key} loading />
);

/** The words say what emptied the list. */
export const Empty = () => (
  <DataTable
    aria-label="Issues"
    columns={columns}
    rows={[]}
    getRowId={(row) => row.key}
    empty={{
      icon: ClipboardList,
      title: "No Issues match your filters",
      description: "Clear a filter, or widen the view.",
    }}
  />
);
