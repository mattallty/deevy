import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MemberChip } from "@/components/member-chip";
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
import { StateBadge } from "@/components/state-badge";
import { LabelBadge } from "@/components/label-badge";
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
import type { StateCategory } from "@/lib/states";
import { cn } from "@/lib/utils";

export interface BoardIssue {
  id: string;
  key: string;
  title: string;
  projectId: string;
  state: { id: string; name: string; isGate: boolean; category: string };
  assignee: {
    id: string;
    kind: "human" | "agent";
    handle?: string | null;
    user: { name: string; image?: string | null };
  } | null;
  labels: Array<{ id: string; name: string; scope: string | null; color: string }>;
  updatedAt: string | Date;
}

/**
 * A column of the board. On a Project's Board a column is one State; on the
 * Workspace board it is a State name folded across Projects, and
 * `resolveTarget` says which State a given Issue would land in — or null,
 * when its Project has none of that name and the drop must be refused.
 */
export interface BoardColumn {
  id: string;
  name: string;
  isGate: boolean;
  category: StateCategory;
  resolveTarget: (issue: BoardIssue) => string | null;
}

export type DropPlan =
  | { kind: "none" }
  | { kind: "gate" }
  | { kind: "refused"; message: string }
  | { kind: "move"; stateId: string };

/** What a drop means, before anything is written: nothing, a ruling, a refusal, or a move. */
export function planDrop(issue: BoardIssue, fromColumnId: string, column: BoardColumn): DropPlan {
  if (fromColumnId === column.id) return { kind: "none" };
  // A Gate is left by a decision, never by a drop.
  if (issue.state.isGate) return { kind: "gate" };
  const stateId = column.resolveTarget(issue);
  if (!stateId) {
    const projectKey = issue.key.split("-")[0] ?? issue.key;
    return { kind: "refused", message: `${projectKey} has no "${column.name}" State` };
  }
  return { kind: "move", stateId };
}

/** The kanban's value: every column, its cards newest change first. */
export function groupIntoColumns(
  columns: BoardColumn[],
  issues: BoardIssue[],
  columnOf: (issue: BoardIssue) => string,
): Record<string, BoardIssue[]> {
  const grouped: Record<string, BoardIssue[]> = {};
  for (const column of columns) grouped[column.id] = [];
  for (const issue of issues) (grouped[columnOf(issue)] ??= []).push(issue);
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return grouped;
}

export interface IssueBoardViewProps {
  columns: BoardColumn[];
  value: Record<string, BoardIssue[]>;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  onOpen: (key: string) => void;
  onDecide: (issue: BoardIssue) => void;
  onDrop: (issue: BoardIssue, fromColumnId: string, column: BoardColumn) => void;
  onDragStart?: () => void;
}

/**
 * The board, drawn: columns as `section[aria-label=State]`, a StateBadge and
 * a count in each header, Gate columns tinted, and — while a card is dragged —
 * every column it could not land in dimmed, so a refusal shows before the drop.
 */
export function IssueBoardView({
  columns,
  value,
  selectedKey = null,
  onSelect,
  onOpen,
  onDecide,
  onDrop,
  onDragStart,
}: IssueBoardViewProps) {
  const cardById = useMemo(
    () =>
      new Map(
        Object.values(value)
          .flat()
          .map((card) => [card.id, card]),
      ),
    [value],
  );
  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );
  const [dragging, setDragging] = useState<BoardIssue | null>(null);

  function onMove({ event, activeContainer, overContainer }: KanbanMoveEvent) {
    const card = cardById.get(String(event.active.id));
    const column = columnById.get(overContainer);
    if (!card || !column) return;
    onDrop(card, activeContainer, column);
  }

  return (
    <Kanban
      value={value}
      onValueChange={() => {}}
      getItemValue={(issue) => issue.id}
      onMove={onMove}
      onDragStart={(event) => {
        setDragging(cardById.get(String(event.active.id)) ?? null);
        onDragStart?.();
      }}
      onDragEnd={() => setDragging(null)}
      onDragCancel={() => setDragging(null)}
    >
      <KanbanBoard className="flex auto-rows-auto items-start gap-3 overflow-x-auto pb-4 sm:grid-cols-none">
        {columns.map((column) => {
          const inColumn = value[column.id] ?? [];
          const refuses =
            dragging !== null &&
            !dragging.state.isGate &&
            column.resolveTarget(dragging) === null &&
            column.id !==
              (Object.entries(value).find(([, cards]) => cards.includes(dragging))?.[0] ?? "");
          return (
            <KanbanColumn
              key={column.id}
              value={column.id}
              disabled
              render={
                <section
                  data-slot="board-column"
                  aria-label={column.name}
                  {...(refuses ? { "data-refuses": "true" } : {})}
                />
              }
              className={cn(
                "flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-opacity",
                column.isGate && "border-gate/40 bg-gate/5",
                refuses && "cursor-not-allowed opacity-40",
              )}
            >
              <header className="flex items-center gap-2 px-1 py-0.5">
                <StateBadge
                  state={{ name: column.name, isGate: column.isGate, category: column.category }}
                />
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {inColumn.length}
                </span>
              </header>
              <KanbanColumnContent value={column.id} className="flex flex-col gap-2">
                {inColumn.map((issue) => (
                  <KanbanItem key={issue.id} value={issue.id}>
                    <KanbanItemHandle cursor={false}>
                      <BoardCard
                        issue={issue}
                        selected={issue.key === selectedKey}
                        onSelect={() => onSelect?.(issue.key)}
                        onOpen={() => onOpen(issue.key)}
                        onDecide={() => onDecide(issue)}
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
        {({ value: id }) => {
          const issue = cardById.get(String(id));
          return issue ? (
            <BoardCard issue={issue} onOpen={() => {}} onDecide={() => {}} ghost />
          ) : null;
        }}
      </KanbanOverlay>
    </Kanban>
  );
}

/**
 * The board, connected: a drop is planned, then written as a move, opened as a
 * ruling, or refused with a word — through `issues.move` and the Gate dialog,
 * the same on a Project's Board and on the Workspace's.
 */
export function IssueBoard({
  columns,
  issues,
  columnOf,
  loading = false,
  selectedKey,
  onSelect,
  onOpen,
  onDragStart,
}: {
  columns: BoardColumn[];
  issues: BoardIssue[];
  columnOf: (issue: BoardIssue) => string;
  loading?: boolean;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  onOpen: (key: string) => void;
  onDragStart?: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
  const move = useMutation(orpc.issues.move.mutationOptions({ onSuccess: refresh }));
  const [deciding, setDeciding] = useState<BoardIssue | null>(null);
  const value = useMemo(
    () => groupIntoColumns(columns, issues, columnOf),
    [columns, issues, columnOf],
  );

  const onDrop = (issue: BoardIssue, from: string, column: BoardColumn) => {
    const plan = planDrop(issue, from, column);
    if (plan.kind === "gate") setDeciding(issue);
    else if (plan.kind === "refused") toast.warning(plan.message);
    else if (plan.kind === "move") move.mutate({ key: issue.key, stateId: plan.stateId });
  };

  return (
    <>
      {move.error ? <p className="text-sm text-destructive">{move.error.message}</p> : null}
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <IssueBoardView
          columns={columns}
          value={value}
          selectedKey={selectedKey ?? null}
          {...(onSelect ? { onSelect } : {})}
          onOpen={onOpen}
          onDecide={setDeciding}
          onDrop={onDrop}
          {...(onDragStart ? { onDragStart } : {})}
        />
      )}
      <GateDialog issue={deciding} onClose={() => setDeciding(null)} />
    </>
  );
}

export function BoardCard({
  issue,
  onOpen,
  onDecide,
  onSelect,
  selected = false,
  ghost = false,
}: {
  issue: BoardIssue;
  onOpen: () => void;
  onDecide: () => void;
  onSelect?: () => void;
  selected?: boolean;
  ghost?: boolean;
}) {
  return (
    <article
      {...(selected ? { "data-selected": "true", "aria-selected": true } : {})}
      className={cn(
        "flex cursor-default flex-col gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs",
        selected && "ring-2 ring-ring/50",
        ghost && "rotate-1 shadow-md",
      )}
      onClick={onOpen}
      onMouseEnter={onSelect}
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
      <span className="line-clamp-2 font-medium">{issue.title}</span>
      {issue.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <LabelBadge key={label.id} label={label} />
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
