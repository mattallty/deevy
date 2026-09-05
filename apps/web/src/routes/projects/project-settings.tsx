import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

const NO_TEAM = "";

/**
 * What a Project is called, what it is for, and whose it is — `projects.update`
 * and `projects.archive` had no UI until here (docs/plans/ui-redesign.md
 * slice 8). The key is not here: it prefixes every Issue and cannot change.
 */
export function ProjectSettingsPage({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const project = useQuery(orpc.projects.get.queryOptions({ input: { key: projectKey } }));
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  const me = useQuery(orpc.me.get.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
  const update = useMutation(orpc.projects.update.mutationOptions({ onSuccess: refresh }));
  const archive = useMutation(orpc.projects.archive.mutationOptions({ onSuccess: refresh }));

  const [draft, setDraft] = useState<{ name: string; description: string; teamId: string } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);

  if (project.isPending) return <Skeleton className="h-48 w-full" />;
  if (project.isError) return <p className="text-destructive">{project.error.message}</p>;

  const values = draft ?? {
    name: project.data.name,
    description: project.data.description ?? "",
    teamId: project.data.teamId ?? NO_TEAM,
  };
  const dirty = draft !== null;
  const admin = me.data?.member?.role === "admin";

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form
        className="flex flex-col gap-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          update.mutate(
            {
              key: projectKey,
              name: values.name.trim(),
              description: values.description.trim() === "" ? null : values.description,
              teamId: values.teamId === NO_TEAM ? null : values.teamId,
            },
            { onSuccess: () => setDraft(null) },
          );
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={values.name}
            onChange={(changed) => setDraft({ ...values, name: changed.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            rows={3}
            value={values.description}
            placeholder="What this Project is for."
            onChange={(changed) => setDraft({ ...values, description: changed.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-team">Team</Label>
          <NativeSelect
            id="project-team"
            value={values.teamId}
            onChange={(changed) => setDraft({ ...values, teamId: changed.target.value })}
          >
            <option value={NO_TEAM}>No Team</option>
            {(teams.data?.teams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">
            A Team owns a Project and can be mentioned; it is not a permission wall.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!dirty || update.isPending || !values.name.trim()}>
            Save
          </Button>
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          ) : null}
        </div>
        {update.error ? <p className="text-sm text-destructive">{update.error.message}</p> : null}
      </form>

      {admin && !project.data.archivedAt ? (
        <section className="flex flex-col gap-2 rounded-md border border-destructive/30 p-4">
          <h2 className="text-sm font-medium">Archive this Project</h2>
          <p className="text-sm text-muted-foreground">
            It leaves the Projects list and the Issues home. Its Issues and their Events stay: the
            log is the record.
          </p>
          <div className="flex gap-2">
            {confirming ? (
              <>
                <Button
                  variant="destructive"
                  disabled={archive.isPending}
                  onClick={() => archive.mutate({ key: projectKey })}
                >
                  Yes, archive {projectKey}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                Archive Project
              </Button>
            )}
          </div>
          {archive.error ? (
            <p className="text-sm text-destructive">{archive.error.message}</p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
