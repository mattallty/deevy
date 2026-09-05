import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/diceui/sortable";
import { useEffect, useState } from "react";
import { ApproversPicker } from "@/components/approvers-picker";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DraftState,
  type StateCategory,
  StateFields,
  newDraftState,
} from "@/components/workflow-state-fields";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

/**
 * The ordered State editor. A team that wants Todo, Doing, Done deletes the
 * middle (docs/PLAN.md), which is why deleting is as ordinary here as renaming.
 */
export function WorkflowPage({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  // Every Agent in the Workspace, because a State's rule names one of them.
  const agents = useQuery(orpc.agents.list.queryOptions({ input: {} }));
  // And every Member, because a Gate's approvers are Humans among them.
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const [draft, setDraft] = useState<DraftState[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [moveIssuesTo, setMoveIssuesTo] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // The server's Workflow is the starting point; edits are local until saved.
  useEffect(() => {
    if (workflow.data && draft === null) {
      setDraft(
        workflow.data.states.map((state) => ({
          uid: state.id,
          id: state.id,
          name: state.name,
          isGate: state.isGate,
          category: state.category as StateCategory,
          documentName: state.documentName,
          documentTemplate: state.documentTemplate,
          triggerAgentMemberId: state.triggerAgentMemberId,
          approverMemberIds: state.approverMemberIds ?? [],
        })),
      );
    }
  }, [workflow.data, draft]);

  const save = useMutation(
    orpc.workflow.update.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        setRemoved([]);
        setMoveIssuesTo(null);
        await queryClient.invalidateQueries({ queryKey: orpc.workflow.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
      },
    }),
  );

  if (workflow.isPending || draft === null) return <Skeleton className="h-64 w-full" />;
  if (workflow.isError) {
    return (
      <p className="text-destructive">Could not load the Workflow: {workflow.error.message}</p>
    );
  }

  // ADR-0004: an Agent never decides a Gate, so it is never on offer as one of
  // its approvers. A suspended Human decides nothing either.
  const humans = (members.data?.members ?? []).filter(
    (member) => member.kind === "human" && !member.suspendedAt,
  );

  const edit = (at: number, change: Partial<DraftState>) =>
    setDraft(draft.map((state, index) => (index === at ? { ...state, ...change } : state)));

  const swap = (at: number, with_: number) => {
    if (with_ < 0 || with_ >= draft.length) return;
    const next = [...draft];
    [next[at], next[with_]] = [next[with_]!, next[at]!];
    setDraft(next);
  };

  const drop = (at: number) => {
    const state = draft[at];
    if (state?.id) setRemoved([...removed, state.id]);
    setDraft(draft.filter((_, index) => index !== at));
    setSelectedUid(draft[at + 1]?.uid ?? draft[at - 1]?.uid ?? null);
  };

  // The picked layout (docs/plans/ui-redesign-2.md slice H): the order on the
  // left, one State's rules on the right. What is unsaved is counted in the footer.
  const current = draft.find((state) => state.uid === selectedUid) ?? draft[0] ?? null;
  const at = current ? draft.indexOf(current) : -1;
  const original = new Map((workflow.data?.states ?? []).map((state) => [state.id, state]));
  const isDirty = (state: DraftState) => {
    const was = state.id ? original.get(state.id) : undefined;
    if (!was) return true;
    return (
      was.name !== state.name ||
      was.isGate !== state.isGate ||
      was.category !== state.category ||
      (was.documentName ?? null) !== state.documentName ||
      (was.documentTemplate ?? null) !== state.documentTemplate ||
      (was.triggerAgentMemberId ?? null) !== state.triggerAgentMemberId ||
      [...(was.approverMemberIds ?? [])].sort().join() !==
        [...state.approverMemberIds].sort().join()
    );
  };
  const moved = draft.filter(
    (state, index) => state.id && (workflow.data?.states ?? [])[index]?.id !== state.id,
  ).length;
  const changes = draft.filter(isDirty).length + removed.length + (moved > 0 ? 1 : 0);

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-base font-semibold">Workflow</h2>
        <p className="text-sm text-muted-foreground">
          The States {projectKey} Issues move through, in order. A Gate is one an Issue cannot leave
          without a Human&apos;s approval, and a State that names an Agent hands it the Issue and
          starts a Run the moment one arrives. Pick a State to edit its rules; drag, or use the
          arrows, to reorder.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Sortable value={draft} onValueChange={setDraft} getItemValue={(state) => state.uid}>
          <SortableContent asChild>
            <ul aria-label="States" className="flex flex-col gap-1">
              {draft.map((state, index) => (
                <SortableItem key={state.uid} value={state.uid} asChild>
                  <li
                    className={cn(
                      "flex items-center gap-1 rounded-md",
                      state.uid === current?.uid && "bg-accent",
                    )}
                    {...(isDirty(state) ? { "data-dirty": "true" } : {})}
                  >
                    <SortableItemHandle
                      aria-label={`Drag ${state.name}`}
                      className="px-1.5 text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="size-4" />
                    </SortableItemHandle>
                    <button
                      type="button"
                      aria-label={`Edit ${state.name}`}
                      aria-current={state.uid === current?.uid ? "true" : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent"
                      onClick={() => setSelectedUid(state.uid)}
                    >
                      <span className="w-4 font-mono text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <StateBadge state={state} />
                      {isDirty(state) ? (
                        <span
                          aria-label="unsaved"
                          className="ml-auto size-1.5 shrink-0 rounded-full bg-gate"
                        />
                      ) : null}
                    </button>
                  </li>
                </SortableItem>
              ))}
            </ul>
          </SortableContent>
          <SortableOverlay />
        </Sortable>

        {current ? (
          <form
            aria-label={current.name}
            className={cn(
              "flex flex-col gap-4 rounded-lg border bg-card p-4",
              current.isGate && "border-gate/40 bg-gate/5",
            )}
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="flex items-center gap-3">
              <StateBadge state={current} size="md" />
              <span className="font-mono text-xs text-muted-foreground">Step {at + 1}</span>
              <span className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${current.name} up`}
                disabled={at <= 0}
                onClick={() => swap(at, at - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${current.name} down`}
                disabled={at >= draft.length - 1}
                onClick={() => swap(at, at + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${current.name}`}
                onClick={() => drop(at)}
              >
                <Trash2 />
              </Button>
            </div>
            <StateFields
              state={current}
              index={at}
              humans={humans}
              agents={agents.data?.agents ?? []}
              onEdit={(change) => edit(at, change)}
              renderTemplate={(state, onEdit) => (
                <div className="max-h-96 overflow-y-auto rounded-md border">
                  <MarkdownEditor
                    mode="block"
                    aria-label={`Template for ${state.name}`}
                    value={state.documentTemplate ?? ""}
                    onChange={(next) => onEdit({ documentTemplate: next })}
                    rows={8}
                    placeholder="## Problem"
                  />
                </div>
              )}
              renderApprovers={(state, onEdit) => (
                <ApproversPicker
                  id={`state-approvers-${String(at)}`}
                  humans={humans}
                  value={state.approverMemberIds}
                  onChange={(approverMemberIds) => onEdit({ approverMemberIds })}
                />
              )}
            />
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            No States. Add one to give the work a path.
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-end gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const added = newDraftState();
            setDraft([...draft, added]);
            setSelectedUid(added.uid);
          }}
        >
          Add State
        </Button>

        {removed.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="move-issues-to">Move Issues in deleted States to</Label>
            <NativeSelect
              id="move-issues-to"
              value={moveIssuesTo ?? ""}
              onChange={(changed) => setMoveIssuesTo(changed.target.value || null)}
            >
              <option value="">Nowhere (fails if any hold Issues)</option>
              {draft
                .filter((state) => state.id)
                .map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
        ) : null}

        <span className="flex-1 text-sm text-muted-foreground">
          {changes === 0
            ? "No changes"
            : `${String(changes)} unsaved ${changes === 1 ? "change" : "changes"}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={changes === 0}
          onClick={() => {
            setDraft(null);
            setRemoved([]);
          }}
        >
          Reset
        </Button>
        <Button
          type="button"
          disabled={
            save.isPending || draft.length === 0 || draft.some((state) => !state.name.trim())
          }
          onClick={() =>
            save.mutate({
              projectKey,
              states: draft.map((state) => ({
                id: state.id,
                name: state.name.trim(),
                isGate: state.isGate,
                category: state.category,
                documentName: state.documentName,
                documentTemplate: state.documentTemplate,
                triggerAgentMemberId: state.triggerAgentMemberId,
                // A State that is not a Gate names nobody, whatever it named
                // while it was one: the list and the flag never disagree.
                approverMemberIds: state.isGate ? state.approverMemberIds : [],
              })),
              deleteStates: removed,
              moveIssuesTo,
            })
          }
        >
          Save Workflow
        </Button>
      </div>

      {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
    </section>
  );
}
