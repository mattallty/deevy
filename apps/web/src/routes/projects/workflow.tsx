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
  };

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-base font-semibold">Workflow</h2>
        <p className="text-sm text-muted-foreground">
          The States {projectKey} Issues move through, in order. A Gate is one an Issue cannot leave
          without a Human&apos;s approval, and a State that names an Agent hands it the Issue and
          starts a Run the moment one arrives.
        </p>
      </header>

      <Sortable value={draft} onValueChange={setDraft} getItemValue={(state) => state.uid}>
        <SortableContent asChild>
          <ul aria-label="States" className="flex flex-col gap-2">
            {draft.map((state, index) => (
              <SortableItem key={state.uid} value={state.uid} asChild>
                <li className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
                  <SortableItemHandle
                    aria-label={`Drag ${state.name}`}
                    className="mb-2 self-center text-muted-foreground hover:text-foreground"
                  >
                    <GripVertical className="size-4" />
                  </SortableItemHandle>
                  <div className="flex-1">
                    <StateFields
                      state={state}
                      index={index}
                      humans={humans}
                      agents={agents.data?.agents ?? []}
                      onEdit={(change) => edit(index, change)}
                    />
                  </div>
                  <div className="flex gap-1 pb-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${state.name} up`}
                      onClick={() => swap(index, index - 1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${state.name} down`}
                      onClick={() => swap(index, index + 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${state.name}`}
                      onClick={() => drop(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              </SortableItem>
            ))}
          </ul>
        </SortableContent>
        <SortableOverlay />
      </Sortable>

      <div className="flex flex-wrap items-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setDraft([...draft, newDraftState()])}
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

        <Button
          type="button"
          disabled={save.isPending || draft.length === 0}
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
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setDraft(null);
            setRemoved([]);
          }}
        >
          Reset
        </Button>
      </div>

      {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
    </section>
  );
}
