import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardList, SearchX } from "lucide-react";
import { DataTable, type DataColumn, type DataGroup } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  IssueBoard,
  groupIntoColumns,
  type BoardColumn,
  type BoardIssue,
} from "@/components/issue-board";
import { IssueFilters, type FilterState, type IssuesSearch } from "@/components/issue-filters";
import { MemberChip } from "@/components/member-chip";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { StateBadge } from "@/components/state-badge";
import { LabelBadge } from "@/components/label-badge";
import { orpc } from "@/lib/orpc";
import { categoryOrder, foldStates } from "@/lib/states";
import { useShortcut } from "@/lib/shortcuts";
import { ago } from "@/lib/time";

type IssueRow = Awaited<
  ReturnType<typeof import("@/lib/orpc").client.issues.list>
>["issues"][number];

/** On the Workspace board a column is a State name, folded across Projects. */
const byStateName = (issue: BoardIssue) => issue.state.name;

/**
 * The home screen: every Issue you may see, filtered by the URL, grouped by
 * State, with one open beside the list (docs/plans/ui-redesign.md slice 2).
 * One `issues.list` per view — the server does the Project, Assignee and open
 * filters and the search; State, kind and "my Agents" fold client-side, since
 * they are about names and Sponsors the list already carries.
 */
export function IssuesPage({
  search,
  onSearch,
  fixedProject,
  embedded = false,
}: {
  search: IssuesSearch;
  onSearch: (patch: Partial<IssuesSearch>) => void;
  /** Under a Project's tab: that Project only, and no Project filter. */
  fixedProject?: string;
  /** No header of its own; the page around it has one. */
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const me = useQuery(orpc.me.get.queryOptions());
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));

  const myId = me.data?.member?.id ?? null;
  const memberList = members.data?.members ?? [];
  const myAgentIds = useMemo(
    () =>
      new Set(
        memberList
          .filter((member) => member.kind === "agent" && member.sponsorId === myId)
          .map((member) => member.id),
      ),
    [memberList, myId],
  );

  // What the server can filter, it filters.
  const assigneeMemberId =
    search.assignee === "me"
      ? (myId ?? undefined)
      : search.assignee && !["agents:me", "none"].includes(search.assignee)
        ? search.assignee
        : undefined;
  const projectKey = fixedProject ?? search.project;
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: {
        ...(projectKey ? { projectKey } : {}),
        ...(assigneeMemberId ? { assigneeMemberId } : {}),
        ...(search.open === "0" ? {} : { open: true }),
        ...(search.q ? { q: search.q } : {}),
        limit: 200,
      },
      // "Me" cannot be asked for until we know who that is.
      enabled: search.assignee !== "me" || myId !== null,
    }),
  );

  // What the empty state may say depends on what narrowed the list: a filter,
  // the default Open view over a list that is all closed, or nothing at all.
  const onlyFilter = (() => {
    const set = [
      search.q ? "q" : null,
      search.state ? "state" : null,
      search.assignee ? "assignee" : null,
      search.kind ? "kind" : null,
      !fixedProject && search.project ? "project" : null,
    ].filter(Boolean);
    return set.length === 1 ? set[0] : set.length === 0 ? null : "several";
  })();
  const filtered = onlyFilter !== null;
  const openOnly = search.open !== "0";
  // Asked once, only when the open view is empty and nothing else narrows it.
  const anyAtAll = useQuery(
    orpc.issues.list.queryOptions({
      input: { ...(projectKey ? { projectKey } : {}), limit: 1 },
      enabled: !filtered && openOnly && issues.data?.issues.length === 0,
    }),
  );
  const closedOnly = (anyAtAll.data?.issues.length ?? 0) > 0;
  const clearFilters = () =>
    onSearch({
      q: undefined,
      state: undefined,
      assignee: undefined,
      kind: undefined,
      ...(fixedProject ? {} : { project: undefined }),
    });
  const emptyState = (() => {
    if (onlyFilter === "assignee" && search.assignee === "me") {
      return {
        icon: ClipboardList,
        title: "Nothing assigned to you",
        description: "Issues assigned to you show here; All Issues has the rest.",
      };
    }
    if (onlyFilter === "assignee" && search.assignee === "agents:me") {
      return {
        icon: ClipboardList,
        title: "Nothing assigned to your Agents",
        description: "Issues your Agents hold show here; All Issues has the rest.",
      };
    }
    if (filtered) {
      return {
        icon: SearchX,
        title: "No Issues match your filters",
        description: "Try other filters, or clear them.",
        action: (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ),
      };
    }
    if (closedOnly) {
      return {
        icon: ClipboardList,
        title: "No open Issues",
        description: "Every Issue here is closed. All shows them.",
        action: (
          <Button variant="outline" size="sm" onClick={() => onSearch({ open: "0" })}>
            Show All
          </Button>
        ),
      };
    }
    return {
      icon: ClipboardList,
      title: "No Issues yet",
      description: "Press c to create one. It starts in the first State of its Project's Workflow.",
    };
  })();

  const rows = useMemo(() => {
    const all = (issues.data?.issues ?? []) as IssueRow[];
    return all.filter((issue) => {
      if (search.state && issue.state.name !== search.state) return false;
      if (search.kind && issue.assignee?.kind !== search.kind) return false;
      if (search.assignee === "none" && issue.assignee) return false;
      if (search.assignee === "agents:me" && !(issue.assignee && myAgentIds.has(issue.assignee.id)))
        return false;
      return true;
    });
  }, [issues.data, search.state, search.kind, search.assignee, myAgentIds]);

  // Every State name across the visible Projects, in Workflow order (lib/states.ts).
  const folded = useMemo(
    () => foldStates(projects.data?.projects ?? [], projectKey),
    [projects.data, projectKey],
  );
  const states = useMemo<FilterState[]>(
    () => folded.map(({ name, isGate, category }) => ({ name, isGate, category })),
    [folded],
  );

  // The board: a column per folded State name, plus one for any State a row is
  // in that no Workflow names (a stale cache, a race), so no card goes unshown.
  const board = search.view === "board" && !fixedProject;
  const boardColumns = useMemo<BoardColumn[]>(() => {
    const columns: BoardColumn[] = folded.map((state) => ({
      id: state.name,
      name: state.name,
      isGate: state.isGate,
      category: state.category,
      resolveTarget: (issue) => state.byProject.get(issue.projectId) ?? null,
    }));
    for (const row of rows) {
      if (columns.some((column) => column.id === row.state.name)) continue;
      columns.push({
        id: row.state.name,
        name: row.state.name,
        isGate: row.state.isGate,
        category: (row.state.category in categoryOrder
          ? row.state.category
          : "active") as FilterState["category"],
        resolveTarget: (issue) => (issue.state.name === row.state.name ? issue.state.id : null),
      });
    }
    return columns;
  }, [folded, rows]);
  const boardValue = useMemo(
    () => groupIntoColumns(boardColumns, rows as unknown as BoardIssue[], byStateName),
    [boardColumns, rows],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const grouped = search.group !== "none";
  const groups = useMemo<DataGroup<IssueRow>[] | undefined>(() => {
    if (!grouped) return undefined;
    const byState = new Map<string, IssueRow[]>();
    for (const row of rows) {
      byState.set(row.state.name, [...(byState.get(row.state.name) ?? []), row]);
    }
    const known = new Map(states.map((state) => [state.name, state]));
    // Workflow order, as `states` already has it: Intent before Spec before
    // Plan, not the alphabet's idea of it; a name no Workflow knows goes last.
    const rank = (name: string) => {
      const index = states.findIndex((state) => state.name === name);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...byState.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([name, list]) => {
        const state = known.get(name) ?? {
          name,
          isGate: list[0]?.state.isGate ?? false,
          category: (list[0]?.state.category ?? "active") as FilterState["category"],
        };
        // Done is folded unless asked: it is the past.
        const isCollapsed =
          collapsed.has(name) || (state.category === "done" && !collapsed.has(`!${name}`));
        return {
          id: name,
          header: <StateBadge state={state} />,
          rows: list,
          collapsed: isCollapsed,
          onToggle: () =>
            setCollapsed((current) => {
              const next = new Set(current);
              if (state.category === "done") {
                if (next.has(`!${name}`)) next.delete(`!${name}`);
                else next.add(`!${name}`);
              } else if (next.has(name)) next.delete(name);
              else next.add(name);
              return next;
            }),
        };
      });
  }, [grouped, rows, states, collapsed]);

  // The rows as they are on screen, for j and k.
  const visibleIds = useMemo(
    () =>
      board
        ? boardColumns.flatMap((column) => (boardValue[column.id] ?? []).map((card) => card.key))
        : (groups ? groups.flatMap((g) => (g.collapsed ? [] : g.rows)) : rows).map((r) => r.key),
    [board, boardColumns, boardValue, groups, rows],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const move = (delta: number) => {
    if (visibleIds.length === 0) return;
    const index = selected ? visibleIds.indexOf(selected) : -1;
    const next = Math.min(visibleIds.length - 1, Math.max(0, index + delta));
    setSelected(visibleIds[next] ?? null);
  };
  const peek = (key: string) => onSearch({ peek: key });
  const openFull = (key: string) =>
    void navigate({ to: "/issues/$issueKey", params: { issueKey: key } });

  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));
  useShortcut("arrowdown", () => move(1));
  useShortcut("arrowup", () => move(-1));
  useShortcut("enter", () => selected && peek(selected));
  useShortcut("o", () => selected && openFull(selected));
  useShortcut("escape", () => setSelected(null));

  const columns = useMemo<DataColumn<IssueRow>[]>(
    () => [
      {
        id: "key",
        header: "Key",
        cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.key}</span>,
        sortValue: (row) => row.key,
        className: "w-24",
      },
      {
        id: "title",
        header: "Title",
        cell: (row) => (
          // Clipped, so long Labels shorten the title instead of painting over the
          // next column; on a phone the Labels go and the title keeps the cell.
          <span className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span className="min-w-0 truncate font-medium">{row.title}</span>
            {row.labels.slice(0, 2).map((label) => (
              <LabelBadge key={label.id} label={label} className="hidden shrink-0 sm:inline-flex" />
            ))}
            {row.labels.length > 2 ? (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                +{row.labels.length - 2}
              </span>
            ) : null}
          </span>
        ),
        sortValue: (row) => row.title,
        className: "max-w-0 w-full",
      },
      ...(grouped
        ? []
        : [
            {
              id: "state",
              header: "State",
              cell: (row: IssueRow) => (
                <StateBadge
                  state={{
                    name: row.state.name,
                    isGate: row.state.isGate,
                    category: row.state.category as FilterState["category"],
                  }}
                />
              ),
              sortValue: (row: IssueRow) => row.state.name,
              className: "w-36",
            },
          ]),
      {
        id: "assignee",
        header: "Assignee",
        cell: (row) =>
          row.assignee ? (
            <MemberChip member={row.assignee} size="xs" />
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          ),
        sortValue: (row) => row.assignee?.user.name ?? "",
        className: "w-44",
      },
      {
        id: "updated",
        header: "Updated",
        cell: (row) => (
          <span className="font-mono text-xs text-muted-foreground">
            {ago(row.updatedAt, { short: true })}
          </span>
        ),
        sortValue: (row) => new Date(row.updatedAt).getTime(),
        className: "w-20 text-right",
        headerClassName: "text-right",
      },
    ],
    [grouped],
  );

  const title =
    search.assignee === "me"
      ? "My Issues"
      : search.assignee === "agents:me"
        ? "My Agents' Issues"
        : search.project
          ? (projects.data?.projects.find((p) => p.key === search.project)?.name ?? search.project)
          : "All Issues";

  const count = issues.data
    ? `${String(rows.length)} ${rows.length === 1 ? "Issue" : "Issues"}${search.open === "0" ? "" : " open"}`
    : undefined;
  const filters = (
    <IssueFilters
      value={search}
      onChange={onSearch}
      projects={(projects.data?.projects ?? []).map(({ key, name }) => ({ key, name }))}
      states={states}
      members={memberList}
      sponsorsAgents={myAgentIds.size > 0}
      hideProject={Boolean(fixedProject)}
      hideGroup={board}
      showView={!fixedProject}
    />
  );

  return (
    <section className="flex flex-1 flex-col gap-4">
      {embedded ? (
        <div className="flex flex-wrap items-center gap-3">
          {filters}
          {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
        </div>
      ) : (
        <PageHeader title={title} description={count}>
          {filters}
        </PageHeader>
      )}

      {issues.isError ? (
        <p className="text-destructive">Could not load Issues: {issues.error.message}</p>
      ) : board ? (
        <IssueBoard
          columns={boardColumns}
          issues={rows as unknown as BoardIssue[]}
          columnOf={byStateName}
          loading={issues.isPending}
          selectedKey={selected}
          onSelect={setSelected}
          onOpen={peek}
          onDragStart={() => search.peek && onSearch({ peek: undefined })}
        />
      ) : (
        <DataTable
          aria-label="Issues"
          columns={columns}
          {...(groups ? { groups } : { rows })}
          getRowId={(row) => row.key}
          selectedId={selected}
          onSelect={setSelected}
          onOpen={peek}
          loading={issues.isPending}
          empty={emptyState}
        />
      )}

      <SidePeek
        issueKey={search.peek ?? null}
        modal={!board}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={openFull}
      />
    </section>
  );
}
