import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";

const categories = ["backlog", "active", "done"] as const;
type Category = (typeof categories)[number];

interface DraftState {
  id?: string;
  name: string;
  isGate: boolean;
  category: Category;
}

/**
 * The ordered State editor. A team that wants Todo, Doing, Done deletes the
 * middle (docs/PLAN.md), which is why deleting is as ordinary here as renaming.
 */
export function WorkflowPage({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const workflow = useQuery(orpc.workflow.get.queryOptions({ input: { projectKey } }));
  const [draft, setDraft] = useState<DraftState[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [moveIssuesTo, setMoveIssuesTo] = useState<string | null>(null);

  // The server's Workflow is the starting point; edits are local until saved.
  useEffect(() => {
    if (workflow.data && draft === null) {
      setDraft(
        workflow.data.states.map((state) => ({
          id: state.id,
          name: state.name,
          isGate: state.isGate,
          category: state.category as Category,
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
        await queryClient.invalidateQueries();
      },
    }),
  );

  if (workflow.isPending || draft === null) return <Skeleton className="h-64 w-full" />;
  if (workflow.isError) {
    return (
      <p className="text-destructive">Could not load the Workflow: {workflow.error.message}</p>
    );
  }

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
        <h1 className="text-2xl font-semibold">Workflow</h1>
        <p className="text-sm text-muted-foreground">
          The States {projectKey} Issues move through, in order. A Gate is one an Issue cannot leave
          without a Human&apos;s approval.
        </p>
      </header>

      <ul aria-label="States" className="flex flex-col gap-2">
        {draft.map((state, index) => (
          <li
            key={state.id ?? `new-${index}`}
            className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`state-name-${index}`}>Name</Label>
              <Input
                id={`state-name-${index}`}
                value={state.name}
                onChange={(changed) => edit(index, { name: changed.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`state-category-${index}`}>Counts as</Label>
              <NativeSelect
                id={`state-category-${index}`}
                value={state.category}
                onChange={(changed) => edit(index, { category: changed.target.value as Category })}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Checkbox
                id={`state-gate-${index}`}
                checked={state.isGate}
                onCheckedChange={(checked) => edit(index, { isGate: checked === true })}
              />
              <Label htmlFor={`state-gate-${index}`}>Gate</Label>
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
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setDraft([...draft, { name: "New State", isGate: false, category: "active" }])
          }
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
