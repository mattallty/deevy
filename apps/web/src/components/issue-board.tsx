import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
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
 * A column of the board — one bucket of whatever the screen groups by
 * (`lib/groupings.tsx`), not a State in particular. `header` is what it draws,
 * `name` is what it is called, and `plan` says what a drop into it means; a
 * column with no `plan` takes no cards, which is how grouping by Project works.
 */
export interface BoardColumn {
  id: string;
  name: string;
  header: ReactNode;
  /** The Gate tint, which only a State column asks for. */
  isGate?: boolean;
  plan?: (issue: BoardIssue) => DropPlan;
}

export type DropPlan =
  | { kind: "none" }
  | { kind: "gate" }
  | { kind: "refused"; message: string }
  | { kind: "move"; stateId: string }
  | { kind: "assign"; memberId: string | null }
  | { kind: "labels"; labelIds: string[] };

/**
 * What a drop means, before anything is written. The board decides only the two
 * things true of every grouping — a card dropped where it already is does
 * nothing, and a column that takes no cards refuses — and the grouping's own
 * bucket decides the rest.
 */
export function planDrop(issue: BoardIssue, fromColumnId: string, column: BoardColumn): DropPlan {
  if (fromColumnId === column.id) return { kind: "none" };
  if (!column.plan) return { kind: "refused", message: `${column.name} takes no cards` };
  return column.plan(issue);
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
  const changedAt = new Map(issues.map((issue) => [issue, new Date(issue.updatedAt).getTime()]));
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => changedAt.get(b)! - changedAt.get(a)!);
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
 * The board, drawn: columns as `section[aria-label=<bucket>]`, the grouping's
 * own header and a count in each, Gate columns tinted, and — while a card is
 * dragged — every column it could not land in dimmed, so a refusal shows
 * before the drop.
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
          // Dimmed while a card is dragged that this column would not take, so
          // a refusal shows before the drop rather than as a warning after it.
          const from =
            dragging === null
              ? null
              : (Object.entries(value).find(([, cards]) => cards.includes(dragging))?.[0] ?? null);
          const refuses =
            dragging !== null &&
            from !== null &&
            planDrop(dragging, from, column).kind === "refused";
          return (
            <KanbanColumn
              key={column.id}
              value={column.id}
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
                {column.header}
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
    await Promise.all(
      [orpc.issues.key(), orpc.inbox.key(), orpc.runs.key()].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
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
