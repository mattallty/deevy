import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { labelText } from "@/lib/labels";
import { SettingsPage } from "@/components/settings-page";
import { labelColors } from "@/lib/label-colors";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

/** Labels are defined once for the Workspace; an Issue carries at most one per scope. */
export function LabelsPage() {
  const queryClient = useQueryClient();
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.labels.key() });

  const [scope, setScope] = useState("");
  const [name, setName] = useState("");
  const colors = labelColors();
  const [color, setColor] = useState(colors[0] ?? "#4f46e5");

  const create = useMutation(
    orpc.labels.create.mutationOptions({
      onSuccess: async () => {
        setScope("");
        setName("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.labels.delete.mutationOptions({ onSuccess: refresh }));
  const failed = create.error ?? remove.error;

  return (
    <SettingsPage
      title="Labels"
      description={
        <>
          Plain like <code>backend</code>, or scoped like <code>epic: Checkout rewrite</code>. An
          Issue carries at most one Label per scope.
        </>
      }
    >
      <form
        // One grid: a label line, then a 32px control row, so the four labels and the four controls each sit on one line.
        className="grid items-start gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto_auto]"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (name.trim()) {
            create.mutate({ scope: scope.trim() || null, name: name.trim(), color });
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="label-scope">Scope</FieldLabel>
          <Input
            id="label-scope"
            value={scope}
            placeholder="epic (optional)"
            onChange={(changed) => setScope(changed.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="label-name">Name</FieldLabel>
          <Input
            id="label-name"
            value={name}
            placeholder="backend"
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel id="label-color-label">Color</FieldLabel>
          {/* Eight colors in harmony with the palette, not a picker: a Label reads beside Human, Agent and Gate. */}
          <div
            role="radiogroup"
            aria-labelledby="label-color-label"
            className="flex h-8 items-center gap-1.5"
          >
            {colors.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="radio"
                aria-checked={candidate === color}
                aria-label={candidate}
                className={cn(
                  "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                  candidate === color ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
                )}
                style={{ background: candidate }}
                onClick={() => setColor(candidate)}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {/* An empty label line, so the button shares the control row. */}
          <FieldLabel aria-hidden className="invisible">
            Add
          </FieldLabel>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            Add Label
          </Button>
        </div>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {labels.isPending ? <Skeleton className="h-32 w-full" /> : null}

      {labels.data && labels.data.labels.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {labels.data.labels.map((label) => (
              <TableRow key={label.id}>
                <TableCell>
                  <Badge style={{ backgroundColor: label.color, color: "#fff" }}>
                    {labelText(label)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ labelId: label.id })}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {labels.data?.labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Labels yet.</p>
      ) : null}
    </SettingsPage>
  );
}
