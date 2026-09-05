import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useMemo, useState } from "react";
import { DataTable, type DataColumn, type DataGroup } from "@/components/data-table";
import { IssueFilters, type FilterState, type IssuesSearch } from "@/components/issue-filters";
import { MemberChip } from "@/components/member-chip";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { orpc } from "@/lib/orpc";
import { useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type IssueRow = Awaited<
  ReturnType<typeof import("@/lib/orpc").client.issues.list>
>["issues"][number];

const categoryOrder = { backlog: 0, active: 1, done: 2 } as const;

/** Relative, short: "3d", "2h", "just now". */
function ago(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (seconds < 60) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: false })
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

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
}: {
  search: IssuesSearch;
  onSearch: (patch: Partial<IssuesSearch>) => void;
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
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: {
        ...(search.project ? { projectKey: search.project } : {}),
        ...(assigneeMemberId ? { assigneeMemberId } : {}),
        ...(search.open === "0" ? {} : { open: true }),
        ...(search.q ? { q: search.q } : {}),
        limit: 200,
      },
      // "Me" cannot be asked for until we know who that is.
      enabled: search.assignee !== "me" || myId !== null,
    }),
  );

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

  // Every State name across the visible Projects, in Workflow order.
  const states = useMemo<FilterState[]>(() => {
    const seen = new Map<string, FilterState>();
    for (const project of projects.data?.projects ?? []) {
      if (search.project && project.key !== search.project) continue;
      for (const state of project.states) {
        if (!seen.has(state.name)) {
          seen.set(state.name, {
            name: state.name,
            isGate: state.isGate,
            category: state.category as FilterState["category"],
          });
        }
      }
    }
    return [...seen.values()].sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);
  }, [projects.data, search.project]);

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
    () => (groups ? groups.flatMap((g) => (g.collapsed ? [] : g.rows)) : rows).map((r) => r.key),
    [groups, rows],
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

  const columns: DataColumn<IssueRow>[] = [
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
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{row.title}</span>
          {row.labels.slice(0, 2).map((label) => (
            <Badge key={label.id} variant="outline" className="shrink-0 font-normal">
              {label.scope ? `${label.scope}: ${label.name}` : label.name}
            </Badge>
          ))}
          {row.labels.length > 2 ? (
            <span className="text-xs text-muted-foreground">+{row.labels.length - 2}</span>
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
        <span className="font-mono text-xs text-muted-foreground">{ago(row.updatedAt)}</span>
      ),
      sortValue: (row) => new Date(row.updatedAt).getTime(),
      className: "w-20 text-right",
      headerClassName: "text-right",
    },
  ];

  const title =
    search.assignee === "me"
      ? "My Issues"
      : search.assignee === "agents:me"
        ? "My Agents' Issues"
        : search.project
          ? (projects.data?.projects.find((p) => p.key === search.project)?.name ?? search.project)
          : "All Issues";

  return (
    <section className={cn("flex flex-col gap-4")}>
      <PageHeader
        title={title}
        description={
          issues.data
            ? `${String(rows.length)} ${rows.length === 1 ? "Issue" : "Issues"}${search.open === "0" ? "" : " open"}`
            : undefined
        }
      >
        <IssueFilters
          value={search}
          onChange={onSearch}
          projects={(projects.data?.projects ?? []).map(({ key, name }) => ({ key, name }))}
          states={states}
          members={memberList}
          sponsorsAgents={myAgentIds.size > 0}
        />
      </PageHeader>

      {issues.isError ? (
        <p className="text-destructive">Could not load Issues: {issues.error.message}</p>
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
          empty={{
            title: search.q ? "No Issues match" : "No Issues yet",
            description: search.q
              ? "Try another word, or clear the filters."
              : "Press c to create one. It starts in the first State of its Project's Workflow.",
          }}
        />
      )}

      <SidePeek
        issueKey={search.peek ?? null}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={openFull}
      />
    </section>
  );
}
