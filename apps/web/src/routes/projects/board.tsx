import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { IssueBoard, type BoardColumn, type BoardIssue } from "@/components/issue-board";
import {
  ISSUE_PAGE,
  IssueFilters,
  issueFilterInput,
  type FilterState,
  type IssuesSearch,
} from "@/components/issue-filters";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { groupingFrom, groupingsFor } from "@/lib/groupings";
import { orpc } from "@/lib/orpc";
import { useRowSelection } from "@/lib/row-selection";

/** Which bucket a card belongs to, asked of the buckets the grouping made. */
function byBucket(buckets: Array<{ id: string; rows: Array<{ key: string }> }>) {
  const home = new Map<string, string>();
  for (const bucket of buckets) for (const row of bucket.rows) home.set(row.key, bucket.id);
  return (issue: BoardIssue) => home.get(issue.key) ?? "";
}

/**
 * The Project's Issues as one column per State (docs/plans/ui-redesign.md slice
 * 7), on the shared IssueBoard: a drop is a move, a Gate is left by a ruling,
 * filters are the same bar as the Issues home and ride in the URL; a click
 * opens the peek, non-modal here so a drag behind it still works.
 */
export function BoardPage({
  projectKey,
  search,
  onSearch,
}: {
  projectKey: string;
  search: IssuesSearch;
  onSearch: (patch: Partial<IssuesSearch>) => void;
}) {
  const navigate = useNavigate();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const me = useQuery(orpc.me.get.queryOptions());
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
  // The same question the Issues home asks, with this Project fixed; every
  // filter is the server's (components/issue-filters.tsx).
  const filterInput = issueFilterInput(search, myId, projectKey);
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: filterInput ?? { projectKey, limit: ISSUE_PAGE },
      enabled: filterInput !== null,
    }),
  );

  const states = workflow.data?.states ?? [];
  const cards = useMemo(
    () => (issues.data?.issues ?? []) as unknown as BoardIssue[],
    [issues.data],
  );

  // The same groupings the Issues home offers, with this Project fixed: its
  // States, unfolded, and no Project grouping where every Issue is this one's.
  const groupings = useMemo(
    () => groupingsFor({ workflowStates: states, members: memberList }),
    [states, memberList],
  );
  const grouping = useMemo(() => groupingFrom(groupings, search.group), [groupings, search.group]);
  const buckets = useMemo(() => grouping.buckets(cards), [grouping, cards]);
  const columns = useMemo<BoardColumn[]>(
    () =>
      buckets.map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        header: bucket.header,
        ...(bucket.isGate === undefined ? {} : { isGate: bucket.isGate }),
        ...(bucket.plan ? { plan: bucket.plan } : {}),
      })),
    [buckets],
  );
  const filterStates: FilterState[] = states.map((state) => ({
    name: state.name,
    isGate: state.isGate,
    category: state.category as FilterState["category"],
  }));

  // The cards as they are on screen, column by column, for j and k; Enter
  // peeks and o opens, as on the Issues home (lib/row-selection.ts).
  const visibleKeys = useMemo(
    () => buckets.flatMap((bucket) => bucket.rows.map((card) => card.key)),
    [buckets],
  );
  const peek = (key: string) => onSearch({ peek: key });
  const openFull = (key: string) =>
    void navigate({ to: "/issues/$issueKey", params: { issueKey: key } });
  const { selected, select } = useRowSelection(visibleKeys, { peek, openFull });

  if (workflow.isError) {
    return (
      <p className="text-destructive">Could not load the Workflow: {workflow.error.message}</p>
    );
  }
  if (issues.isError) {
    return <p className="text-destructive">Could not load Issues: {issues.error.message}</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Board"
        description={`${projectKey} by State. An Issue leaves a Gate by a ruling, not a drop.`}
      >
        <IssueFilters
          value={search}
          onChange={onSearch}
          projects={[]}
          states={filterStates}
          members={memberList}
          sponsorsAgents={myAgentIds.size > 0}
          hideProject
          groupings={groupings}
          allowNoGrouping={false}
        />
      </PageHeader>

      <IssueBoard
        columns={columns}
        issues={cards}
        columnOf={byBucket(buckets)}
        loading={workflow.isPending || issues.isPending}
        selectedKey={selected}
        onSelect={select}
        onOpen={peek}
        onDragStart={() => search.peek && onSearch({ peek: undefined })}
      />

      {issues.data?.hasMore ? (
        <p role="status" className="text-xs text-muted-foreground">
          Showing the first {ISSUE_PAGE} Issues. Narrow the filters to see the rest.
        </p>
      ) : null}

      <SidePeek
        issueKey={search.peek ?? null}
        modal={false}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={openFull}
      />
    </section>
  );
}
