import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labelText } from "@/lib/labels";
import { orpc } from "@/lib/orpc";

interface PickerProps {
  issueKey: string;
  labels: Array<{ id: string; scope: string | null; name: string; color: string }>;
}

/**
 * Toggling a Label sends the whole selection, because the one-per-scope rule
 * is resolved server-side: choosing a second `epic:` replaces the first.
 */
export function LabelPicker({ issueKey, labels }: PickerProps) {
  const queryClient = useQueryClient();
  const all = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  const setLabels = useMutation(
    orpc.issues.setLabels.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.issues.key() }),
    }),
  );

  const on = new Set(labels.map((label) => label.id));
  const toggle = (id: string) => {
    // The chosen one goes last, so it wins its scope.
    const next = on.has(id)
      ? labels.filter((label) => label.id !== id).map((label) => label.id)
      : [...labels.map((label) => label.id), id];
    setLabels.mutate({ key: issueKey, labelIds: next });
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">Labels</h2>
      <div role="group" aria-label="Labels" className="flex flex-wrap gap-2">
        {all.data?.labels.map((label) => (
          <Button
            key={label.id}
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-0"
            disabled={setLabels.isPending}
            onClick={() => toggle(label.id)}
          >
            <Badge
              variant={on.has(label.id) ? "default" : "outline"}
              style={on.has(label.id) ? { backgroundColor: label.color, color: "#fff" } : undefined}
            >
              {labelText(label)}
            </Badge>
          </Button>
        ))}
        {all.data?.labels.length === 0 ? (
          <span className="text-sm text-muted-foreground">
            No Labels defined yet. Add some under Settings.
          </span>
        ) : null}
      </div>
      {setLabels.error ? (
        <p className="text-sm text-destructive">{setLabels.error.message}</p>
      ) : null}
    </section>
  );
}
