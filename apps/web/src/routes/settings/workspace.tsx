import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPage } from "@/components/settings-page";
import { orpc } from "@/lib/orpc";

/** A self-hosted instance serves one Workspace; this is its name. */
export function WorkspacePage() {
  const queryClient = useQueryClient();
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (workspace.data && name === null) setName(workspace.data.name);
  }, [workspace.data, name]);

  const save = useMutation(
    orpc.workspace.update.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.workspace.key() }),
    }),
  );

  if (workspace.isPending || name === null) return <Skeleton className="h-32 w-full" />;
  if (workspace.isError) {
    return (
      <p className="text-destructive">Could not load the Workspace: {workspace.error.message}</p>
    );
  }

  return (
    <SettingsPage
      title="Workspace"
      description={
        <>
          This instance serves one Workspace. Renaming it changes what everyone sees in the sidebar.
        </>
      }
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (name.trim()) save.mutate({ name: name.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="workspace-name">Name</Label>
          <Input
            id="workspace-name"
            value={name}
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={save.isPending || !name.trim()}>
          Save
        </Button>
      </form>

      {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
      {save.isSuccess && !save.isPending ? (
        <p className="text-sm text-muted-foreground">Saved.</p>
      ) : null}
    </SettingsPage>
  );
}
