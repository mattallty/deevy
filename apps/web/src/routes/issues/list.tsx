import { useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ClipboardList, SearchX } from "lucide-react";
import { DataTable, type DataColumn, type DataGroup } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { IssueBoard, type BoardColumn, type BoardIssue } from "@/components/issue-board";
import {
  ISSUE_PAGE,
  IssueFilters,
  issueFilterInput,
  type FilterState,
  type IssuesSearch,
} from "@/components/issue-filters";
import { MemberChip } from "@/components/member-chip";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { StateBadge } from "@/components/state-badge";
import { LabelBadge } from "@/components/label-badge";
import { orpc } from "@/lib/orpc";
import { useRowSelection } from "@/lib/row-selection";
import { foldStates } from "@/lib/states";
import { groupingFrom, groupingsFor } from "@/lib/groupings";
import { ago } from "@/lib/time";

type IssueRow = Awaited<
  ReturnType<typeof import("@/lib/orpc").client.issues.list>
>["issues"][number];

/** Which bucket a card belongs to, asked of the buckets the grouping made. */
function byBucket(buckets: Array<{ id: string; rows: Array<{ key: string }> }>) {
  const home = new Map<string, string>();
  for (const bucket of buckets) for (const row of bucket.rows) home.set(row.key, bucket.id);
  return (issue: BoardIssue) => home.get(issue.key) ?? "";
}

/**
 * The home screen: every Issue you may see, filtered by the URL, grouped by
 * State, with one open beside the list (docs/plans/ui-redesign.md slice 2).
 * One `issues.list` per view, and every filter is the server's
 * (`issueFilterInput`), so a count is a count and a match past the page is
 * said to exist rather than lost; the page holds the first ISSUE_PAGE.
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
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));

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

  const projectKey = fixedProject ?? search.project;
  const filterInput = issueFilterInput(search, myId, projectKey);
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: filterInput ?? { limit: ISSUE_PAGE },
      // "Me" cannot be asked for until we know who that is.
      enabled: filterInput !== null,
      // Changing a filter asks a new question, and the old answer stays on
      // screen until the new one lands: the count and the rows a Human was
      // reading do not blink out for a skeleton on the way.
      placeholderData: keepPreviousData,
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
        description:
          "Issues assigned to you will show up here. Check All Issues for everything else.",
      };
    }
    if (onlyFilter === "assignee" && search.assignee === "agents:me") {
      return {
        icon: ClipboardList,
        title: "Nothing assigned to your Agents",
        description:
          "Issues your Agents are working on will show up here. Check All Issues for everything else.",
      };
    }
    if (filtered) {
      return {
        icon: SearchX,
        title: "No Issues match your filters",
        description: "Try adjusting your filters, or clear them to see everything.",
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
        description: "Everything here has been closed. Switch to All to see them.",
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
      description: "Create your first Issue — press c, or use New Issue up top.",
    };
  })();

  const rows = useMemo(() => (issues.data?.issues ?? []) as IssueRow[], [issues.data]);
  const truncated = issues.data?.hasMore ?? false;

  // Every State name across the visible Projects, in Workflow order (lib/states.ts).
  const folded = useMemo(
    () => foldStates(projects.data?.projects ?? [], projectKey),
    [projects.data, projectKey],
  );
  const states = useMemo<FilterState[]>(
    () => folded.map(({ name, isGate, category }) => ({ name, isGate, category })),
    [folded],
  );

  const board = search.view === "board" && !fixedProject;

  // One grouping, drawn twice: the list renders its buckets as groups, the
  // board renders the same buckets as columns (lib/groupings.tsx).
  const groupings = useMemo(
    () =>
      groupingsFor({
        projects: projects.data?.projects ?? [],
        members: memberList,
        labels: labels.data?.labels ?? [],
        ...(projectKey ? { projectKey } : {}),
      }),
    [projects.data, memberList, labels.data, projectKey],
  );
  const grouping = useMemo(() => groupingFrom(groupings, search.group), [groupings, search.group]);
  const buckets = useMemo(() => grouping.buckets(rows), [grouping, rows]);

  const boardColumns = useMemo<BoardColumn[]>(
    () =>
      buckets
        // A column nothing is in is still somewhere to drop, but only where the
        // grouping says so — the list drops the same bucket for having no rows.
        .filter((bucket) => bucket.rows.length > 0 || bucket.keepWhenEmpty)
        .map((bucket) => ({
          id: bucket.id,
          name: bucket.name,
          header: bucket.header,
          ...(bucket.isGate === undefined ? {} : { isGate: bucket.isGate }),
          ...(bucket.plan ? { plan: bucket.plan } : {}),
          ...(bucket.refusal ? { refusal: bucket.refusal } : {}),
        })),
    [buckets],
  );
  // Memoised, or `IssueBoard`'s own `useMemo` over it never hits and the whole
  // board is re-bucketed on every render of this page.
  const columnOf = useMemo(() => byBucket(buckets), [buckets]);

  // Which buckets the Human has folded or unfolded away from their default.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  // A board is columns of something; only a list may say "no grouping".
  const grouped = board || search.group !== "none";
  const groups = useMemo<DataGroup<IssueRow>[] | undefined>(() => {
    if (!grouped) return undefined;
    return (
      buckets
        // A list drops an empty group; a board keeps the column.
        .filter((bucket) => bucket.rows.length > 0)
        .map((bucket) => ({
          id: bucket.id,
          header: bucket.header,
          rows: bucket.rows,
          collapsed: toggled.has(bucket.id)
            ? !bucket.collapsedByDefault
            : Boolean(bucket.collapsedByDefault),
          onToggle: () =>
            setToggled((current) => {
              const next = new Set(current);
              if (next.has(bucket.id)) next.delete(bucket.id);
              else next.add(bucket.id);
              return next;
            }),
        }))
    );
  }, [grouped, buckets, toggled]);

  // The rows as they are on screen, for j and k.
  const visibleIds = useMemo(
    () =>
      board
        ? buckets.flatMap((bucket) => bucket.rows.map((card) => card.key))
        : (groups ? groups.flatMap((g) => (g.collapsed ? [] : g.rows)) : rows).map((r) => r.key),
    [board, buckets, groups, rows],
  );
  const peek = (key: string) => onSearch({ peek: key });
  const openFull = (key: string) =>
    void navigate({ to: "/issues/$issueKey", params: { issueKey: key } });
  const { selected, select: setSelected } = useRowSelection(visibleIds, { peek, openFull });

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
      // A column that only repeats the group header earns nothing: grouped by
      // State the State column goes, grouped by Assignee the Assignee one does.
      ...(grouped && grouping.id === "state"
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
      ...(grouped && grouping.id === "assignee"
        ? []
        : [
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
          ]),
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
    [grouped, grouping.id],
  );

  const title =
    search.assignee === "me"
      ? "My Issues"
      : search.assignee === "agents:me"
        ? "My Agents' Issues"
        : search.project
          ? (projects.data?.projects.find((p) => p.key === search.project)?.name ?? search.project)
          : "All Issues";

  // "200+" when the page is full and more matched: a count that is not one says so.
  const count = issues.data
    ? `${String(rows.length)}${truncated ? "+" : ""} ${rows.length === 1 ? "Issue" : "Issues"}${search.open === "0" ? "" : " open"}`
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
      groupings={groupings}
      allowNoGrouping={!board}
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
          columnOf={columnOf}
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

      {truncated ? (
        <p role="status" className="text-xs text-muted-foreground">
          Showing the first {ISSUE_PAGE} Issues. Narrow the filters to see the rest.
        </p>
      ) : null}

      <SidePeek
        issueKey={search.peek ?? null}
        modal={!board}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={openFull}
      />
    </section>
  );
}
