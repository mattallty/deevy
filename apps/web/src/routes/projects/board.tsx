import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { IssueBoard, type BoardColumn, type BoardIssue } from "@/components/issue-board";
import { IssueFilters, type FilterState, type IssuesSearch } from "@/components/issue-filters";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { orpc } from "@/lib/orpc";

/** On a Project's Board a column is one State. */
const byStateId = (issue: BoardIssue) => issue.state.id;

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
  const assigneeMemberId =
    search.assignee === "me"
      ? (myId ?? undefined)
      : search.assignee && !["agents:me", "none"].includes(search.assignee)
        ? search.assignee
        : undefined;
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: {
        projectKey,
        ...(assigneeMemberId ? { assigneeMemberId } : {}),
        ...(search.open === "0" ? {} : { open: true }),
        limit: 200,
      },
      enabled: search.assignee !== "me" || myId !== null,
    }),
  );

  const states = workflow.data?.states ?? [];
  const cards = useMemo(() => {
    const all = (issues.data?.issues ?? []) as unknown as BoardIssue[];
    return all.filter((issue) => {
      if (search.kind && issue.assignee?.kind !== search.kind) return false;
      if (search.assignee === "none" && issue.assignee) return false;
      if (search.assignee === "agents:me" && !(issue.assignee && myAgentIds.has(issue.assignee.id)))
        return false;
      return true;
    });
  }, [issues.data, search.kind, search.assignee, myAgentIds]);

  // One Project: a column is a State, and a drop lands in exactly that State.
  const columns = useMemo<BoardColumn[]>(
    () =>
      states.map((state) => ({
        id: state.id,
        name: state.name,
        isGate: state.isGate,
        category: state.category as FilterState["category"],
        resolveTarget: () => state.id,
      })),
    [states],
  );
  const filterStates: FilterState[] = states.map((state) => ({
    name: state.name,
    isGate: state.isGate,
    category: state.category as FilterState["category"],
  }));

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
          hideGroup
        />
      </PageHeader>

      <IssueBoard
        columns={columns}
        issues={cards}
        columnOf={byStateId}
        loading={workflow.isPending || issues.isPending}
        onOpen={(key) => onSearch({ peek: key })}
        onDragStart={() => search.peek && onSearch({ peek: undefined })}
      />

      <SidePeek
        issueKey={search.peek ?? null}
        modal={false}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={(key) => void navigate({ to: "/issues/$issueKey", params: { issueKey: key } })}
      />
    </section>
  );
}
