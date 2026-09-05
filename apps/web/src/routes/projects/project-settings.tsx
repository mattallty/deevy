import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/lib/autosave";
import { orpc } from "@/lib/orpc";

const NO_TEAM = "";

/**
 * What a Project is called, what it is for, and whose it is — `projects.update`
 * and `projects.archive` had no UI until here (docs/plans/ui-redesign.md
 * slice 8). Every field saves itself (docs/plans/ui-redesign-2.md slice G):
 * text on blur or Enter, the Team on change, each sending only what changed;
 * one status line says Saving, Saved, or what went wrong. The key is not here:
 * it prefixes every Issue and cannot change.
 */
export function ProjectSettingsPage({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const project = useQuery(orpc.projects.get.queryOptions({ input: { key: projectKey } }));
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  const me = useQuery(orpc.me.get.queryOptions());
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
  const update = useMutation(orpc.projects.update.mutationOptions({ onSuccess: refresh }));
  const archive = useMutation(orpc.projects.archive.mutationOptions({ onSuccess: refresh }));

  type Change = { name?: string; description?: string | null; teamId?: string | null };
  const autosave = useAutosave<Change>((change) =>
    update.mutateAsync({ key: projectKey, ...change }),
  );

  // What the fields show: the server's values until a keystroke, then the draft.
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // A save landing resets the drafts to what the server now has.
  useEffect(() => {
    if (autosave.status === "saved") {
      setName(null);
      setDescription(null);
    }
  }, [autosave.status]);

  if (project.isPending) return <Skeleton className="h-48 w-full" />;
  if (project.isError) return <p className="text-destructive">{project.error.message}</p>;

  const shownName = name ?? project.data.name;
  const shownDescription = description ?? project.data.description ?? "";
  const teamId = project.data.teamId ?? NO_TEAM;
  const admin = me.data?.member?.role === "admin";

  const saveName = () => {
    const next = shownName.trim();
    if (!next) {
      setNameError("A Project needs a name");
      setName(null);
      return;
    }
    setNameError(null);
    if (next !== project.data.name) void autosave.saveNow({ name: next });
    else setName(null);
  };
  const saveDescription = () => {
    const next = shownDescription.trim() === "" ? null : shownDescription;
    if (next !== (project.data.description ?? null)) void autosave.saveNow({ description: next });
    else setDescription(null);
  };

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <form className="flex flex-col gap-4" onSubmit={(submitted) => submitted.preventDefault()}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={shownName}
            aria-invalid={nameError ? true : undefined}
            onChange={(changed) => {
              setNameError(null);
              setName(changed.target.value);
            }}
            onBlur={saveName}
            onKeyDown={(pressed) => {
              if (pressed.key === "Enter") {
                pressed.preventDefault();
                saveName();
              }
            }}
          />
          {nameError ? <p className="text-xs text-destructive">{nameError}</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            rows={3}
            value={shownDescription}
            placeholder="What this Project is for."
            onChange={(changed) => setDescription(changed.target.value)}
            onBlur={saveDescription}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-team">Team</Label>
          <NativeSelect
            id="project-team"
            value={teamId}
            onChange={(changed) =>
              void autosave.saveNow({
                teamId: changed.target.value === NO_TEAM ? null : changed.target.value,
              })
            }
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
        <p role="status" className="flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
          {autosave.status === "saving" ? "Saving…" : null}
          {autosave.status === "saved" ? "Saved" : null}
          {autosave.status === "error" ? (
            <>
              <span className="text-destructive">{autosave.error}</span>
              <Button type="button" variant="outline" size="xs" onClick={autosave.retry}>
                Retry
              </Button>
            </>
          ) : null}
          {autosave.status === "idle" ? "Changes save as you make them." : null}
        </p>
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
