import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc.ts";

const NO_TEAM = "none";

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  team: { name: string } | null;
}

/** Every Project in the Workspace, and the dialog that starts a new one. */
export function ProjectsPage() {
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const columns: DataColumn<ProjectRow>[] = [
    {
      id: "key",
      header: "Key",
      cell: (project) => <Badge variant="secondary">{project.key}</Badge>,
      className: "w-24",
    },
    {
      id: "name",
      header: "Project",
      cell: (project) => (
        <div className="flex min-w-0 flex-col">
          <Link
            to="/projects/$key"
            params={{ key: project.key }}
            className="font-medium hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {project.name}
          </Link>
          {project.description ? (
            <span className="truncate text-xs text-muted-foreground">{project.description}</span>
          ) : null}
        </div>
      ),
      sortValue: (project) => project.name,
      className: "max-w-0 w-full",
    },
    {
      id: "team",
      header: "Team",
      cell: (project) => (
        <span className="text-muted-foreground">{project.team ? project.team.name : "—"}</span>
      ),
      sortValue: (project) => project.team?.name ?? "",
      className: "w-48",
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each Project has a key, a Workflow, and optionally a Team that owns it.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>New Project</Button>
      </header>

      <NewProjectDialog open={open} onOpenChange={setOpen} />

      {projects.isError ? (
        <p className="text-destructive">Could not load Projects: {projects.error.message}</p>
      ) : (
        // The whole row opens the Project; the name stays a link for a middle click.
        <DataTable
          aria-label="Projects"
          columns={columns}
          rows={projects.data?.projects ?? []}
          getRowId={(project) => project.key}
          onOpen={(key) => void navigate({ to: "/projects/$key", params: { key } })}
          loading={projects.isPending}
          empty={{ title: "No Projects yet", description: "Create one to give the work a home." }}
        />
      )}
    </section>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [teamId, setTeamId] = useState(NO_TEAM);

  const create = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: async () => {
        setName("");
        setKey("");
        setTeamId(NO_TEAM);
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.projects.key() });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            The key prefixes every Issue in it, as in DEV-42. It cannot be changed later.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            create.mutate({
              name: name.trim(),
              key,
              teamId: teamId === NO_TEAM ? null : teamId,
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(changed) => setName(changed.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              value={key}
              placeholder="DEV"
              // Upper-cased as it is typed: the operation is strict about the key
              // rather than correcting it silently.
              onChange={(changed) => setKey(changed.target.value.toUpperCase())}
            />
            <p className="text-xs text-muted-foreground">Two to six uppercase letters.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-team">Team</Label>
            <Select value={teamId} onValueChange={(next) => setTeamId(next ?? NO_TEAM)}>
              <SelectTrigger id="project-team" className="w-full">
                <SelectValue>
                  {(selected: string) =>
                    selected === NO_TEAM
                      ? "No Team"
                      : (teams.data?.teams.find((team) => team.id === selected)?.name ?? "No Team")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>No Team</SelectItem>
                {teams.data?.teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim() || !key}>
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
