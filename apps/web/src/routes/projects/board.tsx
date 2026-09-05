import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { IssueFilters, type FilterState, type IssuesSearch } from "@/components/issue-filters";
import { MemberChip } from "@/components/member-chip";
import { PageHeader } from "@/components/page-header";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanMoveEvent,
} from "@/components/reui/kanban";
import { SidePeek } from "@/components/side-peek";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

interface BoardIssue {
  id: string;
  key: string;
  title: string;
  state: { id: string; name: string; isGate: boolean; category: string };
  assignee: {
    id: string;
    kind: "human" | "agent";
    handle?: string | null;
    user: { name: string; image?: string | null };
  } | null;
  labels: Array<{ id: string; name: string; scope: string | null }>;
  updatedAt: string | Date;
}

/**
 * The Project's Issues as one column per State, on the ReUI kanban (Base UI,
 * dnd-kit). A Gate is a State an Issue cannot leave without a Human's decision
 * (CONTEXT.md), so dropping a card out of a Gate column opens the decision
 * dialog rather than moving it; any other drop is `issues.move`. Filters are
 * the same bar as the Issues home and ride in the URL; a click opens the peek,
 * which is non-modal here so a drag behind it still works.
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
  const queryClient = useQueryClient();
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

  const [deciding, setDeciding] = useState<BoardIssue | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
  const move = useMutation(orpc.issues.move.mutationOptions({ onSuccess: refresh }));

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

  // The kanban's value: every State a column, cards newest change first.
  const columns = useMemo(() => {
    const byState: Record<string, BoardIssue[]> = {};
    for (const state of states) byState[state.id] = [];
    for (const card of cards) (byState[card.state.id] ??= []).push(card);
    for (const list of Object.values(byState)) {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return byState;
  }, [states, cards]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  function onMove({ event, activeContainer, overContainer }: KanbanMoveEvent) {
    if (activeContainer === overContainer) return;
    const card = cardById.get(String(event.active.id));
    if (!card) return;
    // A Gate is left by a decision, never by a drop.
    if (card.state.isGate) {
      setDeciding(card);
      return;
    }
    move.mutate({ key: card.key, stateId: overContainer });
  }

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
        description={`${projectKey} by State. A card leaves a Gate by a ruling, not a drop.`}
      >
        <IssueFilters
          value={search}
          onChange={onSearch}
          projects={[]}
          states={filterStates}
          members={memberList}
          sponsorsAgents={myAgentIds.size > 0}
          hideProject
          nativeAssignee
        />
      </PageHeader>

      {move.error ? <p className="text-sm text-destructive">{move.error.message}</p> : null}

      {workflow.isPending || issues.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Kanban
          value={columns}
          onValueChange={() => {}}
          getItemValue={(issue) => issue.id}
          onMove={onMove}
          onDragStart={() => search.peek && onSearch({ peek: undefined })}
        >
          <KanbanBoard className="flex auto-rows-auto items-start gap-3 overflow-x-auto pb-4 sm:grid-cols-none">
            {states.map((state) => {
              const inColumn = columns[state.id] ?? [];
              return (
                <KanbanColumn
                  key={state.id}
                  value={state.id}
                  disabled
                  render={<section data-slot="board-column" aria-label={state.name} />}
                  className={cn(
                    "flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
                    state.isGate && "border-gate/40 bg-gate/5",
                  )}
                >
                  <header className="flex items-center gap-2 px-1 py-0.5">
                    <StateBadge
                      state={{
                        name: state.name,
                        isGate: state.isGate,
                        category: state.category as FilterState["category"],
                      }}
                    />
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {inColumn.length}
                    </span>
                  </header>
                  <KanbanColumnContent value={state.id} className="flex flex-col gap-2">
                    {inColumn.map((issue) => (
                      <KanbanItem key={issue.id} value={issue.id}>
                        <KanbanItemHandle cursor={false}>
                          <BoardCard
                            issue={issue}
                            onOpen={() => onSearch({ peek: issue.key })}
                            onDecide={() => setDeciding(issue)}
                          />
                        </KanbanItemHandle>
                      </KanbanItem>
                    ))}
                  </KanbanColumnContent>
                </KanbanColumn>
              );
            })}
          </KanbanBoard>
          <KanbanOverlay>
            {({ value }) => {
              const issue = cardById.get(String(value));
              return issue ? (
                <BoardCard issue={issue} onOpen={() => {}} onDecide={() => {}} ghost />
              ) : null;
            }}
          </KanbanOverlay>
        </Kanban>
      )}

      <GateDialog issue={deciding} onClose={() => setDeciding(null)} />
      <SidePeek
        issueKey={search.peek ?? null}
        modal={false}
        onClose={() => onSearch({ peek: undefined })}
        onOpenFull={(key) => void navigate({ to: "/issues/$issueKey", params: { issueKey: key } })}
      />
    </section>
  );
}

function BoardCard({
  issue,
  onOpen,
  onDecide,
  ghost = false,
}: {
  issue: BoardIssue;
  onOpen: () => void;
  onDecide: () => void;
  ghost?: boolean;
}) {
  return (
    <article
      className={cn(
        "flex cursor-default flex-col gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs",
        ghost && "rotate-1 shadow-md",
      )}
      onClick={onOpen}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
        {issue.state.isGate ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto text-gate-foreground dark:text-gate"
            aria-label={`Decide the ${issue.state.name} Gate on ${issue.key}`}
            onClick={(event) => {
              event.stopPropagation();
              onDecide();
            }}
          >
            Decide
          </Button>
        ) : null}
      </div>
      <span className="font-medium">{issue.title}</span>
      {issue.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <Badge key={label.id} variant="outline" className="font-normal">
              {label.scope ? `${label.scope}: ${label.name}` : label.name}
            </Badge>
          ))}
        </div>
      ) : null}
      {issue.assignee ? <MemberChip member={issue.assignee} size="xs" /> : null}
    </article>
  );
}

function GateDialog({ issue, onClose }: { issue: BoardIssue | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const done = async () => {
    setNote("");
    onClose();
    await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
    await queryClient.invalidateQueries({ queryKey: orpc.inbox.key() });
  };
  const approve = useMutation(orpc.gates.approve.mutationOptions({ onSuccess: done }));
  const reject = useMutation(orpc.gates.reject.mutationOptions({ onSuccess: done }));
  const busy = approve.isPending || reject.isPending;

  return (
    <Dialog open={issue !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issue ? `${issue.state.name} Gate on ${issue.key}` : "Gate"}</DialogTitle>
          <DialogDescription>
            An Issue leaves a Gate on a Human&apos;s decision, not by being dragged.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="board-gate-note">Note</Label>
          <Textarea
            id="board-gate-note"
            rows={3}
            value={note}
            placeholder="Optional."
            onChange={(changed) => setNote(changed.target.value)}
          />
        </div>
        {(approve.error ?? reject.error) ? (
          <p className="text-sm text-destructive">{(approve.error ?? reject.error)?.message}</p>
        ) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy || !issue}
            onClick={() => issue && reject.mutate({ key: issue.key, note: note.trim() || null })}
          >
            Reject
          </Button>
          <Button
            disabled={busy || !issue}
            onClick={() => issue && approve.mutate({ key: issue.key, note: note.trim() || null })}
          >
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
