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
import { orpc } from "@/lib/orpc";

/** Labels are defined once for the Workspace; an Issue carries at most one per scope. */
export function LabelsPage() {
  const queryClient = useQueryClient();
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.labels.key() });

  const [scope, setScope] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");

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
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Labels</h1>
        <p className="text-sm text-muted-foreground">
          Plain like <code>backend</code>, or scoped like <code>epic: Checkout rewrite</code>. An
          Issue carries at most one Label per scope.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
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
        <div className="flex flex-1 flex-col gap-2">
          <FieldLabel htmlFor="label-name">Name</FieldLabel>
          <Input
            id="label-name"
            value={name}
            placeholder="backend"
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor="label-color">Colour</FieldLabel>
          <Input
            id="label-color"
            type="color"
            className="w-16"
            value={color}
            onChange={(changed) => setColor(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          Add Label
        </Button>
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
    </section>
  );
}
