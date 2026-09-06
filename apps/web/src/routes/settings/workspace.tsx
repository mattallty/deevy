import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPage, SettingsSection } from "@/components/settings-page";
import { AllowlistSection } from "@/routes/settings/allowlist";
import { orpc } from "@/lib/orpc";

/**
 * A self-hosted instance serves one Workspace: what it is called, and who may
 * join it. The Allowlist was a page of its own until 2026-09-07.
 */
export function WorkspacePage() {
  const queryClient = useQueryClient();
  const workspace = useQuery(orpc.workspace.get.queryOptions());
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (workspace.data && name === null) setName(workspace.data.name);
  }, [workspace.data, name]);

  const save = useMutation(
    orpc.workspace.update.mutationOptions({
      // The sidebar's name comes from me.get, so both re-read.
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.workspace.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.me.key() }),
        ]),
    }),
  );

  // The header and the Allowlist do not wait on `workspace.get`: only the name
  // itself is unknown while it loads, and this page has two concerns now.
  const loading = workspace.isPending || name === null;

  return (
    <SettingsPage
      title="Workspace"
      description={
        <>
          This instance serves one Workspace. Renaming it changes what everyone sees in the sidebar;
          the Allowlist below decides who may join it.
        </>
      }
    >
      <SettingsSection aria-label="Name">
        {workspace.isError ? (
          <p className="text-destructive">
            Could not load the Workspace: {workspace.error.message}
          </p>
        ) : loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
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
        )}

        {save.error ? <p className="text-sm text-destructive">{save.error.message}</p> : null}
        {save.isSuccess && !save.isPending ? (
          <p className="text-sm text-muted-foreground">Saved.</p>
        ) : null}
      </SettingsSection>

      <AllowlistSection />
    </SettingsPage>
  );
}
