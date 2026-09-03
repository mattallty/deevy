import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/orpc";

const ANYONE = "anyone";

interface BoardIssue {
  id: string;
  key: string;
  title: string;
  state: { id: string; name: string; isGate: boolean };
  assignee: { id: string; user: { name: string } } | null;
  updatedAt: string | Date;
}

/**
 * The Project's Issues as one column per State. A Gate is a State an Issue
 * cannot leave without a Human's decision (CONTEXT.md), so dropping a card out
 * of a Gate column opens the decision dialog rather than moving it.
 */
export function BoardPage({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const [assignee, setAssignee] = useState(ANYONE);
  const [openOnly, setOpenOnly] = useState(true);
  const issues = useQuery(
    orpc.issues.list.queryOptions({
      input: {
        projectKey,
        ...(assignee === ANYONE ? {} : { assigneeMemberId: assignee }),
        ...(openOnly ? { open: true } : {}),
        limit: 200,
      },
    }),
  );

  const [deciding, setDeciding] = useState<BoardIssue | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
  const move = useMutation(orpc.issues.move.mutationOptions({ onSuccess: refresh }));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (workflow.isPending || issues.isPending) return <Skeleton className="h-96 w-full" />;
  if (workflow.isError) {
    return (
      <p className="text-destructive">Could not load the Workflow: {workflow.error.message}</p>
    );
  }
  if (issues.isError) {
    return <p className="text-destructive">Could not load Issues: {issues.error.message}</p>;
  }

  const cards = issues.data.issues as unknown as BoardIssue[];

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const card = cards.find((issue) => issue.id === active.id);
    const toStateId = String(over.id);
    if (!card || card.state.id === toStateId) return;
    // A Gate is left by a decision, never by a drop.
    if (card.state.isGate) {
      setDeciding(card);
      return;
    }
    move.mutate({ key: card.key, stateId: toStateId });
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Board</h1>
          <p className="text-sm text-muted-foreground">
            {projectKey} by State. Cards sort by when they last changed.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="board-assignee">Assignee</Label>
            <NativeSelect
              id="board-assignee"
              value={assignee}
              onChange={(changed) => setAssignee(changed.target.value)}
            >
              <option value={ANYONE}>Anyone</option>
              {members.data?.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.user.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="button" variant="outline" onClick={() => setOpenOnly(!openOnly)}>
            {openOnly ? "Open only" : "Open and closed"}
          </Button>
        </div>
      </header>

      {move.error ? <p className="text-sm text-destructive">{move.error.message}</p> : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {workflow.data.states.map((state) => (
            <Column
              key={state.id}
              state={state}
              issues={cards
                .filter((issue) => issue.state.id === state.id)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())}
              onDecide={setDeciding}
            />
          ))}
        </div>
      </DndContext>

      <GateDialog issue={deciding} onClose={() => setDeciding(null)} />
    </section>
  );
}

interface ColumnProps {
  state: { id: string; name: string; isGate: boolean };
  issues: BoardIssue[];
  onDecide: (issue: BoardIssue) => void;
}

function Column({ state, issues, onDecide }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: state.id });
  return (
    <section
      ref={setNodeRef}
      data-slot="board-column"
      aria-label={state.name}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
        isOver && "ring-2 ring-ring",
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-medium">{state.name}</h2>
        {state.isGate ? <Badge variant="outline">Gate</Badge> : null}
        <span className="ml-auto text-xs text-muted-foreground">{issues.length}</span>
      </header>
      {issues.map((issue) => (
        <Card key={issue.id} issue={issue} onDecide={onDecide} />
      ))}
    </section>
  );
}

function Card({ issue, onDecide }: { issue: BoardIssue; onDecide: (issue: BoardIssue) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
  });
  return (
    <article
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-background p-2 text-sm",
        isDragging && "opacity-60",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{issue.key}</span>
        {issue.state.isGate ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            aria-label={`Decide the ${issue.state.name} Gate on ${issue.key}`}
            onClick={() => onDecide(issue)}
          >
            Decide
          </Button>
        ) : null}
      </div>
      <Link
        to="/issues/$issueKey"
        params={{ issueKey: issue.key }}
        className="font-medium hover:underline"
      >
        {issue.title}
      </Link>
      {issue.assignee ? (
        <span className="text-xs text-muted-foreground">{issue.assignee.user.name}</span>
      ) : null}
    </article>
  );
}

function GateDialog({ issue, onClose }: { issue: BoardIssue | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const done = async () => {
    setNote("");
    onClose();
    await queryClient.invalidateQueries();
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
